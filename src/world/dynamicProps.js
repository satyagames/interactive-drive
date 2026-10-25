import * as THREE from 'three'

import { settings, world as worldConfig } from '../config.js'
import { colliderDescFromProxy } from './colliders.js'

/**
 * Every `dyn_<type>_<n>` root in the arena becomes one Rapier dynamic body
 * with a compound of its `collision_` children, and its single visual child
 * is drawn through an InstancedMesh shared by all props of the same look in
 * that district (docs/pursuit-arena/04 §2).
 *
 *   - mass / friction / restitution / sfx / type come from the Blender
 *     custom properties (glTF extras -> userData);
 *   - optional behaviour, also from custom properties:
 *       hang + springK (+ springDamp)  hangs on a spring from a point `hang`
 *                                      metres above where it was authored
 *       buoyancy + tether              floats with `buoyancy` x its weight,
 *                                      tied by a rope to the floor below it
 *   - bodies start asleep -- props are authored resting -- and only awake
 *     bodies cost anything per frame (matrix + blob shadow update);
 *   - each district keeps at most `settings.props.awakeBudget` bodies awake
 *     (doc 06 Phase 5): past that, the slowest are put back to sleep.
 *
 * `dropIn()` plays a prop in from above as a kinematic tween (no tumbling,
 * so stacks and walls arrive intact) and hands it back to physics asleep --
 * used by the intro and the district reveals (`reveal.js`).
 */
