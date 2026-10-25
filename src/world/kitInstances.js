import * as THREE from 'three'

import { loadGLTF } from '../core/gltf.js'
import { applyMatcapMaterials } from '../render/materials.js'
import { colliderDescFromProxy } from './colliders.js'

/**
 * The shared kit (`models/kit.glb`, blender/scripts/gen_kit.py): every
 * `kit_<type>` root becomes a recipe of visual parts and collider proxies,
 * all relative to the root. Districts then place it as many times as they
 * like (`inst_<type>_<n>`, `collect_<kind>_<n>`) for one InstancedMesh per
 * part per district -- a forest is a handful of draw calls.
 */
export async function loadKit({ url, renderAssets }) {
  const gltf = await loadGLTF(url)
  const root = gltf.scene
  applyMatcapMaterials(root, renderAssets)
  root.updateMatrixWorld(true)

  const kit = new Map()
  for (const node of root.children) {
    if (!node.name.startsWith('kit_')) continue
    const type = node.name.slice('kit_'.length)
    const parts = []
    const colliders = []
    const rootInverse = new THREE.Matrix4().copy(node.matrixWorld).invert()
    node.traverse((child) => {
      if (!child.isMesh) return
      const local = new THREE.Matrix4().multiplyMatrices(rootInverse, child.matrixWorld)
      if (child.name.startsWith('collision_')) colliders.push({ node: child, local })
      else parts.push({ geometry: child.geometry, material: child.material, local })
    })
    kit.set(type, { type, parts, colliders })
  }
  return kit
}

/**
 * Places kit instances for one district. `placements` is [{ type, matrix }]
 * in world space. Static colliders are created for any kit piece that has
 * proxies (tree trunks, lamp poles); collectibles have none.
 */
export function placeKitInstances({ kit, placements, group, world, RAPIER, name }) {
  const byType = new Map()
  for (const placement of placements) {
    if (!kit.has(placement.type)) {
      console.warn(`[world] ${name}: no kit piece "${placement.type}"`)
      continue
    }
    if (!byType.has(placement.type)) byType.set(placement.type, [])
    byType.get(placement.type).push(placement.matrix)
  }

  const meshes = new Map()
  const scratch = new THREE.Matrix4()
  for (const [type, matrices] of byType) {
    const piece = kit.get(type)
    const typeMeshes = []
    for (const part of piece.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length)
      mesh.name = `${name}:${type}`
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, scratch.multiplyMatrices(matrix, part.local)))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      group.add(mesh)
      typeMeshes.push(mesh)
    }
    meshes.set(type, typeMeshes)

    if (piece.colliders.length) {
      for (const matrix of matrices) {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
        for (const proxy of piece.colliders) {
          const { desc } = colliderDescFromProxy(RAPIER, proxy.node, scratch.multiplyMatrices(matrix, proxy.local))
          world.createCollider(desc.setFriction(0.9), body)
        }
      }
    }
  }
  return meshes
}
