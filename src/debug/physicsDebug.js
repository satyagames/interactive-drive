import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Wireframe overlay of every Rapier collider, toggled from the debug panel.
 * Useful for checking that a visual mesh and its collider actually agree.
 */
export function createPhysicsDebug({ scene, world }) {
  const geometry = new THREE.BufferGeometry()
  const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })
  const lines = new THREE.LineSegments(geometry, material)
  lines.frustumCulled = false
  lines.renderOrder = 999
  lines.visible = false
  scene.add(lines)

  function update() {
    lines.visible = settings.debug.showColliders
    if (!lines.visible) return

    const buffers = world.debugRender()
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4))
  }

  return { lines, update }
}