export function createDynamicProps({ world, RAPIER, blobs }) {
  const props = []
  const batches = []
  const floaters = []
  const dropping = []
  /** One fixed body all spring / rope anchors hang from. */
  const anchorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const gravity = Math.abs(world.gravity.y)

  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const bodyMatrix = new THREE.Matrix4()
  const instanceMatrix = new THREE.Matrix4()
  const rootInverse = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const one = new THREE.Vector3(1, 1, 1)

  /** Turn a district's dyn_ roots into bodies and instanced visuals under `group`. */
  function addDistrict({ roots, group, name }) {
    const byLook = new Map()
    for (const root of roots) {
      const prop = createProp(root, name)
      if (!prop) continue
      props.push(prop)
      const key = `${prop.type}|${prop.visual.material.uuid}`
      if (!byLook.has(key)) byLook.set(key, [])
      byLook.get(key).push(prop)
    }

    const meshes = []
    for (const members of byLook.values()) {
      const { geometry, material } = members[0].visual
      const mesh = new THREE.InstancedMesh(geometry, material, members.length)
      mesh.name = `${name}:dyn:${members[0].type}`
      mesh.userData.dynamic = true
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // Props move, so the batch is never frustum-culled as a whole.
      mesh.frustumCulled = false
      group.add(mesh)
      const batch = { mesh, members }
      members.forEach((prop, index) => {
        prop.batch = batch
        prop.index = index
        writeInstance(prop)
      })
      mesh.instanceMatrix.needsUpdate = true
      batches.push(batch)
      meshes.push(mesh)
    }
    return meshes
  }

  function createProp(root, district) {
    const data = root.userData ?? {}
    const children = []
    root.traverse((child) => {
      if (child !== root && child.isMesh) children.push(child)
    })
    const proxies = children.filter((c) => c.name.startsWith(worldConfig.collisionPrefix))
    const visual = children.find((c) => !c.name.startsWith(worldConfig.collisionPrefix))
    if (!visual || proxies.length === 0) {
      console.warn(`[world] ${root.name}: dyn_ prop needs a visual and collision_ children`)
      return null
    }

    root.matrixWorld.decompose(position, quaternion, scale)
    const home = { position: position.clone(), quaternion: quaternion.clone() }
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
        .setSleeping(true),
    )

    // Spread the authored mass over the compound by volume.
    rootInverse.copy(root.matrixWorld).invert()
    const descs = proxies.map((proxy) => colliderDescFromProxy(RAPIER, proxy, local.multiplyMatrices(rootInverse, proxy.matrixWorld)))
    const totalVolume = descs.reduce((sum, d) => sum + d.volume, 0) || 1
    const mass = Number(data.mass) || 1
    for (const { desc } of descs) {
      desc
        .setDensity(mass / totalVolume)
        .setFriction(Number(data.friction ?? 0.5))
        .setRestitution(Number(data.restitution ?? 0.2))
      world.createCollider(desc, body)
    }

    const prop = {
      name: root.name,
      district,
      type: data.type ?? root.name.split('_')[1],
      sfx: data.sfx ?? null,
      mass,
      body,
      home,
      visual: { geometry: visual.geometry, material: visual.material },
      visualLocal: new THREE.Matrix4().multiplyMatrices(rootInverse, visual.matrixWorld),
      blob: null,
      batch: null,
      index: 0,
      awake: true, // forces one sync before the first sleep check
      buoyancy: 0,
    }

    // Spring-hung (Idea Spark bulbs): rest length chosen so the weight
    // stretches the spring to exactly where the prop was authored.
    if (data.hang && data.springK) {
      const k = Number(data.springK)
      const hang = Number(data.hang)
      const rest = Math.max(hang - (mass * gravity) / k, 0.1)
      const anchor = { x: home.position.x, y: home.position.y + hang, z: home.position.z }
      const joint = RAPIER.JointData.spring(rest, k, Number(data.springDamp ?? 1), anchor, { x: 0, y: 0, z: 0 })
      world.createImpulseJoint(joint, anchorBody, body, false)
      // The spring only damps along its own length; air drag settles the
      // pendulum swing too, so a knocked bulb comes to rest (and sleeps).
      body.setLinearDamping(0.6)
      body.setAngularDamping(0.8)
    }
    // Floating on a tether (Culture balloons).
    if (data.buoyancy && data.tether) {
      prop.buoyancy = Number(data.buoyancy)
      const tether = Number(data.tether)
      const anchor = { x: home.position.x, y: home.position.y - tether, z: home.position.z }
      world.createImpulseJoint(RAPIER.JointData.rope(tether, anchor, { x: 0, y: 0, z: 0 }), anchorBody, body, false)
      body.setLinearDamping(0.6)
      body.setAngularDamping(0.8)
      floaters.push(prop)
    }

    const footprint = new THREE.Box3().setFromBufferAttribute(visual.geometry.attributes.position)
    const size = footprint.getSize(new THREE.Vector3())
    prop.blob = blobs.add({
      sizeX: Math.max(size.x, 0.4) * 1.5,
      sizeZ: Math.max(size.z, 0.4) * 1.5,
      offsetY: -size.y / 2,
    })
    return prop
  }

  function writeInstance(prop) {
    const t = prop.body.translation()
    const r = prop.body.rotation()
    position.set(t.x, t.y, t.z)
    quaternion.set(r.x, r.y, r.z, r.w)
    bodyMatrix.compose(position, quaternion, one)
    prop.batch.mesh.setMatrixAt(prop.index, instanceMatrix.multiplyMatrices(bodyMatrix, prop.visualLocal))
    blobs.set(prop.blob, position, quaternion)
  }

  /**
   * Kinematic drop-in from `height` above home, starting after `delay` s and
   * lasting `duration` s with a bounce; then dynamic again, asleep.
   */
  function dropIn(prop, { height, delay, duration }) {
    prop.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
    const p = prop.home.position
    prop.body.setTranslation({ x: p.x, y: p.y + height, z: p.z }, true)
    prop.body.setRotation(prop.home.quaternion, true)
    dropping.push({ prop, height, delay, duration, time: 0 })
  }

  /** Hide a not-yet-revealed district's blob shadows (its batches are hidden by the caller). */
  function hideDistrict(district) {
    for (const prop of props) if (prop.district === district) blobs.hide(prop.blob)
  }

  /** Called once per fixed physics step, before `world.step()`. */
  function fixedUpdate(dt) {
    for (const prop of floaters) {
      // Only while awake: a floater asleep at the end of its tether just hangs there.
      if (prop.body.isSleeping()) continue
      prop.body.addForce({ x: 0, y: prop.buoyancy * prop.mass * gravity, z: 0 }, false)
    }
    for (let i = dropping.length - 1; i >= 0; i--) {
      const drop = dropping[i]
      drop.time += dt
      const t = Math.min(Math.max((drop.time - drop.delay) / drop.duration, 0), 1)
      const p = drop.prop.home.position
      drop.prop.body.setNextKinematicTranslation({ x: p.x, y: p.y + drop.height * (1 - easeOutBounce(t)), z: p.z })
      if (t >= 1) {
        const body = drop.prop.body
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
        body.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        body.sleep()
        drop.prop.awake = true // one last sync at the resting pose
        dropping.splice(i, 1)
      }
    }
  }

  /**
   * Per frame: sync awake bodies to their instances, put idle ones to sleep
   * and enforce the awake budget.
   */
  function update(dt = 1 / 60) {
    const awakeByDistrict = new Map()
    for (const batch of batches) {
      let dirty = false
      for (const prop of batch.members) {
        const sleeping = prop.body.isSleeping()
        if (!sleeping || prop.awake) {
          writeInstance(prop)
          dirty = true
        }
        prop.awake = !sleeping
        // Rapier's own sleep can miss bodies held by a joint (they hover just
        // above its threshold); anything this still for IDLE_SLEEP sleeps.
        if (!sleeping && !prop.body.isKinematic()) {
          prop.idle = isStill(prop.body) ? (prop.idle ?? 0) + dt : 0
          if (prop.idle >= IDLE_SLEEP) {
            prop.body.sleep()
            prop.idle = 0
          }
        }
        if (!sleeping && !prop.body.isKinematic()) {
          if (!awakeByDistrict.has(prop.district)) awakeByDistrict.set(prop.district, [])
          awakeByDistrict.get(prop.district).push(prop)
        }
      }
      if (dirty) batch.mesh.instanceMatrix.needsUpdate = true
    }

    const budget = settings.props.awakeBudget
    let awake = 0
    for (const list of awakeByDistrict.values()) {
      awake += list.length
      if (list.length <= budget) continue
      // Over budget: put the slowest back to sleep (they're the least visible).
      list.sort((a, b) => speedSq(a.body) - speedSq(b.body))
      for (const prop of list.slice(0, list.length - budget)) prop.body.sleep()
    }
    return awake
  }

  return {
    props,
    addDistrict,
    dropIn,
    hideDistrict,
    fixedUpdate,
    update,
    get dropping() {
      return dropping.length
    },
    get awakeCount() {
      return props.reduce((n, p) => n + (p.body.isSleeping() ? 0 : 1), 0)
    },
  }
}

/** Seconds a prop must stay nearly still before it is put to sleep. */
const IDLE_SLEEP = 1.0

function isStill(body) {
  const w = body.angvel()
  return speedSq(body) < 0.04 * 0.04 && w.x * w.x + w.y * w.y + w.z * w.z < 0.1 * 0.1
}

function speedSq(body) {
  const v = body.linvel()
  return v.x * v.x + v.y * v.y + v.z * v.z
}

function easeOutBounce(t) {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}
