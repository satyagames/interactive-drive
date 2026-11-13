import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'

/**
 * In-world feedback for "you can press Enter here" (doc 11 R3, after the
 * reference's Area: a fence that pops up round an active area, and the key
 * to press written on the floor beside it).
 *
 * Two draw calls for the whole arena, however many areas there are:
 *
 *   fence   one InstancedMesh of open boxes (four walls, no lid). A marker
 *           that becomes active rises 0 -> `fence.height` with an overshoot
 *           (back.out) and drops when it stops being active. The walls fade
 *           upwards and carry slow diagonal stripes.
 *   labels  one InstancedMesh of floor quads over a small canvas atlas:
 *           ENTER / TAP beside an active marker (fading with it), and the
 *           permanent plates of the reset pads.
 *
 * Station areas (`areas.js`) and exhibit hotspots (`showcase/hotspots.js`)
 * both drive it through `set(id, spec)` / `clear(id)` / `key(id, on)`. The
 * HUD hint and the announcer remain the accessible mirror of all of it.
 *
 * Under reduced motion the fence appears at full height with no stripes
 * moving, and labels switch rather than fade.
 */
const MAX_FENCES = 8
const MAX_LABELS = 16
/** Atlas cells, stacked: [name, text key]. */
const CELLS = [['key', 'areas.enterHint'], ['touch', 'areas.tapHint'], ['reset', 'areas.resetPlate']]
const CELL_W = 512
const CELL_H = 160

