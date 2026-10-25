import * as THREE from 'three'

import { rebuild, rendering, settings } from '../config.js'
import { loadGLTF } from '../core/gltf.js'
import { applyMatcapMaterials, createMatcapMaterial } from '../render/materials.js'
import { createArcadePhysics } from './arcadePhysics.js'

/**
 * The 'arcade2019' preset: `arcadePhysics.js` plus everything you see --
 * body mesh, wheels, the antenna spring with its "10" pennant, and the brake
 * and reverse lights. Same public API as `simVehicle.js`.
 */

/** Below this the car is considered fallen out of the world. */
const FALL_LIMIT_Y = -30
/** Reference speeds are units per frame (17 ms) for the antenna; ours are m/s. */
const ANTENNA_SPEED_UNITS = 0.017
const ANTENNA_TILT = 0.1
const DIM = 0.5
const LIT = 1

export async function createArcadeVehicle({ scene, world, RAPIER, renderAssets }) {
  const s = rebuild.worldScale
  const spec = rebuild.arcade
  const { chassis } = rebuild

  const physics = createArcadePhysics({
    world, RAPIER, position: chassis.spawn, rotation: chassis.spawnRotation,
  })
  const { body, state } = physics

  // ---- visuals ------------------------------------------------------------

  const object3D = new THREE.Group()
  object3D.name = 'vehicle'
  scene.add(object3D)

  // The placeholder body was modelled for the sim car (`rebuild.chassis.size`);
  // scale it to the arcade chassis length until the Phase 10 cart replaces it.
  const length = spec.chassis.depth * s
  const modelScale = length / chassis.size.z

  const bodyGroup = new THREE.Group()
  bodyGroup.name = 'chassis-visual'
  bodyGroup.position.y = spec.visualOffsetY
  bodyGroup.scale.setScalar(modelScale)
  object3D.add(bodyGroup)

  const vehicleGltf = await loadGLTF(rebuild.model.url)
  vehicleGltf.scene.rotation.y = rebuild.model.yawOffset
  applyMatcapMaterials(vehicleGltf.scene, renderAssets)
  // The hull is what a skin repaints (`setTint`).
  const hullMeshes = []
  vehicleGltf.scene.traverse((node) => {
    const named = node.name.startsWith('vehicle_hull') || node.parent?.name.startsWith('vehicle_hull')
    if (node.isMesh && named) hullMeshes.push({ mesh: node, original: node.material })
  })
  bodyGroup.add(vehicleGltf.scene)

  const wheelRadius = spec.wheels.radius * s
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, spec.wheels.width * s, 18)
  wheelGeometry.rotateZ(Math.PI / 2)
  const wheelMaterial = createMatcapMaterial(renderAssets, rendering.wheelMatcap)
  const hubMaterial = createMatcapMaterial(renderAssets, rendering.hubMatcap)
  const hubGeometry = new THREE.BoxGeometry(spec.wheels.width * s + 0.02, 0.12, 0.12)

  const wheels = physics.wheels.map((wheel) => {
    const mesh = new THREE.Mesh(wheelGeometry, wheelMaterial)
    mesh.rotation.order = 'YXZ'
    mesh.add(new THREE.Mesh(hubGeometry, hubMaterial))
    object3D.add(mesh)
    return { ...wheel, mesh, spin: 0, spinRate: 0, suspLength: spec.wheels.restLength * s }
  })

  // Visual extents of the scaled placeholder body, in the body frame.
  const bodyHalfWidth = (chassis.size.x * modelScale) / 2
  const bodyHalfLength = length / 2
  const deckY = spec.visualOffsetY + (chassis.size.y * modelScale) / 2

  const antenna = createAntenna(renderAssets)
  antenna.group.position.set(bodyHalfWidth * 0.6, deckY, bodyHalfLength * 0.62)
  object3D.add(antenna.group)

  const brakeLights = createLightPair({
    color: 0xd8262c, halfWidth: bodyHalfWidth * 0.7, y: deckY - 0.12, z: bodyHalfLength + 0.01,
  })
  const reverseLights = createLightPair({
    color: 0xfff1c4, halfWidth: bodyHalfWidth * 0.35, y: deckY - 0.12, z: bodyHalfLength + 0.01,
  })
  object3D.add(brakeLights.group, reverseLights.group)

  // ---- per-step -------------------------------------------------------------

  const antennaVelocity = new THREE.Vector2()
  const antennaOffset = new THREE.Vector2()
  const lastMovement = new THREE.Vector2()
  const backFlat = new THREE.Vector2()
  const rightFlat = new THREE.Vector2()

  function update(dt, input) {
    physics.update(dt, input)

    for (let i = 0; i < wheels.length; i++) {
      const wheel = wheels[i]
      const { controller } = physics
      wheel.suspLength = controller.wheelSuspensionLength(i) ?? wheel.suspLength
      const driven = !wheel.front && state.engineForce !== 0
      if (driven && (state.sliding || !controller.wheelIsInContact(i))) {
        wheel.spinRate = settings.arcade.slidingWheelSpin * Math.sign(state.engineForce)
      } else if (controller.wheelIsInContact(i)) {
        wheel.spinRate = -state.forwardSpeed / wheelRadius
      } else {
        wheel.spinRate *= 0.99
      }
      wheel.spin += wheel.spinRate * dt
    }

    updateAntenna()

    if (body.translation().y < FALL_LIMIT_Y) respawn()
  }

  /**
   * A 2D spring in the ground plane, kicked by the chassis' acceleration and
   * read back in the car's frame as a tilt -- the reference's toy antenna.
   */
  function updateAntenna() {
    const a = settings.arcade
    const v = physics.velocity
    const k = ANTENNA_SPEED_UNITS / s
    const mx = v.x * k
    const mz = v.z * k
    const ax = THREE.MathUtils.clamp(mx - lastMovement.x, -1, 1)
    const az = THREE.MathUtils.clamp(mz - lastMovement.y, -1, 1)
    lastMovement.set(mx, mz)

    antennaVelocity.x -= ax * a.antennaStrength
    antennaVelocity.y -= az * a.antennaStrength
    const pull = antennaOffset.length() * a.antennaPullBack
    antennaVelocity.x -= antennaOffset.x * pull
    antennaVelocity.y -= antennaOffset.y * pull
    antennaVelocity.multiplyScalar(1 - a.antennaDamping)
    antennaOffset.add(antennaVelocity)

    const f = physics.forward
    backFlat.set(-f.x, -f.z).normalize()
    rightFlat.set(-backFlat.y, backFlat.x)
    antenna.pivot.rotation.x = antennaOffset.dot(backFlat) * ANTENNA_TILT
    antenna.pivot.rotation.z = -antennaOffset.dot(rightFlat) * ANTENNA_TILT
  }

  /** Copy the simulated transform onto the meshes. Call once per frame. */
  function sync() {
    const t = body.translation()
    const r = body.rotation()
    object3D.position.set(t.x, t.y, t.z)
    object3D.quaternion.set(r.x, r.y, r.z, r.w)

    for (const wheel of wheels) {
      wheel.mesh.position.set(wheel.connection.x, wheel.connection.y - wheel.suspLength, wheel.connection.z)
      wheel.mesh.rotation.y = wheel.front ? state.steerAngle : 0
      wheel.mesh.rotation.x = wheel.spin
    }

    brakeLights.setLevel(state.braking ? LIT : DIM)
    reverseLights.setLevel(state.reversing ? LIT : DIM)
  }

  /** Drop back in above `point` ({ position, quaternion }), or the boot spawn without one. */
  function respawn(point) {
    physics.placeAt(point?.position ?? chassis.spawn, point?.quaternion ?? chassis.spawnRotation)
    antennaVelocity.set(0, 0)
    antennaOffset.set(0, 0)
    for (const wheel of wheels) {
      wheel.spin = 0
      wheel.spinRate = 0
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
    /** Horn: the reference's hop. Returns true if it fired (not cooling down). */
    horn: () => physics.hop(),
    /** What the shadow blob needs to fit this car rather than the sim one. */
    shadow: { groundClearance: physics.restHeight, scale: modelScale },
    /**
     * Skins (doc 03 §2.8): repaint the hull, or `null` for the original.
     * A tinted ivory matcap keeps the shading while taking the skin colour.
     */
    setTint(tint) {
      for (const { mesh, original } of hullMeshes) {
        mesh.material = tint
          ? new THREE.MeshMatcapMaterial({ matcap: renderAssets.matcaps.get('ivory'), color: tint, fog: true })
          : original
      }
    },
    get topSpeed() {
      return physics.topSpeed
    },
    get position() {
      return object3D.position
    },
    get quaternion() {
      return object3D.quaternion
    },
    get velocity() {
      return physics.velocity
    },
  }
}

