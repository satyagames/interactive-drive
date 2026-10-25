import * as THREE from 'three'

import { world as worldConfig } from '../config.js'
import { colliderDescFromProxy } from './colliders.js'

/**
 * Every `dyn_<type>_<n>` root in the arena becomes one Rapier dynamic body
 * with a compound of its `collision_` children, and its single visual child
 * is drawn through an InstancedMesh shared by all props of the same look in
 * that district (docs/pursuit-arena/04 §2).
 *
 *   - mass / friction / restitution / sfx / type come from the Blender
 *     custom properties (glTF extras -> userData);
 *   - bodies start asleep -- props are authored resting -- and only awake
 *     bodies cost anything per frame (matrix + blob shadow update);
 *   - the reference's sleep threshold (0.01 units) is kept, scaled.
 *
 * `props` (the returned list) is what later phases hang behaviour on:
 * reveal tweens, impact sounds by `sfx`, mini-game checks by `type`.
 */
export function createDynamicProps({ world, RAPIER, blobs }) {
  const props = []
  const batches = []

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
      const prop = createProp(root)
      if (!prop) continue
      props.push(prop)
      const key = `${prop.type}|${prop.visual.material.uuid}`
      if (!byLook.has(key)) byLook.set(key, [])
      byLook.get(key).push(prop)
    }

    for (const members of byLook.values()) {
      const { geometry, material } = members[0].visual
      const mesh = new THREE.InstancedMesh(geometry, material, members.length)
      mesh.name = `${name}:dyn:${members[0].type}`
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
    }
  }

  function createProp(root) {
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

    const visualLocal = new THREE.Matrix4().multiplyMatrices(rootInverse, visual.matrixWorld)
    const footprint = new THREE.Box3().setFromBufferAttribute(visual.geometry.attributes.position)
    const blobSize = footprint.getSize(new THREE.Vector3())
    const blob = blobs.add({
      sizeX: Math.max(blobSize.x, 0.4) * 1.5,
      sizeZ: Math.max(blobSize.z, 0.4) * 1.5,
      offsetY: -blobSize.y / 2,
    })

    return {
      name: root.name,
      type: data.type ?? root.name.split('_')[1],
      sfx: data.sfx ?? null,
      mass,
      body,
      visual: { geometry: visual.geometry, material: visual.material },
      visualLocal,
      blob,
      batch: null,
      index: 0,
      awake: true,   // forces one sync before the first sleep check
    }
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

  /** Per frame: copy every awake body (and any that just fell asleep) to its instance. */
  function update() {
    let awake = 0
    for (const batch of batches) {
      let dirty = false
      for (const prop of batch.members) {
        const sleeping = prop.body.isSleeping()
        if (!sleeping || prop.awake) {
          writeInstance(prop)
          dirty = true
        }
        prop.awake = !sleeping
        if (!sleeping) awake += 1
      }
      if (dirty) batch.mesh.instanceMatrix.needsUpdate = true
    }
    return awake
  }

  return {
    props,
    addDistrict,
    update,
    get awakeCount() {
      return props.reduce((n, p) => n + (p.body.isSleeping() ? 0 : 1), 0)
    },
  }
}
