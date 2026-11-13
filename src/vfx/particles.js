import * as THREE from 'three'

import { CELLS } from './atlas.js'

/**
 * A pooled, instanced particle system: one draw call for every live
 * particle, simulated on the CPU in a flat Float32Array (no per-particle
 * objects, so nothing for the GC to collect).
 *
 * Live particles are kept packed at the front of the array -- a dead one is
 * overwritten by the last live one -- so the GPU draws exactly `count`
 * instances and the per-frame upload is only the live range.
 *
 * Each spawn takes a *preset* (a plain object made once, at module scope)
 * whose ranges are rolled per particle:
 *
 *   { cat, cell, life: [min, max], size: [min, max], grow (end size factor),
 *     color: THREE.Color | THREE.Color[], intensity (HDR multiplier, > 1
 *     reaches the bloom band), alpha, gravity (m/s^2), drag (1/s), bounce
 *     (restitution off the floor given to `setLastFloor`), spin: [min, max]
 *     rad/s, rotation (fixed start angle; random if unset), tumble
 *     (paper/confetti flip),
 *     fadeStart (0..1 of life before the fade-out begins) }
 *
 * `cat` names a category with an optional cap (`limits`), so e.g. confetti
 * can never take more than its 400 slots from the dust.
 */

// Per-particle record layout.
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5
const AGE = 6, LIFE = 7, SIZE = 8, GROW = 9
const R = 10, G = 11, B = 12, ALPHA = 13
const GRAV = 14, DRAG = 15, BOUNCE = 16, FLOOR = 17
const ROT = 18, SPIN = 19, CELLF = 20, TUMBLE = 21, FADE = 22, CAT = 23
const STRIDE = 24

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aColor;
  attribute vec4 aParams; // size, rotation, cell, tumble
  uniform float uCells;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
    float c = cos(aParams.y);
    float s = sin(aParams.y);
    vec2 corner = position.xy;
    // Tumbling sheets flip about their own axis as well as spinning.
    corner.x *= mix(1.0, cos(aParams.y * 1.7), aParams.w);
    mvPosition.xy += mat2(c, s, -s, c) * corner * aParams.x;
    gl_Position = projectionMatrix * mvPosition;
    float cell = aParams.z;
    vec2 origin = vec2(mod(cell, uCells), uCells - 1.0 - floor(cell / uCells));
    vUv = (origin + uv) / uCells;
    vColor = aColor;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    float mask = texture2D(uAtlas, vUv).a;
    float alpha = mask * vColor.a;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function createParticles({ capacity, atlas, limits = {}, name = 'vfx:particles', renderOrder = 10 }) {
  const data = new Float32Array(capacity * STRIDE)
  const offsets = new Float32Array(capacity * 3)
  const colors = new Float32Array(capacity * 4)
  const params = new Float32Array(capacity * 4)
  let count = 0

  // Category caps: index -> { max, live }.
  const categories = []
  const categoryIndex = new Map()
  const presetCategory = new WeakMap()
  function category(cat) {
    let index = categoryIndex.get(cat)
    if (index === undefined) {
      index = categories.length
      categoryIndex.set(cat, index)
      categories.push({ max: limits[cat] ?? capacity, live: 0 })
    }
    return index
  }

  const quad = new THREE.PlaneGeometry(1, 1)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('uv', quad.getAttribute('uv'))
  const offsetAttr = new THREE.InstancedBufferAttribute(offsets, 3).setUsage(THREE.DynamicDrawUsage)
  const colorAttr = new THREE.InstancedBufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage)
  const paramsAttr = new THREE.InstancedBufferAttribute(params, 4).setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aOffset', offsetAttr)
  geometry.setAttribute('aColor', colorAttr)
  geometry.setAttribute('aParams', paramsAttr)
  geometry.instanceCount = 0

  const material = new THREE.ShaderMaterial({
    name,
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCells: { value: CELLS } }]),
    transparent: true,
    depthWrite: false,
    fog: true,
  })
  // The atlas is shared, not cloned by `merge`.
  material.uniforms.uAtlas = { value: atlas }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.frustumCulled = false // particles roam the whole arena; the cull would need a live bound
  mesh.renderOrder = renderOrder

  const rand = (range) => (Array.isArray(range) ? range[0] + Math.random() * (range[1] - range[0]) : range)

  /**
   * One particle at (x, y, z) moving at (vx, vy, vz). `color` overrides the
   * preset's. Returns false when the pool or the category is full.
   */
  function spawn(preset, x, y, z, vx = 0, vy = 0, vz = 0, color = null) {
    let cat = presetCategory.get(preset)
    if (cat === undefined) {
      cat = category(preset.cat ?? 'default')
      presetCategory.set(preset, cat)
    }
    const group = categories[cat]
    if (count >= capacity || group.live >= group.max) return false
    group.live += 1
    const o = count * STRIDE
    count += 1
    data[o + PX] = x
    data[o + PY] = y
    data[o + PZ] = z
    data[o + VX] = vx
    data[o + VY] = vy
    data[o + VZ] = vz
    data[o + AGE] = 0
    data[o + LIFE] = rand(preset.life)
    data[o + SIZE] = rand(preset.size)
    data[o + GROW] = preset.grow ?? 1
    let c = color ?? preset.color
    if (Array.isArray(c)) c = c[(Math.random() * c.length) | 0]
    const k = preset.intensity ?? 1
    data[o + R] = c.r * k
    data[o + G] = c.g * k
    data[o + B] = c.b * k
    data[o + ALPHA] = preset.alpha ?? 1
    data[o + GRAV] = preset.gravity ?? 0
    data[o + DRAG] = preset.drag ?? 0
    data[o + BOUNCE] = preset.bounce ?? 0
    data[o + FLOOR] = preset.floor ?? -1e9
    data[o + ROT] = preset.rotation ?? Math.random() * Math.PI * 2
    data[o + SPIN] = rand(preset.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1)
    data[o + CELLF] = preset.cell
    data[o + TUMBLE] = preset.tumble ? 1 : 0
    data[o + FADE] = preset.fadeStart ?? 0
    data[o + CAT] = cat
    return true
  }

  /** Set the floor height for the particle just spawned (bouncing debris). */
  function setLastFloor(y) {
    if (count > 0) data[(count - 1) * STRIDE + FLOOR] = y
  }

  function kill(i) {
    const o = i * STRIDE
    categories[data[o + CAT]].live -= 1
    count -= 1
    if (i !== count) data.copyWithin(o, count * STRIDE, count * STRIDE + STRIDE)
  }

  /** Advance every particle by `dt`; `upload()` afterwards sends them to the GPU. */
  function update(dt) {
    let i = 0
    while (i < count) {
      const o = i * STRIDE
      const age = data[o + AGE] + dt
      if (age >= data[o + LIFE]) {
        kill(i)
        continue // the last particle now sits at i
      }
      data[o + AGE] = age
      const damp = 1 / (1 + data[o + DRAG] * dt)
      data[o + VX] *= damp
      data[o + VY] = (data[o + VY] - data[o + GRAV] * dt) * damp
      data[o + VZ] *= damp
      data[o + PX] += data[o + VX] * dt
      data[o + PY] += data[o + VY] * dt
      data[o + PZ] += data[o + VZ] * dt
      if (data[o + PY] < data[o + FLOOR]) {
        // Debris lands: bounce once or twice, then lie flat and stop spinning.
        data[o + PY] = data[o + FLOOR]
        data[o + VY] = -data[o + VY] * data[o + BOUNCE]
        data[o + VX] *= 0.5
        data[o + VZ] *= 0.5
        data[o + SPIN] *= 0.4
      }
      data[o + ROT] += data[o + SPIN] * dt
      i += 1
    }
  }

  /** Write the live range into the instance attributes (once a frame, after any spawns). */
  function upload() {
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE
      const t = data[o + AGE] / data[o + LIFE]
      const fadeStart = data[o + FADE]
      const fade = t <= fadeStart ? 1 : 1 - (t - fadeStart) / (1 - fadeStart)
      const i3 = i * 3
      const i4 = i * 4
      offsets[i3] = data[o + PX]
      offsets[i3 + 1] = data[o + PY]
      offsets[i3 + 2] = data[o + PZ]
      colors[i4] = data[o + R]
      colors[i4 + 1] = data[o + G]
      colors[i4 + 2] = data[o + B]
      colors[i4 + 3] = data[o + ALPHA] * fade
      params[i4] = data[o + SIZE] * (1 + (data[o + GROW] - 1) * t)
      params[i4 + 1] = data[o + ROT]
      params[i4 + 2] = data[o + CELLF]
      params[i4 + 3] = data[o + TUMBLE]
    }
    geometry.instanceCount = count
    mesh.visible = count > 0
    if (count === 0) return
    markLive(offsetAttr, 3)
    markLive(colorAttr, 4)
    markLive(paramsAttr, 4)
  }

  // One reused range object per attribute: `addUpdateRange` would allocate one a frame.
  const ranges = new Map([[offsetAttr, { start: 0, count: 0 }], [colorAttr, { start: 0, count: 0 }], [paramsAttr, { start: 0, count: 0 }]])
  function markLive(attr, size) {
    const range = ranges.get(attr)
    range.count = count * size
    attr.updateRanges.length = 0
    attr.updateRanges.push(range)
    attr.needsUpdate = true
  }

  /** Remove every live particle (reset, or a quality change). */
  function clear() {
    count = 0
    for (const group of categories) group.live = 0
    upload()
  }

  return {
    mesh,
    spawn,
    setLastFloor,
    update,
    upload,
    clear,
    capacity,
    get count() {
      return count
    },
    /** Live particles in one category. */
    live(cat) {
      const index = categoryIndex.get(cat)
      return index === undefined ? 0 : categories[index].live
    },
  }
}
