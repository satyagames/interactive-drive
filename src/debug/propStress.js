import * as THREE from 'three'

import { rebuild } from '../config.js'
import { createMatcapMaterial } from '../render/materials.js'

/**
 * Debug-only stress scene for the Phase 2 blob-shadow budget (300 blobs under
 * 0.3 ms): drops N dynamic boxes around a point, renders them as one
 * InstancedMesh, gives each an instanced blob, and times the per-frame
 * sync. A preview of how Phase 4/5 `dyn_` props will be wired, not the final
 * prop system.
 */
export function createPropStress({ scene, world, RAPIER, renderAssets, blobs }) {
  const s = rebuild.worldScale
  const props = []
  let mesh = null
  const timings = []

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)

  /** Drop `count` boxes in a loose grid centred on `centre`. */
  function spawn(count, centre) {
    clear()
    const size = 0.6 * s
    const geometry = new THREE.BoxGeometry(size, size, size)
    mesh = new THREE.InstancedMesh(geometry, createMatcapMaterial(renderAssets, 'accent-warm'), count)
    mesh.name = 'prop-stress'
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    scene.add(mesh)

    const side = Math.ceil(Math.sqrt(count))
    const spacing = size * 2.2
    for (let i = 0; i < count; i++) {
      const gx = (i % side) - side / 2
      const gz = Math.floor(i / side) - side / 2
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(centre.x + gx * spacing, 2 + Math.random() * 6, centre.z + gz * spacing)
          .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), 0))),
      )
      // Reference letter mass (1.5) against the 40 kg car.
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setMass(1.5).setFriction(0.5).setRestitution(0.3),
        body,
      )
      const blob = blobs.add({ sizeX: size * 1.6, sizeZ: size * 1.6, offsetY: -size / 2 })
      props.push({ body, blob })
    }
  }

  /** Per frame: copy bodies to instances and blobs; record the CPU cost. */
  function update() {
    if (!mesh) return
    const start = performance.now()
    for (let i = 0; i < props.length; i++) {
      const { body, blob } = props[i]
      const t = body.translation()
      const r = body.rotation()
      position.set(t.x, t.y, t.z)
      quaternion.set(r.x, r.y, r.z, r.w)
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
      blobs.set(blob, position, quaternion)
    }
    mesh.instanceMatrix.needsUpdate = true
    blobs.update()
    timings.push(performance.now() - start)
    if (timings.length > 240) timings.shift()
  }

  function clear() {
    for (const { body, blob } of props) {
      world.removeRigidBody(body)
      blobs.remove(blob)
    }
    props.length = 0
    timings.length = 0
    if (mesh) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      mesh.dispose()
      mesh = null
    }
  }

  return {
    spawn,
    update,
    clear,
    /** Mean / max CPU ms per frame for prop + blob sync over the last 4 s, and awake bodies. */
    stats() {
      const n = timings.length || 1
      return {
        props: props.length,
        awake: props.filter(({ body }) => !body.isSleeping()).length,
        meanMs: timings.reduce((a, b) => a + b, 0) / n,
        maxMs: Math.max(0, ...timings),
      }
    },
  }
}