const FENCE_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aLevel;
  varying vec3 vColor;
  varying float vLevel;
  varying float vUp;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vColor = aColor;
    vLevel = aLevel;
    vUp = position.y;
    vec4 world = modelMatrix * instanceMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const FENCE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uBorderAlpha;
  uniform float uStrikeAlpha;
  uniform float uStrikeWidth;
  varying vec3 vColor;
  varying float vLevel;
  varying float vUp;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    // Strongest at the floor, gone at the top.
    float fade = pow( 1.0 - vUp, 1.6 );
    float stripe = step( 0.5, fract( ( vWorld.x + vWorld.z + vWorld.y ) / uStrikeWidth - uTime ) );
    float alpha = vLevel * fade * ( uBorderAlpha + stripe * uStrikeAlpha );
    if ( alpha < 0.004 ) discard;
    gl_FragColor = vec4( vColor, alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

const LABEL_VERTEX = /* glsl */ `
  attribute vec4 aRect;
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vAlpha;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = aRect.xy + uv * aRect.zw;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const LABEL_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vAlpha;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec4 texel = texture2D( uMap, vUv );
    float alpha = texel.a * vAlpha;
    if ( alpha < 0.01 ) discard;
    gl_FragColor = vec4( texel.rgb, alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function createAreaMarkers({ scene, reducedMotion = () => false }) {
  const group = new THREE.Group()
  group.name = 'area-markers'
  scene.add(group)

  // ---- fence batch ------------------------------------------------------------

  const fenceGeometry = createFenceGeometry()
  const fenceColors = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FENCES * 3), 3)
  const fenceLevels = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FENCES), 1)
  fenceColors.setUsage(THREE.DynamicDrawUsage)
  fenceLevels.setUsage(THREE.DynamicDrawUsage)
  fenceGeometry.setAttribute('aColor', fenceColors)
  fenceGeometry.setAttribute('aLevel', fenceLevels)
  const fenceMaterial = new THREE.ShaderMaterial({
    name: 'area-fence',
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uBorderAlpha: { value: 0.5 },
      uStrikeAlpha: { value: 0.25 },
      uStrikeWidth: { value: 0.9 },
    },
    vertexShader: FENCE_VERTEX,
    fragmentShader: FENCE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  })
  const fenceMesh = new THREE.InstancedMesh(fenceGeometry, fenceMaterial, MAX_FENCES)
  fenceMesh.name = 'area-fence'
  fenceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  fenceMesh.frustumCulled = false
  fenceMesh.renderOrder = 2
  fenceMesh.count = 0
  group.add(fenceMesh)

  // ---- label batch ------------------------------------------------------------

  const atlas = createAtlas()
  const labelGeometry = new THREE.PlaneGeometry(1, 1)
  const labelRects = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LABELS * 4), 4)
  const labelAlphas = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LABELS), 1)
  labelRects.setUsage(THREE.DynamicDrawUsage)
  labelAlphas.setUsage(THREE.DynamicDrawUsage)
  labelGeometry.setAttribute('aRect', labelRects)
  labelGeometry.setAttribute('aAlpha', labelAlphas)
  const labelMaterial = new THREE.ShaderMaterial({
    name: 'area-labels',
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uMap: { value: atlas.texture } },
    vertexShader: LABEL_VERTEX,
    fragmentShader: LABEL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    // Flat on the floor, where the road markings are: never z-fight them.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
  const labelMesh = new THREE.InstancedMesh(labelGeometry, labelMaterial, MAX_LABELS)
  labelMesh.name = 'area-labels'
  labelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  labelMesh.frustumCulled = false
  labelMesh.renderOrder = 3
  labelMesh.count = 0
  group.add(labelMesh)

  // ---- state ------------------------------------------------------------------

  /** id -> marker. A marker lives until it has dropped and faded right out. */
  const markers = new Map()
  /** Permanent floor plates (the reset pads). */
  const plates = []

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const euler = new THREE.Euler()
  const colour = new THREE.Color()
  const UP = new THREE.Vector3(0, 1, 0)
  let clock = 0

  /**
   * Make `id` active. `spec`: { x, z, yaw (radians), sizeX, sizeZ, color }.
   * Calling it again while active just moves the marker.
   */
  function set(id, spec) {
    let marker = markers.get(id)
    if (!marker) {
      marker = { rise: 0, keyAlpha: 0, key: false, cell: 'key' }
      markers.set(id, marker)
    }
    Object.assign(marker, { x: spec.x, z: spec.z, yaw: spec.yaw ?? 0, sizeX: spec.sizeX, sizeZ: spec.sizeZ, active: true })
    marker.color = colour.set(spec.color ?? '#86BC25').clone()
    return marker
  }

  /** `id` is no longer active: its fence drops and its key label fades. */
  function clear(id) {
    const marker = markers.get(id)
    if (!marker) return
    marker.active = false
    marker.key = false
  }

  /** Show (or hide) the key to press beside `id`. */
  function key(id, on) {
    const marker = markers.get(id)
    if (!marker) return
    if (on && !marker.key) marker.cell = document.body.classList.contains('has-touch-pad') ? 'touch' : 'key'
    marker.key = Boolean(on) && marker.active
  }

  /**
   * A permanent label on the floor. `spec`: { x, z, width, cell, shown? }.
   * `shown()` (optional) hides it while it returns false (a district not yet revealed).
   */
  function addPlate(spec) {
    const plate = { ...spec, alpha: 0 }
    plates.push(plate)
    return plate
  }

  /** Where the label goes: just outside the marker, on the side nearest the camera. */
  function labelSpot(marker, out) {
    const azimuth = THREE.MathUtils.degToRad(settings.isoCamera.azimuth)
    // Unit vector on the floor from the marker towards the camera.
    const dx = Math.sin(azimuth)
    const dz = Math.cos(azimuth)
    // How far the (rotated) rectangle reaches in that direction.
    const c = Math.cos(marker.yaw)
    const s = Math.sin(marker.yaw)
    const reach = (marker.sizeX / 2) * Math.abs(dx * c - dz * s) + (marker.sizeZ / 2) * Math.abs(dx * s + dz * c)
    const gap = settings.areas.label.gap + settings.areas.label.width * (CELL_H / CELL_W) / 2
    return out.set(marker.x + dx * (reach + gap), 0, marker.z + dz * (reach + gap))
  }

  function writeLabel(index, x, z, width, cell, alpha) {
    const azimuth = THREE.MathUtils.degToRad(settings.isoCamera.azimuth)
    euler.set(-Math.PI / 2, azimuth, 0, 'YXZ')
    quaternion.setFromEuler(euler)
    position.set(x, settings.areas.label.lift, z)
    scale.set(width, width * (CELL_H / CELL_W), 1)
    labelMesh.setMatrixAt(index, matrix.compose(position, quaternion, scale))
    const rect = atlas.rects[cell]
    labelRects.setXYZW(index, rect[0], rect[1], rect[2], rect[3])
    labelAlphas.setX(index, alpha)
  }

  function update(dt) {
    const f = settings.areas.fence
    const instant = reducedMotion()
    if (!instant) clock += dt
    fenceMaterial.uniforms.uTime.value = clock * f.strikeSpeed
    fenceMaterial.uniforms.uBorderAlpha.value = f.borderAlpha
    fenceMaterial.uniforms.uStrikeAlpha.value = f.strikeAlpha
    fenceMaterial.uniforms.uStrikeWidth.value = f.strikeWidth

    let fences = 0
    let labels = 0
    for (const [id, marker] of markers) {
      // Rise with an overshoot, drop quickly.
      if (instant) marker.rise = marker.active ? 1 : 0
      else if (marker.active) marker.rise = Math.min(marker.rise + dt / Math.max(f.riseTime, 1e-3), 1)
      else marker.rise = Math.max(marker.rise - dt / Math.max(f.dropTime, 1e-3), 0)
      const keyTarget = marker.key ? 1 : 0
      marker.keyAlpha = instant ? keyTarget : marker.keyAlpha + (keyTarget - marker.keyAlpha) * (1 - Math.exp(-settings.areas.label.fadeRate * dt))
      if (!marker.active && marker.rise <= 0 && marker.keyAlpha < 0.01) {
        markers.delete(id)
        continue
      }
      const height = f.enabled ? f.height * (marker.active ? backOut(marker.rise, f.overshoot) : marker.rise * marker.rise) : 0
      if (height > 0.001 && fences < MAX_FENCES) {
        position.set(marker.x, f.lift, marker.z)
        quaternion.setFromAxisAngle(UP, marker.yaw)
        scale.set(marker.sizeX, height, marker.sizeZ)
        fenceMesh.setMatrixAt(fences, matrix.compose(position, quaternion, scale))
        fenceColors.setXYZ(fences, marker.color.r, marker.color.g, marker.color.b)
        fenceLevels.setX(fences, Math.min(marker.rise * 2, 1))
        fences += 1
      }
      if (marker.keyAlpha >= 0.01 && settings.areas.label.enabled && labels < MAX_LABELS) {
        labelSpot(marker, position)
        writeLabel(labels, position.x, position.z, settings.areas.label.width, marker.cell, marker.keyAlpha)
        labels += 1
      }
    }
    for (const plate of plates) {
      const target = plate.shown ? (plate.shown() ? 1 : 0) : 1
      plate.alpha = instant ? target : plate.alpha + (target - plate.alpha) * (1 - Math.exp(-4 * dt))
      if (plate.alpha < 0.01 || labels >= MAX_LABELS) continue
      writeLabel(labels, plate.x, plate.z, plate.width, plate.cell, plate.alpha)
      labels += 1
    }

    fenceMesh.count = fences
    labelMesh.count = labels
    if (fences) {
      fenceMesh.instanceMatrix.needsUpdate = true
      fenceColors.needsUpdate = true
      fenceLevels.needsUpdate = true
    }
    if (labels) {
      labelMesh.instanceMatrix.needsUpdate = true
      labelRects.needsUpdate = true
      labelAlphas.needsUpdate = true
    }
  }

  return {
    group,
    set,
    clear,
    key,
    addPlate,
    update,
    labelSpot: (id, out = new THREE.Vector3()) => (markers.has(id) ? labelSpot(markers.get(id), out) : null),
    /** For tests: the live state of a marker, or null. */
    state(id) {
      const m = markers.get(id)
      if (!m) return null
      const f = settings.areas.fence
      return {
        active: m.active, rise: m.rise, key: m.key, keyAlpha: m.keyAlpha, cell: m.cell,
        height: f.height * (m.active ? backOut(m.rise, f.overshoot) : m.rise * m.rise),
      }
    },
    get fences() {
      return fenceMesh.count
    },
    get labels() {
      return labelMesh.count
    },
    plates,
  }
}

/** back.out(s): 0 -> 1 with an overshoot of about 10% at s = 2. */
function backOut(t, s) {
  const u = t - 1
  return 1 + (s + 1) * u * u * u + s * u * u
}

/** Four walls of a unit box (x, z in -0.5..0.5, y in 0..1), no lid or floor. */
function createFenceGeometry() {
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
  const positions = []
  const indices = []
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const base = positions.length / 3
    positions.push(ax, 0, az, bx, 0, bz, bx, 1, bz, ax, 1, az)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/** ENTER, TAP and the reset plate, one canvas. Copy comes from content/ui.json. */
function createAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = CELL_W
  canvas.height = CELL_H * CELLS.length
  const ctx = canvas.getContext('2d')
  const rects = {}
  CELLS.forEach(([name, textKey], row) => {
    const y = row * CELL_H
    const reset = name === 'reset'
    ctx.fillStyle = reset ? 'rgba(134, 188, 37, 0.92)' : 'rgba(14, 16, 22, 0.86)'
    roundRect(ctx, 8, y + 8, CELL_W - 16, CELL_H - 16, 36)
    ctx.fill()
    ctx.strokeStyle = reset ? '#0e1016' : '#86BC25'
    ctx.lineWidth = 8
    ctx.stroke()
    ctx.fillStyle = reset ? '#0e1016' : '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = t(textKey)
    let size = 84
    do {
      ctx.font = `700 ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
      size -= 4
    } while (ctx.measureText(text).width > CELL_W - 72 && size > 24)
    ctx.fillText(text, CELL_W / 2, y + CELL_H / 2 + 4)
    // The canvas is flipped into the texture: v runs up.
    rects[name] = [0, 1 - (row + 1) / CELLS.length, 1, 1 / CELLS.length]
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, rects }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
