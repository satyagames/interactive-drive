import * as THREE from 'three'

import { rebuild, settings } from '../config.js'

/**
 * The 'arcade2019' vehicle's physics: a Rapier DynamicRayCastVehicleController
 * plus the control model of the 2019 folio car (docs/pursuit-arena/01 §2.2).
 *
 * No meshes, no scene -- `arcadeVehicle.js` puts visuals on top, and
 * `debug/feelProbe.js` drives this directly in a throwaway world (in the
 * browser or under Node) to check it against docs/pursuit-arena/07.
 *
 * Config values are reference units; `scaled()` applies `rebuild.worldScale`
 * per the rules in doc 07 §3. Axis convention: local -Z forward, +X right,
 * +Y up. Wheel order: 0 FL, 1 FR, 2 RL, 3 RR.
 */

const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1)
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0)
const LOCAL_UP = new THREE.Vector3(0, 1, 0)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** The reference ran one step per 60 Hz frame; per-step impulses are normalised to that. */
const REFERENCE_STEP = 1 / 60
const REAR_WHEELS = [2, 3]

export function arcadeGravity() {
  return { x: 0, y: rebuild.arcade.gravity * rebuild.worldScale, z: 0 }
}

export function createArcadePhysics({ world, RAPIER, position, rotation }) {
  const s = rebuild.worldScale
  const { chassis, wheels: wheelSpec } = rebuild.arcade

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setLinearDamping(chassis.linearDamping)
      .setAngularDamping(chassis.angularDamping)
      .setCanSleep(false)
      .setCcdEnabled(true),
  )

  const half = {
    x: (chassis.width * s) / 2,
    y: (chassis.height * s) / 2,
    z: (chassis.depth * s) / 2,
  }
  const offsetUp = chassis.offsetUp * s
  // Solid-box inertia of the collider about the body origin, without the
  // parallel-axis term -- what cannon computed from the shape's AABB.
  const m = chassis.mass
  const inertia = {
    x: (m / 3) * (half.y ** 2 + half.z ** 2),
    y: (m / 3) * (half.x ** 2 + half.z ** 2),
    z: (m / 3) * (half.x ** 2 + half.y ** 2),
  }
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(0, offsetUp, 0)
      // Collider-local centre of mass, so it lands on the body origin.
      .setMassProperties(m, { x: 0, y: -offsetUp, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(chassis.friction)
      .setRestitution(chassis.restitution),
    body,
  )

  const controller = world.createVehicleController(body)
  controller.indexUpAxis = 1
  // (sic) the 0.20 typings name this setter `setIndexForwardAxis`.
  controller.setIndexForwardAxis = 2

  const wheels = [
    { name: 'FL', front: true, x: -1 },
    { name: 'FR', front: true, x: 1 },
    { name: 'RL', front: false, x: -1 },
    { name: 'RR', front: false, x: 1 },
  ].map((wheel) => {
    const connection = {
      x: wheel.x * wheelSpec.halfTrack * s,
      y: 0,
      z: wheel.front ? -wheelSpec.frontOffset * s : wheelSpec.backOffset * s,
    }
    controller.addWheel(
      connection,
      { x: 0, y: -1, z: 0 },
      // Axle along +X: with up = +Y this makes positive engine force mean
      // "forward (-Z)" and positive steering mean "left" (checked by the
      // feel probe's sanity rows -- the sign is easy to get backwards).
      { x: 1, y: 0, z: 0 },
      wheelSpec.restLength * s,
      wheelSpec.radius * s,
    )
    return { ...wheel, connection: new THREE.Vector3(connection.x, connection.y, connection.z) }
  })

  const state = {
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    steerAngle: 0,
    engineForce: 0,
    groundedWheels: 0,
    airborne: false,
    braking: false,
    reversing: false,
    boosting: false,
    sliding: false,
    flipped: false,
  }

  const quat = new THREE.Quaternion()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const linvel = new THREE.Vector3()
  const translation = new THREE.Vector3()
  const scratch = new THREE.Vector3()

  let flipTimer = 0
  let flipCooldown = 0
  let hopCooldown = 0

  function readBodyState() {
    const r = body.rotation()
    quat.set(r.x, r.y, r.z, r.w)
    forward.copy(LOCAL_FORWARD).applyQuaternion(quat)
    right.copy(LOCAL_RIGHT).applyQuaternion(quat)
    up.copy(LOCAL_UP).applyQuaternion(quat)
    const t = body.translation()
    translation.set(t.x, t.y, t.z)
    const v = body.linvel()
    linvel.set(v.x, v.y, v.z)

    state.speed = linvel.length()
    state.forwardSpeed = linvel.dot(forward)
    state.lateralSpeed = linvel.dot(right)
  }

  function applyLiveParameters(handbrake) {
    const a = settings.arcade
    for (let i = 0; i < wheels.length; i++) {
      controller.setWheelSuspensionStiffness(i, a.suspensionStiffness)
      controller.setWheelSuspensionCompression(i, a.dampingCompression)
      controller.setWheelSuspensionRelaxation(i, a.dampingRelaxation)
      controller.setWheelMaxSuspensionTravel(i, a.maxSuspensionTravel * s)
      controller.setWheelMaxSuspensionForce(i, a.maxSuspensionForce * s)
      controller.setWheelFrictionSlip(i, a.frictionSlip)
      const rearHandbrake = handbrake && !wheels[i].front
      controller.setWheelSideFrictionStiffness(
        i,
        a.sideFrictionStiffness * (rearHandbrake ? a.handbrakeSideFriction : 1),
      )
    }
  }

  /**
   * One fixed physics step, called before `world.step()`.
   * `input`: { throttle -1..1, steer -1 (right)..1 (left), brake, boost, handbrake }.
   */
  function update(dt, input) {
    const a = settings.arcade
    applyLiveParameters(input.handbrake)
    readBodyState()

    // Steering chases the input at a constant rate in both directions,
    // including back to centre -- the reference's linear steer.
    const targetSteer = input.steer * a.maxSteer
    const steerStep = a.steerRate * dt
    const steerDelta = targetSteer - state.steerAngle
    state.steerAngle += Math.abs(steerDelta) <= steerStep ? steerDelta : Math.sign(steerDelta) * steerStep
    controller.setWheelSteering(0, state.steerAngle)
    controller.setWheelSteering(1, state.steerAngle)

    // Drive: a constant force, gated (not faded) at the speed cap. Holding
    // the opposite direction always gets full force, so it doubles as a brake.
    const boost = Boolean(input.boost)
    const cap = (boost ? a.boostMaxSpeed : a.maxSpeed) * s
    const force = (boost ? a.boostEngineForce : a.engineForce) * s
    const goingForward = state.forwardSpeed > 0
    let engine = 0
    if (input.throttle > 0) {
      if (state.speed < cap || !goingForward) engine = force * input.throttle
    } else if (input.throttle < 0) {
      if (state.speed < cap || goingForward) engine = force * input.throttle
    }
    for (const i of REAR_WHEELS) controller.setWheelEngineForce(i, engine)
    state.engineForce = engine
    state.boosting = boost && input.throttle > 0
    state.reversing = input.throttle < 0

    const brake = input.brake ? a.brakeForce * s : 0
    for (let i = 0; i < wheels.length; i++) controller.setWheelBrake(i, brake)
    state.braking = Boolean(input.brake)

    // Coasting: an impulse against the direction of travel, along the
    // chassis' forward axis.
    if (input.throttle === 0 && state.speed > 1e-4) {
      const magnitude = a.coastImpulse * state.speed * (dt / REFERENCE_STEP)
      scratch.copy(forward).multiplyScalar(goingForward ? -magnitude : magnitude)
      body.applyImpulse(scratch, true)
    }

    updateFlip(dt)
    hopCooldown = Math.max(hopCooldown - dt, 0)

    controller.updateVehicle(dt)

    let grounded = 0
    for (let i = 0; i < wheels.length; i++) if (controller.wheelIsInContact(i)) grounded += 1
    state.groundedWheels = grounded
    state.airborne = grounded === 0
    state.sliding = grounded > 0 && Math.abs(state.lateralSpeed) > a.slideSpeed * s
  }

  /** Tilted past the threshold for `flipDelay` -> an off-centre kick rolls it back over. */
  function updateFlip(dt) {
    const a = settings.arcade
    flipCooldown = Math.max(flipCooldown - dt, 0)
    state.flipped = up.dot(WORLD_UP) < a.flipUpDot
    if (!state.flipped || flipCooldown > 0) {
      flipTimer = 0
      return
    }
    flipTimer += dt
    if (flipTimer < a.flipDelay) return

    scratch.set(0, a.flipImpulse * s, 0)
    body.applyImpulseAtPoint(
      scratch,
      { x: translation.x + a.flipLever * s, y: translation.y, z: translation.z },
      true,
    )
    flipTimer = 0
    flipCooldown = a.flipCooldown
  }

  /** Horn hop: a straight-up impulse through the centre of mass. Returns false while cooling down. */
  function hop() {
    if (hopCooldown > 0) return false
    const a = settings.arcade
    body.applyImpulse({ x: 0, y: a.hopImpulse * s, z: 0 }, true)
    hopCooldown = a.hopCooldown
    return true
  }

  /** Teleport, at rest, `respawnDrop` above the given point. */
  function placeAt(point, orientation, drop = settings.arcade.respawnDrop * s) {
    body.setTranslation({ x: point.x, y: point.y + drop, z: point.z }, true)
    body.setRotation(orientation, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.resetForces(true)
    body.resetTorques(true)
    state.steerAngle = 0
    flipTimer = 0
    flipCooldown = 0
    for (let i = 0; i < wheels.length; i++) {
      controller.setWheelSteering(i, 0)
      controller.setWheelEngineForce(i, 0)
    }
    readBodyState()
  }

  return {
    body,
    controller,
    wheels,
    state,
    update,
    hop,
    placeAt,
    readBodyState,
    /**
     * Ride height of the body origin at rest, m -- for the shadow blob. The
     * springs settle to ~38% of rest length (measured: 0.2865 reference units).
     */
    restHeight: (wheelSpec.radius + wheelSpec.restLength * 0.38) * s,
    /** Normal (non-boost) speed cap, m/s. */
    get topSpeed() {
      return settings.arcade.maxSpeed * s
    },
    get velocity() {
      return linvel
    },
    get forward() {
      return forward
    },
  }
}
