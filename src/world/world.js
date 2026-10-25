import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { world as worldConfig } from '../config.js'
import { loadGLTF } from '../core/gltf.js'
import { applyMatcapMaterials } from '../render/materials.js'
import { colliderDescFromProxy } from './colliders.js'
import { createDynamicProps } from './dynamicProps.js'
import { loadKit, placeKitInstances } from './kitInstances.js'

/**
 * Loads the Pursuit Arena: `models/arena.manifest.json` lists the shared kit
 * and one GLB per district (all written by `npm run art:export`). 'core'
 * districts load before the first frame; 'stream' ones (the outer ring)
 * load afterwards via `streamRest()`.
 *
 * Every node is classified by name prefix, at any depth
 * (docs/pursuit-arena/04 §2):
 *
 *   collision_*      static collider (box / _cyl / _sph), not rendered
 *   dyn_*            dynamic prop -> dynamicProps.js
 *   inst_*           kit instance -> kitInstances.js
 *   collect_*        collectible spot (drawn from the kit; picked up in Phase 6)
 *   area_*           Enter area (content id = the rest of the name)
 *   trigger_*        passive trigger (passport stamps, loop counters)
 *   spawn_*          respawn point
 *   sfx_*            ambient emitter (radius = scale), for Phase 8
 *   anything else    static visual; merged per material per district so a
 *                    whole district costs a handful of draw calls
 *
 * The returned lists (`spawns`, `triggers`, `areas`, ...) grow as streamed
 * districts arrive, so consumers holding them see the new entries.
 */
export async function createWorld({ scene, world, RAPIER, renderAssets, blobs }) {
  const group = new THREE.Group()
  group.name = 'world'
  scene.add(group)

  const manifest = await fetch(worldConfig.manifestUrl).then((response) => {
    if (!response.ok) throw new Error(`${worldConfig.manifestUrl}: ${response.status}`)
    return response.json()
  })
  const kit = await loadKit({ url: manifest.kit, renderAssets })
  const props = createDynamicProps({ world, RAPIER, blobs })

  const spawns = {}
  const triggers = []
  const areas = []
  const collectibles = []
  const emitters = []
  const districts = []
  let ground = null

  async function loadDistrict({ id, url }) {
    const gltf = await loadGLTF(url)
    const root = gltf.scene
    root.updateMatrixWorld(true)
    applyMatcapMaterials(root, renderAssets)

    const districtGroup = new THREE.Group()
    districtGroup.name = `district:${id}`
    const statics = []
    const dynRoots = []
    const placements = []
    const staticBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    let colliders = 0

    const visit = (node) => {
      const name = node.name
      if (name.startsWith(worldConfig.dynamicPrefix)) {
        dynRoots.push(node)
        return // its children belong to the prop
      }
      if (name.startsWith(worldConfig.collisionPrefix) && node.isMesh) {
        const { desc } = colliderDescFromProxy(RAPIER, node, node.matrixWorld)
        world.createCollider(desc.setFriction(0.9), staticBody)
        colliders += 1
        return
      }
      if (name.startsWith(worldConfig.instancePrefix)) {
        placements.push({ type: node.userData.type ?? name.split('_')[1], matrix: node.matrixWorld.clone() })
        return
      }
      if (name.startsWith(worldConfig.collectPrefix)) {
        const kind = name.split('_')[1]
        const position = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld)
        collectibles.push({ id: name, kind, position, district: id })
        placements.push({ type: kind, matrix: new THREE.Matrix4().makeTranslation(position.x, position.y, position.z) })
        return
      }
      if (name.startsWith(worldConfig.areaPrefix)) {
        areas.push({ name, id: name.slice(worldConfig.areaPrefix.length), district: id, ...readTransform(node), halfExtents: emptyScaleToHalfExtents(node) })
        return
      }
      if (name.startsWith(worldConfig.triggerPrefix)) {
        triggers.push({ name, district: id, ...readTransform(node), halfExtents: emptyScaleToHalfExtents(node) })
        return
      }
      if (name.startsWith(worldConfig.spawnPrefix)) {
        spawns[name] = readTransform(node)
        return
      }
      if (name.startsWith(worldConfig.sfxPrefix)) {
        const { position } = readTransform(node)
        emitters.push({ id: name.slice(worldConfig.sfxPrefix.length), position, radius: node.getWorldScale(new THREE.Vector3()).x })
        return
      }
      if (node.isMesh) statics.push(node)
      for (const child of node.children) visit(child)
    }
    for (const child of root.children) visit(child)

    // Static visuals: the ground stays its own mesh (floorGradient.js
    // repaints it); everything else merges per material.
    const merged = mergeStatics(statics.filter((mesh) => {
      if (mesh.name === 'ground') {
        ground = toWorldMesh(mesh)
        districtGroup.add(ground)
        return false
      }
      return true
    }), id)
    for (const mesh of merged) districtGroup.add(mesh)

    placeKitInstances({ kit, placements, group: districtGroup, world, RAPIER, name: id })
    props.addDistrict({ roots: dynRoots, group: districtGroup, name: id })

    group.add(districtGroup)
    const info = {
      id, colliders, statics: statics.length, drawCalls: districtGroup.children.length, props: dynRoots.length,
    }
    districts.push(info)
    return info
  }

  const core = manifest.districts.filter((d) => d.stage === 'core')
  const rest = manifest.districts.filter((d) => d.stage !== 'core')
  await Promise.all(core.map(loadDistrict))

  let streaming = null
  return {
    group,
    spawns,
    triggers,
    areas,
    collectibles,
    emitters,
    props,
    districts,
    get ground() {
      return ground
    },
    /** Loads the outer-ring districts; call once after the first frame. */
    streamRest() {
      streaming ??= Promise.all(rest.map(loadDistrict))
      return streaming
    },
  }
}

/** Merge meshes that share a material into one world-space mesh each. */
function mergeStatics(meshes, id) {
  const byMaterial = new Map()
  for (const mesh of meshes) {
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, [])
    byMaterial.get(mesh.material).push(mesh)
  }
  const out = []
  for (const [material, members] of byMaterial) {
    const geometries = members.map((mesh) => {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
      }
      g.applyMatrix4(mesh.matrixWorld)
      return g
    })
    const geometry = mergeGeometries(geometries, false)
    for (const g of geometries) g.dispose()
    if (!geometry) continue
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `${id}:static:${material.name}`
    mesh.matrixAutoUpdate = false
    out.push(mesh)
  }
  return out
}

function toWorldMesh(mesh) {
  const copy = new THREE.Mesh(mesh.geometry, mesh.material)
  copy.name = mesh.name
  mesh.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale)
  return copy
}

/** World-space position + rotation of a node, read after the scene's matrices are up to date. */
function readTransform(node) {
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  node.matrixWorld.decompose(position, quaternion, scale)
  return { position, quaternion }
}

/**
 * An `area_`/`trigger_` empty is authored in Blender with `scale = (halfExtentX,
 * halfExtentZ, halfExtentY)` -- Blender's exporter swaps Y/Z on the way out
 * (same convention as position/rotation), so the exported node's scale comes
 * back as `(halfExtentX, halfExtentY, halfExtentZ)` already in game-space
 * order. No further remapping needed here. See `docs/blender-conventions.md`.
 */
function emptyScaleToHalfExtents(node) {
  return node.getWorldScale(new THREE.Vector3())
}