/**
 * A thin rod with its pivot at the base and a small pennant at the tip.
 * The pennant is a plain brand-green placeholder; the "10" artwork arrives
 * with the Phase 10 cart.
 */
function createAntenna(renderAssets) {
  const height = 1.1
  const group = new THREE.Group()
  group.name = 'antenna'
  const pivot = new THREE.Group()
  group.add(pivot)

  const rodGeometry = new THREE.CylinderGeometry(0.018, 0.024, height, 6)
  rodGeometry.translate(0, height / 2, 0)
  pivot.add(new THREE.Mesh(rodGeometry, createMatcapMaterial(renderAssets, rendering.wheelMatcap)))

  const pennant = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.2, 0.32),
    new THREE.MeshBasicMaterial({ color: 0x86bc25 }),
  )
  pennant.name = 'antenna-pennant'
  pennant.position.set(0, height - 0.12, 0.17)
  pivot.add(pennant)

  return { group, pivot }
}

/** Two small lamp boxes across the tail whose opacity follows a level 0..1. */
function createLightPair({ color, halfWidth, y, z }) {
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: DIM })
  const geometry = new THREE.BoxGeometry(0.22, 0.1, 0.04)
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(geometry, material)
    lamp.position.set(side * halfWidth, y, z)
    group.add(lamp)
  }
  return {
    group,
    setLevel(level) {
      material.opacity = level
    },
  }
}
