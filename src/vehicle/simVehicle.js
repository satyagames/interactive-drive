import * as THREE from 'three'

import { rebuild, rendering, settings } from '../config.js'
import { loadGLTF } from '../core/gltf.js'
import { applyMatcapMaterials, createMatcapMaterial } from '../render/materials.js'

/**
 * The 'sim' preset: the original force-based raycast vehicle. Selected with
 * `?vehicle=sim` (see `rebuild.vehicle.preset`); 'arcade2019' is the default.
 *
 * Raycast vehicle.
 *
 * One dynamic box body for the chassis, plus four springs simulated by casting
 * a ray straight down from each wheel anchor. Each grounded wheel contributes:
 *
 *   1. a spring + damper force along the chassis up axis  (suspension)
 *   2. a lateral impulse that cancels sideways slip       (tyre grip)
 *   3. a longitudinal force: engine / brake / rolling drag (traction)
 *
 * Both tyre forces are capped by a friction circle scaled by the wheel's own
 * suspension load, so an unloaded wheel (in the air, or the inside wheel of a
 * hard corner) simply stops gripping. That is what stops it feeling like a
 * sliding brick without needing a full tyre model.
 *
 * Axis convention: local -Z forward, +X right, +Y up.
 */

const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1)
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0)
const LOCAL_UP = new THREE.Vector3(0, 1, 0)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Below this the car is considered fallen out of the world. */
const FALL_LIMIT_Y = -30
/** Seconds upside-down and stationary before an automatic respawn. */
const STUCK_TIMEOUT = 2.5

