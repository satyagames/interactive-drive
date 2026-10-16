import * as THREE from 'three'

import { loadGLTF } from '../core/gltf.js'
import { applyMatcapMaterials } from '../render/materials.js'
import { world as worldConfig } from '../config.js'

/**
 * Loads `world.glb` (authored in Blender, see `docs/blender-conventions.md`)
 * and splits its nodes by name prefix:
 *
 *   - `collision_*` -> not rendered; used to build a matching Rapier collider
 *     (box, or cylinder if the name also ends `_cyl`) and then discarded.
 *   - `spawn_*` -> not rendered; position + rotation returned in `spawns`.
 *   - `trigger_*` -> not rendered; position + rotation + half-extents (read
 *     from the empty's scale) returned in `triggers`.
 *   - everything else -> left in the scene as visual-only geometry.
 */
export async function createWorld({ scene, world, RAPIER, renderAssets }) {
  const group = new THREE.Group()
  group.name = 'world'
  scene.add(group)

  const gltf = await loadGLTF(worldConfig.url)
  const root = gltf.scene
  root.updateMatrixWorld(true)

  const spawns = {}
  const triggers = []
  const toRemove = []

  for (const node of [...root.children]) {
    const name = node.name

    if (name.startsWith(worldConfig.collisionPrefix)) {
      addColliderFromNode({ node, world, RAPIER })
      toRemove.push(node)
    } else if (name.startsWith(worldConfig.spawnPrefix)) {
      spawns[name] = readTransform(node)
      toRemove.push(node)
    } else if (name.startsWith(worldConfig.triggerPrefix)) {
      triggers.push({ name, ...readTransform(node), halfExtents: emptyScaleToHalfExtents(node) })
      toRemove.push(node)
    }
  }
  for (const node of toRemove) root.remove(node)

  // Swap the flat glTF materials for matcaps + the AO bake. Done after the
  // collision/spawn/trigger nodes are pulled out so the proxies -- which are
  // never rendered -- don't get materials built for them.
  applyMatcapMaterials(root, renderAssets)

  group.add(root)

  return { group, spawns, triggers }
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
 * A `trigger_` empty is authored in Blender with `scale = (halfExtentX,
 * halfExtentZ, halfExtentY)` -- Blender's exporter swaps Y/Z on the way out
 * (same convention as position/rotation), so the exported node's scale comes
 * back as `(halfExtentX, halfExtentY, halfExtentZ)` already in game-space
 * order. No further remapping needed here. See `docs/blender-conventions.md`.
 */
function emptyScaleToHalfExtents(node) {
  return node.scale.clone()
}

const box3 = new THREE.Box3()
const localCenter = new THREE.Vector3()
const size = new THREE.Vector3()
const worldPos = new THREE.Vector3()
const worldQuat = new THREE.Quaternion()
const worldScale = new THREE.Vector3()

/** Builds a fixed Rapier collider from a `collision_` node's geometry + transform, then discards it. */
function addColliderFromNode({ node, world, RAPIER }) {
  node.matrixWorld.decompose(worldPos, worldQuat, worldScale)

  const geometry = node.geometry
  geometry.computeBoundingBox()
  box3.copy(geometry.boundingBox)
  box3.getCenter(localCenter)
  box3.getSize(size)

  // Fold in the local bounding-box centre in case the mesh isn't authored
  // symmetric about its own origin.
  localCenter.multiply(worldScale).applyQuaternion(worldQuat)
  worldPos.add(localCenter)

  const isCylinder = node.name.endsWith('_cyl')
  const colliderDesc = isCylinder
    ? RAPIER.ColliderDesc.cylinder(
        (size.y / 2) * worldScale.y,
        (Math.max(size.x, size.z) / 2) * Math.max(worldScale.x, worldScale.z),
      )
    : RAPIER.ColliderDesc.cuboid(
        (size.x / 2) * worldScale.x,
        (size.y / 2) * worldScale.y,
        (size.z / 2) * worldScale.z,
      )

  colliderDesc
    .setTranslation(worldPos.x, worldPos.y, worldPos.z)
    .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w })
    .setFriction(0.9)

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(colliderDesc, body)
}
