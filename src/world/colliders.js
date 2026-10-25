import * as THREE from 'three'

/**
 * `collision_` proxy -> Rapier collider description. Shared by static world
 * geometry, kit instances and dynamic props so the three agree exactly.
 *
 * The proxy's *geometry* bounding box gives the size, its transform the
 * pose; the suffix picks the shape (docs/blender-conventions.md):
 *   collision_*       box
 *   collision_*_cyl   cylinder (upright in the proxy's own frame)
 *   collision_*_sph   sphere
 *
 * `matrix` is the proxy's transform in whatever space the caller is building
 * in (world for statics, the prop root's local space for compounds).
 */
const box3 = new THREE.Box3()
const centre = new THREE.Vector3()
const size = new THREE.Vector3()
const position = new THREE.Vector3()
const quaternion = new THREE.Quaternion()
const scale = new THREE.Vector3()

export function colliderDescFromProxy(RAPIER, node, matrix) {
  matrix.decompose(position, quaternion, scale)
  const geometry = node.geometry
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  box3.copy(geometry.boundingBox)
  box3.getCenter(centre)
  box3.getSize(size)

  // Fold in the local bounding-box centre in case the proxy isn't authored
  // symmetric about its own origin.
  centre.multiply(scale).applyQuaternion(quaternion)
  position.add(centre)
  size.multiply(scale)

  let desc
  let volume
  if (node.name.endsWith('_sph')) {
    const r = Math.max(size.x, size.y, size.z) / 2
    desc = RAPIER.ColliderDesc.ball(r)
    volume = (4 / 3) * Math.PI * r ** 3
  } else if (node.name.endsWith('_cyl')) {
    const r = Math.max(size.x, size.z) / 2
    desc = RAPIER.ColliderDesc.cylinder(size.y / 2, r)
    volume = Math.PI * r * r * size.y
  } else {
    desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
    volume = size.x * size.y * size.z
  }
  desc
    .setTranslation(position.x, position.y, position.z)
    .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
  return { desc, volume }
}
