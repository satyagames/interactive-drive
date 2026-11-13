import * as THREE from 'three'

/**
 * Floor ribbons -- skid marks and the Studio paint trail -- as one ring
 * buffer of quads in one draw call. Each segment is an independent quad
 * stamped with its birth time, colour and fade time; the shader fades it out
 * by age, so nothing is touched again after it is written and the oldest
 * segment is simply overwritten when the ring wraps.
 *
 * A *track* is one wheel's pen: `add(track, point, style)` draws from the
 * track's last point to `point`, `lift(track)` ends the stroke.
 */
const vertexShader = /* glsl */ `
  attribute vec4 aColor;   // rgb, opacity
  attribute vec2 aLife;    // birth time, fade seconds
  uniform float uTime;
  varying vec4 vColor;
  varying float vEdge;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - aLife.x;
    float fade = clamp(1.0 - age / aLife.y, 0.0, 1.0);
    vColor = vec4(aColor.rgb, aColor.a * fade * fade);
    vEdge = uv.x;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  varying vec4 vColor;
  varying float vEdge;
  #include <fog_pars_fragment>
  void main() {
    // Soft edges across the width, like a tyre print rather than a tape.
    float edge = 1.0 - pow(abs(vEdge * 2.0 - 1.0), 4.0);
    float alpha = vColor.a * edge;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function createRibbons({ capacity = 1200, minStep = 0.22, offset = 0.025 } = {}) {
  const positions = new Float32Array(capacity * 4 * 3)
  const colors = new Float32Array(capacity * 4 * 4)
  const lives = new Float32Array(capacity * 4 * 2).fill(-1e6)
  const uvs = new Float32Array(capacity * 4 * 2)
  const indices = new Uint32Array(capacity * 6)
  for (let i = 0; i < capacity; i++) {
    uvs.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8)
    indices.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6)
  }
  for (let i = 0; i < capacity * 4; i++) lives[i * 2 + 1] = 1

  const geometry = new THREE.BufferGeometry()
  const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
  const colorAttr = new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage)
  const lifeAttr = new THREE.BufferAttribute(lives, 2).setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', positionAttr)
  geometry.setAttribute('aColor', colorAttr)
  geometry.setAttribute('aLife', lifeAttr)
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  const material = new THREE.ShaderMaterial({
    name: 'vfx:ribbons',
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: true,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'vfx:ribbons'
  mesh.frustumCulled = false
  mesh.renderOrder = 2

  let head = 0
  let written = 0
  let dirtyFrom = -1
  let dirtyTo = -1
  let time = 0

  function track() {
    return { x: 0, y: 0, z: 0, down: false }
  }

  function lift(t) {
    t.down = false
  }

  /** Extend `t`'s stroke to (x, y, z) in `style` ({ color, opacity, width, fade }). */
  function add(t, x, y, z, style) {
    if (!t.down) {
      t.x = x
      t.y = y
      t.z = z
      t.down = true
      return
    }
    const dx = x - t.x
    const dz = z - t.z
    const length = Math.hypot(dx, dz)
    if (length < minStep) return
    if (length > 3) {
      // A teleport or a respawn: start over instead of drawing a long bar.
      t.x = x
      t.y = y
      t.z = z
      return
    }
    const half = style.width / 2
    const px = (-dz / length) * half
    const pz = (dx / length) * half
    const i = head
    const p = i * 12
    positions[p] = t.x + px
    positions[p + 1] = t.y + offset
    positions[p + 2] = t.z + pz
    positions[p + 3] = t.x - px
    positions[p + 4] = t.y + offset
    positions[p + 5] = t.z - pz
    positions[p + 6] = x + px
    positions[p + 7] = y + offset
    positions[p + 8] = z + pz
    positions[p + 9] = x - px
    positions[p + 10] = y + offset
    positions[p + 11] = z - pz
    const { r, g, b } = style.color
    for (let v = 0; v < 4; v++) {
      const c = (i * 4 + v) * 4
      colors[c] = r
      colors[c + 1] = g
      colors[c + 2] = b
      colors[c + 3] = style.opacity
      const l = (i * 4 + v) * 2
      lives[l] = time
      lives[l + 1] = style.fade
    }
    if (dirtyFrom < 0) dirtyFrom = i
    dirtyTo = i
    head = (head + 1) % capacity
    written = Math.min(written + 1, capacity)
    if (head === 0) flush() // the ring wrapped: send what's pending before the range restarts
    t.x = x
    t.y = y
    t.z = z
  }

  // Reused range objects (`addUpdateRange` allocates). At most two per
  // attribute per frame: before and after a wrap of the ring.
  const pool = [positionAttr, colorAttr, lifeAttr].map(() => [{ start: 0, count: 0 }, { start: 0, count: 0 }])
  const attrs = [positionAttr, colorAttr, lifeAttr]
  const sizes = [12, 16, 8]

  function flush() {
    if (dirtyFrom < 0) return
    const n = dirtyTo - dirtyFrom + 1
    for (let a = 0; a < 3; a++) {
      const attr = attrs[a]
      if (attr.updateRanges.length >= 2) {
        // Not uploaded since (a frame went unrendered): send the whole buffer.
        attr.updateRanges.length = 0
        pool[a][0].start = 0
        pool[a][0].count = attr.array.length
        attr.updateRanges.push(pool[a][0])
        continue
      }
      const range = pool[a][attr.updateRanges.length] // three clears the list after each upload
      range.start = dirtyFrom * sizes[a]
      range.count = n * sizes[a]
      attr.updateRanges.push(range)
      attr.needsUpdate = true
    }
    dirtyFrom = dirtyTo = -1
  }

  /** Once a frame: advance the clock and upload this frame's new segments. */
  function update(dt) {
    time += dt
    material.uniforms.uTime.value = time
    flush()
    mesh.visible = written > 0
  }

  return { mesh, track, add, lift, update, capacity }
}