export async function createSimVehicle({ scene, world, RAPIER, renderAssets }) {
  const { chassis, wheels: wheelSpec, model } = rebuild

  // ---- visuals ------------------------------------------------------------

  const object3D = new THREE.Group()
  object3D.name = 'vehicle'
  scene.add(object3D)

  /**
   * The `chassis-visual` group holds only the loaded GLTF body -- the
   * physics, camera and input paths never look inside it. `model.yawOffset`
   * corrects for the glTF spec's +Z-forward convention (this project drives
   * towards -Z).
   */
  const bodyGroup = new THREE.Group()
  bodyGroup.name = 'chassis-visual'
  bodyGroup.position.y = chassis.offsetY
  object3D.add(bodyGroup)

  const vehicleGltf = await loadGLTF(model.url)
  vehicleGltf.scene.rotation.y = model.yawOffset
  // The car carries no baked AO -- it moves, so there is nothing to bake
  // against. Its grounding comes from the shadow blob instead.
  applyMatcapMaterials(vehicleGltf.scene, renderAssets)
  bodyGroup.add(vehicleGltf.scene)

  const wheelGeometry = new THREE.CylinderGeometry(
    wheelSpec.radius, wheelSpec.radius, wheelSpec.width, 18,
  )
  // Cylinders are Y-aligned by default; stand it up as a wheel on the X axis.
  wheelGeometry.rotateZ(Math.PI / 2)
  const wheelMaterial = createMatcapMaterial(renderAssets, rendering.wheelMatcap)
  const hubMaterial = createMatcapMaterial(renderAssets, rendering.hubMatcap)

  /**
   * Wheel order is fixed: 0 = front-left, 1 = front-right,
   * 2 = rear-left, 3 = rear-right. The anti-roll pass relies on it.
   */
  const wheels = [
    { name: 'FL', front: true },
    { name: 'FR', front: true },
    { name: 'RL', front: false },
    { name: 'RR', front: false },
  ].map((base, index) => {
    const left = index % 2 === 0
    const anchor = new THREE.Vector3(
      left ? -wheelSpec.halfTrack : wheelSpec.halfTrack,
      wheelSpec.anchorY,
      base.front ? -wheelSpec.halfBase : wheelSpec.halfBase,
    )

    const mesh = new THREE.Mesh(wheelGeometry, wheelMaterial)
    mesh.rotation.order = 'YXZ'
    const hub = new THREE.Mesh(
      new THREE.BoxGeometry(wheelSpec.width + 0.02, 0.1, 0.1),
      hubMaterial,
    )
    mesh.add(hub)
    object3D.add(mesh)

    return {
      ...base,
      anchor,
      mesh,
      grounded: false,
      /** Anchor -> wheel-centre distance this step. */
      suspLength: settings.suspension.restLength,
      /** Spring force this step, newtons. Drives the friction circle. */
      load: 0,
      contact: new THREE.Vector3(),
      spin: 0,
    }
  })

  // ---- physics body -------------------------------------------------------

  const volume = chassis.size.x * chassis.size.y * chassis.size.z
  const density = chassis.mass / volume

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(chassis.spawn.x, chassis.spawn.y, chassis.spawn.z)
      .setRotation(chassis.spawnRotation)
      .setLinearDamping(settings.body.linearDamping)
      .setAngularDamping(settings.body.angularDamping)
      .setCcdEnabled(true),
  )

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      chassis.size.x / 2, chassis.size.y / 2, chassis.size.z / 2,
    )
      // Offsetting the collider is what actually moves the centre of mass,
      // since Rapier derives mass properties from collider geometry.
      .setTranslation(0, chassis.offsetY, 0)
      .setDensity(density)
      .setFriction(0.4)
      .setRestitution(0.05),
    body,
  )

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  // ---- scratch ------------------------------------------------------------
  // Reused every step; nothing here is allocated in the hot path.

  const quat = new THREE.Quaternion()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const position = new THREE.Vector3()
  const com = new THREE.Vector3()
  const linvel = new THREE.Vector3()
  const angvel = new THREE.Vector3()
  const anchorWorld = new THREE.Vector3()
  const rayDir = new THREE.Vector3()
  const pointVel = new THREE.Vector3()
  const lever = new THREE.Vector3()
  const wheelForward = new THREE.Vector3()
  const wheelRight = new THREE.Vector3()
  const scratch = new THREE.Vector3()

  const state = {
    speed: 0,
    forwardSpeed: 0,
    steerAngle: 0,
    groundedWheels: 0,
    airborne: false,
  }

  let stuckTimer = 0

  // ---- simulation ---------------------------------------------------------

  /** Called once per fixed physics step, before `world.step()`. */
  function update(dt, input) {
    const v = settings.vehicle
    const susp = settings.suspension

    // Rapier keeps user forces until they are reset, so clear last step's.
    body.resetForces(false)
    body.resetTorques(false)
    body.setLinearDamping(settings.body.linearDamping)
    body.setAngularDamping(settings.body.angularDamping)

    readBodyState()

    const mass = body.mass()
    const perWheelMass = mass / wheels.length
    const speed = state.speed
    const forwardSpeed = state.forwardSpeed

    // --- steering ---------------------------------------------------------
    const authority = steerAuthority(speed, v)
    const targetSteer = input.steer * v.maxSteerAngle * authority
    const rate = Math.abs(input.steer) > 0.01 ? v.steerSpeed : v.steerReturnSpeed
    state.steerAngle = damp(state.steerAngle, targetSteer, rate, dt)

    const braking = input.throttle < 0 && forwardSpeed > 0.6
    const restLength = susp.restLength
    const maxToi = restLength + wheelSpec.radius

    let grounded = 0

    for (const wheel of wheels) {
      anchorWorld.copy(wheel.anchor).applyQuaternion(quat).add(position)
      rayDir.copy(up).multiplyScalar(-1)

      ray.origin = anchorWorld
      ray.dir = rayDir

      const hit = world.castRay(ray, maxToi, true, undefined, undefined, undefined, body)

      if (!hit) {
        wheel.grounded = false
        wheel.load = 0
        wheel.suspLength = restLength
        continue
      }

      grounded += 1
      wheel.grounded = true
      wheel.suspLength = clamp(hit.timeOfImpact - wheelSpec.radius, 0, restLength)
      wheel.contact.copy(rayDir).multiplyScalar(hit.timeOfImpact).add(anchorWorld)

      // Velocity of the chassis at the contact point: v + w x r
      lever.copy(wheel.contact).sub(com)
      pointVel.copy(angvel).cross(lever).add(linvel)

      // --- 1. suspension spring + damper ---
      const compression = restLength - wheel.suspLength
      const springVel = pointVel.dot(up)
      const springForce = clamp(
        susp.stiffness * compression - susp.damping * springVel,
        0,
        susp.maxForce,
      )
      wheel.load = springForce
      body.addForceAtPoint(scratch.copy(up).multiplyScalar(springForce), wheel.contact, true)

      // Steered wheels get their own axes.
      wheelForward.copy(forward)
      wheelRight.copy(right)
      if (wheel.front && state.steerAngle !== 0) {
        wheelForward.applyAxisAngle(up, state.steerAngle)
        wheelRight.applyAxisAngle(up, state.steerAngle)
      }

      // Friction circle: a wheel can only push as hard as it is pressed down.
      const tyreLimit = v.tireFriction * springForce

      // --- 2. lateral grip ---
      // Space (brake) keeps its original handbrake role in this preset.
      const rearHandbrake = (input.handbrake || input.brake) && !wheel.front
      const gripScale = rearHandbrake ? v.handbrakeGripScale : 1
      const lateralVel = pointVel.dot(wheelRight)
      const lateralImpulse = clamp(
        -lateralVel * perWheelMass * v.lateralGrip * gripScale,
        -tyreLimit * dt,
        tyreLimit * dt,
      )
      body.applyImpulseAtPoint(
        scratch.copy(wheelRight).multiplyScalar(lateralImpulse),
        wheel.contact,
        true,
      )

      // --- 3. longitudinal: engine / brake / drag ---
      const longVel = pointVel.dot(wheelForward)
      let longForce = 0

      if (isDriven(wheel, v.drivetrain)) {
        if (input.throttle > 0) {
          const headroom = clamp(1 - Math.max(forwardSpeed, 0) / v.topSpeed, 0, 1)
          longForce += input.throttle * v.engineForce * headroom
        } else if (input.throttle < 0 && !braking) {
          const reverseTop = v.topSpeed * 0.45
          const headroom = clamp(1 - Math.max(-forwardSpeed, 0) / reverseTop, 0, 1)
          longForce += input.throttle * v.reverseForce * headroom
        }
      }

      // Braking and rolling resistance act on every grounded wheel.
      if (braking) longForce += input.throttle * v.brakeForce
      if (rearHandbrake) {
        longForce -= Math.sign(longVel) * Math.min(Math.abs(longVel) * 2200, v.handbrakeForce)
      }
      longForce -= longVel * v.rollingResistance

      longForce = clamp(longForce, -tyreLimit, tyreLimit)
      body.addForceAtPoint(
        scratch.copy(wheelForward).multiplyScalar(longForce),
        wheel.contact,
        true,
      )

      // Visual wheel spin. Forward travel (-Z) spins the wheel negatively
      // about its local +X axis.
      wheel.spin -= (longVel / wheelSpec.radius) * dt
    }

    applyAntiRoll()

    // --- chassis-level forces --------------------------------------------
    if (speed > 0.01) {
      body.addForce(scratch.copy(linvel).multiplyScalar(-v.airDrag * speed), true)
    }
    if (grounded > 0 && v.downforce > 0) {
      body.addForce(scratch.copy(up).multiplyScalar(-v.downforce * speed * speed), true)
    }
    if (grounded === 0) applyAirRighting()

    state.groundedWheels = grounded
    state.airborne = grounded === 0

    updateAutoRespawn(dt)
  }

  function readBodyState() {
    const r = body.rotation()
    quat.set(r.x, r.y, r.z, r.w)
    forward.copy(LOCAL_FORWARD).applyQuaternion(quat)
    right.copy(LOCAL_RIGHT).applyQuaternion(quat)
    up.copy(LOCAL_UP).applyQuaternion(quat)

    const t = body.translation()
    position.set(t.x, t.y, t.z)
    const c = body.worldCom()
    com.set(c.x, c.y, c.z)
    const lv = body.linvel()
    linvel.set(lv.x, lv.y, lv.z)
    const av = body.angvel()
    angvel.set(av.x, av.y, av.z)

    state.speed = linvel.length()
    state.forwardSpeed = linvel.dot(forward)
  }

  /**
   * Anti-roll bar: pushes the more-extended wheel of an axle down and the
   * more-compressed one up, which flattens the car in corners.
   */
  function applyAntiRoll() {
    const { antiRoll, restLength } = settings.suspension
    if (antiRoll <= 0) return

    for (const [li, ri] of [[0, 1], [2, 3]]) {
      const left = wheels[li]
      const rightWheel = wheels[ri]
      if (!left.grounded && !rightWheel.grounded) continue

      const travelL = left.grounded ? left.suspLength : restLength
      const travelR = rightWheel.grounded ? rightWheel.suspLength : restLength
      const force = (travelL - travelR) * antiRoll

      if (left.grounded) {
        body.addForceAtPoint(scratch.copy(up).multiplyScalar(-force), left.contact, true)
      }
      if (rightWheel.grounded) {
        body.addForceAtPoint(scratch.copy(up).multiplyScalar(force), rightWheel.contact, true)
      }
    }
  }

  /** Mid-air, gently rotate the chassis back towards level. */
  function applyAirRighting() {
    const strength = settings.body.airRighting
    if (strength <= 0) return

    scratch.copy(up).cross(WORLD_UP)
    const sin = scratch.length()
    if (sin < 1e-4) return

    const angle = Math.atan2(sin, up.dot(WORLD_UP))
    body.addTorque(scratch.divideScalar(sin).multiplyScalar(strength * angle), true)
  }

  function updateAutoRespawn(dt) {
    if (position.y < FALL_LIMIT_Y) {
      respawn()
      return
    }
    // Upside down and going nowhere -> put it back on its wheels.
    const flipped = up.dot(WORLD_UP) < -0.1
    stuckTimer = flipped && state.speed < 0.6 ? stuckTimer + dt : 0
    if (stuckTimer > STUCK_TIMEOUT) respawn()
  }

  /** Copy the simulated transform onto the meshes. Call once per frame. */
  function sync() {
    const t = body.translation()
    const r = body.rotation()
    object3D.position.set(t.x, t.y, t.z)
    object3D.quaternion.set(r.x, r.y, r.z, r.w)

    for (const wheel of wheels) {
      wheel.mesh.position.set(
        wheel.anchor.x,
        wheel.anchor.y - wheel.suspLength,
        wheel.anchor.z,
      )
      wheel.mesh.rotation.y = wheel.front ? state.steerAngle : 0
      wheel.mesh.rotation.x = wheel.spin
    }
  }

  /** Back to `point` ({ position, quaternion }), or the boot spawn without one. */
  function respawn(point) {
    body.setTranslation(point?.position ?? chassis.spawn, true)
    body.setRotation(point?.quaternion ?? chassis.spawnRotation, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.resetForces(true)
    body.resetTorques(true)

    state.steerAngle = 0
    stuckTimer = 0
    for (const wheel of wheels) {
      wheel.grounded = false
      wheel.load = 0
      wheel.suspLength = settings.suspension.restLength
      wheel.spin = 0
    }
    sync()
  }

  return {
    object3D,
    body,
    wheels,
    state,
    update,
    sync,
    respawn,
    /** The horn hop belongs to the arcade preset. */
    horn: () => false,
    get topSpeed() {
      return settings.vehicle.topSpeed
    },
    /** World-space position, valid after `sync()`. */
    get position() {
      return object3D.position
    },
    get quaternion() {
      return object3D.quaternion
    },
    get velocity() {
      return linvel
    },
  }
}

// ---- helpers --------------------------------------------------------------

function isDriven(wheel, drivetrain) {
  if (drivetrain === 'awd') return true
  return drivetrain === 'fwd' ? wheel.front : !wheel.front
}

/**
 * Steering authority as a function of speed.
 *
 * Two independent curves multiply together:
 *   - a ramp in from `lowSpeedSteerScale` at a standstill up to full authority
 *     at `steerRampSpeed`, so slow manoeuvring is gentle rather than twitchy;
 *   - a taper down to `highSpeedSteerScale` at `topSpeed`, so full lock at
 *     speed does not spin the car. Set that to 1 to disable the taper.
 */
function steerAuthority(speed, v) {
  const ramp = clamp(speed / Math.max(v.steerRampSpeed, 1e-3), 0, 1)
  const lowScale = lerp(v.lowSpeedSteerScale, 1, ramp)
  const fast = clamp(speed / Math.max(v.topSpeed, 1e-3), 0, 1)
  const highScale = lerp(1, v.highSpeedSteerScale, fast)
  return lowScale * highScale
}

/** Frame-rate independent exponential approach. */
function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
