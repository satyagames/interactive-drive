import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { createMatcapMaterial } from '../render/materials.js'

/**
 * Static exhibit geometry, built the way the arena's statics are: pieces are
 * collected per material and merged into one world-space mesh each, so an
 * exhibit costs one draw call per material however many parts it has.
 * Colliders go on one fixed Rapier body per exhibit.
 *
 *   const b = createBuilder({ world, RAPIER, renderAssets, name: 'hq:wins' })
 *   b.box('ivory', '#FFFFFF', [x, y, z], [w, h, d], yaw, { collide: true })
 *   b.cylinder('gold', null, [x, y, z], radius, height, { segments: 12, collide: true })
 *   b.add(geometry, 'stone', null, matrix)
 *   group.add(...b.finish())
 */
export function createBuilder({ world, RAPIER, renderAssets, name }) {
  const byMaterial = new Map()
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  let colliders = 0
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)

  function materialFor(matcap, tint) {
    return createMatcapMaterial(renderAssets, matcap, tint)
  }

  function add(geometry, matcap, tint, matrix) {
    const material = materialFor(matcap, tint)
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key)
    g.applyMatrix4(matrix)
    if (!byMaterial.has(material)) byMaterial.set(material, [])
    byMaterial.get(material).push(g)
  }

  function collideBox([x, y, z], [w, h, d], yaw = 0) {
    q.setFromAxisAngle(up, yaw)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.9),
      body,
    )
    colliders += 1
  }

  function collideCylinder([x, y, z], radius, height) {
    world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(x, y, z).setFriction(0.9), body)
    colliders += 1
  }

  return {
    materialFor,
    add,
    collideBox,
    collideCylinder,
    box(matcap, tint, centre, size, yaw = 0, { collide = false } = {}) {
      q.setFromAxisAngle(up, yaw)
      m.compose(new THREE.Vector3(...centre), q, new THREE.Vector3(...size))
      add(BOX, matcap, tint, m)
      if (collide) collideBox(centre, size, yaw)
    },
    cylinder(matcap, tint, centre, radius, height, { segments = 12, top = null, collide = false } = {}) {
      const geometry = new THREE.CylinderGeometry(top ?? radius, radius, height, segments)
      m.makeTranslation(...centre)
      add(geometry, matcap, tint, m)
      geometry.dispose()
      if (collide) collideCylinder(centre, radius, height)
    },
    /** Merge and return the meshes (one per material). */
    finish() {
      const out = []
      for (const [material, geometries] of byMaterial) {
        const geometry = mergeGeometries(geometries, false)
        for (const g of geometries) g.dispose()
        if (!geometry) continue
        geometry.computeBoundingSphere()
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = `${name}:${material.name}`
        mesh.matrixAutoUpdate = false
        out.push(mesh)
      }
      byMaterial.clear()
      return out
    },
    get colliders() {
      return colliders
    },
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1)
