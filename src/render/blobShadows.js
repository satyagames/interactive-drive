import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Fake floor shadows for any number of props, in one draw call.
 *
 * Modelled on the reference (docs/pursuit-arena/01 §4): no raycasts and no
 * shadow maps. Each blob lies flat on its floor height, shifted along a fixed
 * sun direction by how high its owner is, and fades with height and with tilt
 * (a box on its side casts a thinner-looking blob). The car keeps its own
 * raycast blob (`shadowBlob.js`) because it alone drives up ramps.
 *
 * API: `add({ sizeX, sizeZ, alpha, offsetY, floorY })` returns a handle;
 * `set(handle, position, quaternion)` each frame for anything that moved;
 * `remove(handle)`; `update()` once per frame uploads what changed.
 */

const VERTEX = /* glsl */ `
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vAlpha;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vAlpha;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    // Solid-ish core, long soft edge (same profile as the car's blob).
    float r = length( vUv * 2.0 - 1.0 );
    float a = smoothstep( 1.0, 0.45, r ) * vAlpha * uOpacity;
    if ( a <= 0.002 ) discard;
    gl_FragColor = vec4( uColor, a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/** Lift off the floor, m -- just enough to beat z-fighting. */
const LIFT = 0.025

export function createBlobShadows({ scene, capacity = 512 }) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
  alpha.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aAlpha', alpha)

  const material = new THREE.ShaderMaterial({
    name: 'blob-shadows',
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(settings.blobShadows.tint) },
      uOpacity: { value: settings.blobShadows.opacity },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  })

  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.name = 'blob-shadows'
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.count = 0
  scene.add(mesh)

  /** Slot -> blob record; `null` marks a free slot. */
  const blobs = new Array(capacity).fill(null)
  const free = []
  let highWater = 0
  let dirty = false

  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  const matrix = new THREE.Matrix4()
  const axisX = new THREE.Vector3()
  const yAxis = new THREE.Vector3(0, 1, 0)

  function add({ sizeX = 1, sizeZ = 1, alpha: blobAlpha = 1, offsetY = 0, floorY = 0 } = {}) {
    const slot = free.length ? free.pop() : highWater++
    if (slot >= capacity) throw new Error(`blobShadows: capacity ${capacity} exceeded`)
    blobs[slot] = { sizeX, sizeZ, alpha: blobAlpha, offsetY, floorY }
    mesh.setMatrixAt(slot, zero)
    alpha.setX(slot, 0)
    mesh.count = highWater
    dirty = true
    return slot
  }

  function remove(slot) {
    if (!blobs[slot]) return
    blobs[slot] = null
    free.push(slot)
    mesh.setMatrixAt(slot, zero)
    alpha.setX(slot, 0)
    dirty = true
  }

  /** Hide blob `slot` until its next `set` (e.g. a prop not revealed yet). */
  function hide(slot) {
    if (!blobs[slot]) return
    mesh.setMatrixAt(slot, zero)
    alpha.setX(slot, 0)
    dirty = true
  }

  /** Place blob `slot` for an owner at `position` / `quaternion` (any {x,y,z(,w)}). */
  function set(slot, position, quaternion) {
    const blob = blobs[slot]
    if (!blob) return
    const b = settings.blobShadows

    const height = Math.max(position.y + blob.offsetY - blob.floorY, 0)
    let fade = 1 - Math.min(height / Math.max(b.fadeHeight, 1e-3), 1)
    fade **= b.fadePower

    // Owner's local X, flattened: gives the blob's yaw, and how far it has
    // tipped towards vertical gives the tilt fade (reference behaviour).
    axisX.set(1, 0, 0).applyQuaternion(quaternion)
    const tilt = Math.abs(axisX.y)
    const tiltFade = THREE.MathUtils.clamp(1 - tilt * 1.4, 0, 1)
    const yaw = Math.atan2(-axisX.z, axisX.x)

    const a = blob.alpha * fade * tiltFade
    alpha.setX(slot, a)
    if (a <= 0) {
      mesh.setMatrixAt(slot, zero)
    } else {
      matrix.makeRotationAxis(yAxis, yaw)
      const e = matrix.elements
      // Scale the rotated basis columns in place: X by sizeX, Z by sizeZ.
      e[0] *= blob.sizeX; e[1] *= blob.sizeX; e[2] *= blob.sizeX
      e[8] *= blob.sizeZ; e[9] *= blob.sizeZ; e[10] *= blob.sizeZ
      matrix.setPosition(
        position.x + b.sunOffsetX * height,
        blob.floorY + LIFT,
        position.z + b.sunOffsetZ * height,
      )
      mesh.setMatrixAt(slot, matrix)
    }
    dirty = true
  }

  function update() {
    const b = settings.blobShadows
    mesh.visible = b.enabled && highWater > free.length
    material.uniforms.uOpacity.value = b.opacity
    if (material.uniforms.uColor.value.getHex() !== b.tint) material.uniforms.uColor.value.setHex(b.tint)
    if (!dirty) return
    mesh.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    dirty = false
  }

  return {
    mesh,
    add,
    remove,
    hide,
    set,
    update,
    get count() {
      return highWater - free.length
    },
  }
}
