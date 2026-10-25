import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'

/**
 * Enter areas (doc 05 §4, reference pattern docs/pursuit-arena/01 §4.3):
 *
 *   drive in  -> the border draws itself round the square (fillTime)
 *             -> an ENTER (or TAP on touch) hint rises over it, and screen
 *                readers hear what's there
 *   Enter / E / gamepad A / the touch ↵ button, or stand still (dwellTime)
 *             -> the station opens; the car is held by a soft brake for
 *                holdTime unless you accelerate
 *   drive out -> a panel this area opened closes after closeDelay
 *
 * Every area also shows a faint border at all times so you can find it.
 * Areas from districts that stream in later are picked up by `add()`.
 */

const LIFT = 0.08
const BORDER = 0.3

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uSize;
  uniform float uProgress;
  uniform float uDwell;
  uniform float uActive;
  uniform float uBorder;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec2 m = vUv * uSize;
    float edge = min( min( m.x, uSize.x - m.x ), min( m.y, uSize.y - m.y ) );
    float band = 1.0 - smoothstep( uBorder, uBorder + 0.05, edge );
    // Perimeter position, 0..1 clockwise from the far edge's middle.
    vec2 c = vUv - 0.5;
    float around = atan( c.x, c.y ) / 6.2831853 + 0.5;
    float drawn = step( around, uProgress );
    float border = band * mix( 0.32, 1.0, drawn * uActive );
    // Standing still fills the square from the middle out.
    float inner = step( max( abs( c.x ), abs( c.y ) ) * 2.0, uDwell ) * 0.28 * uActive;
    float alpha = max( border, inner );
    if ( alpha < 0.01 ) discard;
    gl_FragColor = vec4( uColor, alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function createAreas({ scene, content, announce, onOpen, onAutoClose, isShowing }) {
  const group = new THREE.Group()
  group.name = 'areas'
  scene.add(group)

  const entries = []
  const local = new THREE.Vector3()
  const invQuat = new THREE.Quaternion()

  const hint = createHint()
  group.add(hint.sprite)

  let active = null
  let holdUntil = 0
  let clock = 0
  /** Area left with a panel it opened still up: close at `at` unless re-entered. */
  let pendingClose = null

  function add(areas) {
    for (const area of areas) {
      if (entries.some((e) => e.area === area)) continue
      const node = content.get(area.id)
      const colour = new THREE.Color(node?.group?.color ?? '#86BC25')
      const size = new THREE.Vector2(area.halfExtents.x * 2, area.halfExtents.z * 2)
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uColor: { value: colour },
          uSize: { value: size },
          uProgress: { value: 0 },
          uDwell: { value: 0 },
          uActive: { value: 0 },
          uBorder: { value: BORDER },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        fog: true,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y).rotateX(-Math.PI / 2), material)
      mesh.name = `area:${area.id}`
      mesh.position.set(area.position.x, LIFT, area.position.z)
      mesh.quaternion.copy(area.quaternion)
      mesh.renderOrder = 1
      group.add(mesh)
      entries.push({ area, node, mesh, phase: 'idle', progress: 0, dwell: 0 })
    }
  }

  function contains(area, position) {
    invQuat.copy(area.quaternion).invert()
    local.copy(position).sub(area.position).applyQuaternion(invQuat)
    return Math.abs(local.x) <= area.halfExtents.x && Math.abs(local.y) <= area.halfExtents.y + 1.5 &&
      Math.abs(local.z) <= area.halfExtents.z
  }

  /**
   * Per frame. `interact` is a function that consumes this frame's interact
   * press (only called when an area can use it). Returns `{ hold }`: true
   * while the car should be held by the soft brake.
   */
  function update(dt, { vehicle, interact }) {
    const a = settings.areas
    clock += dt
    const inside = entries.find((entry) => contains(entry.area, vehicle.position)) ?? null

    if (inside !== active) {
      if (active) leave(active)
      active = inside
      if (active) enter(active)
    }

    if (pendingClose && clock >= pendingClose.at) {
      if (isShowing(pendingClose.entry.area.id)) onAutoClose(pendingClose.entry.area)
      pendingClose = null
    }

    if (active) {
      const entry = active
      if (entry.phase === 'filling') {
        entry.progress = Math.min(entry.progress + dt / Math.max(a.fillTime, 1e-3), 1)
        if (entry.progress >= 1) {
          entry.phase = 'ready'
          hint.show(entry)
          if (entry.node) announce(t('areas.ready', { title: entry.node.title }))
        }
      }
      if (entry.phase === 'ready' || entry.phase === 'closed') {
        const still = vehicle.state.speed < a.dwellSpeed
        entry.dwell = entry.phase === 'ready' && still && a.dwellTime > 0 ? entry.dwell + dt / a.dwellTime : 0
        if (interact() || entry.dwell >= 1) open(entry)
      }
      if (entry.phase === 'open' && !isShowing(entry.area.id)) {
        // Closed by hand (button / Esc) while still inside: Enter reopens it.
        entry.phase = 'closed'
        entry.dwell = 0
      }
    }

    for (const entry of entries) {
      const u = entry.mesh.material.uniforms
      u.uProgress.value = entry.progress
      u.uDwell.value = Math.min(entry.dwell, 1)
      const target = entry === active ? 1 : 0
      u.uActive.value += (target - u.uActive.value) * (1 - Math.exp(-10 * dt))
    }
    hint.update(dt, clock)
    return { hold: clock < holdUntil }
  }

  function enter(entry) {
    if (pendingClose?.entry === entry) pendingClose = null
    // Coming back to an area whose panel is still up: just keep it.
    entry.phase = isShowing(entry.area.id) ? 'open' : 'filling'
    entry.progress = entry.phase === 'open' ? 1 : 0
    entry.dwell = 0
  }

  function leave(entry) {
    if (entry.phase === 'open' && isShowing(entry.area.id)) {
      pendingClose = { entry, at: clock + settings.areas.closeDelay }
    }
    entry.phase = 'idle'
    entry.progress = 0
    entry.dwell = 0
    hint.hide()
  }

  function open(entry) {
    entry.phase = 'open'
    entry.dwell = 0
    hint.hide()
    holdUntil = clock + settings.areas.holdTime
    onOpen(entry.area, entry.node)
  }

  return {
    group,
    add,
    update,
    /** The area the car is in, if any (for tests and later phases). */
    get active() {
      return active ? { id: active.area.id, phase: active.phase } : null
    },
  }
}

/** The floating ENTER / TAP label: one sprite, moved to whichever area is ready. */
function createHint() {
  const make = (text) => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(14, 16, 22, 0.86)'
    roundRect(ctx, 8, 8, 496, 144, 36)
    ctx.fill()
    ctx.strokeStyle = '#86BC25'
    ctx.lineWidth = 8
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 84px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 84)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
  const textures = { key: make(t('areas.enterHint')), touch: make(t('areas.tapHint')) }
  const material = new THREE.SpriteMaterial({ map: textures.key, transparent: true, depthTest: false, opacity: 0 })
  const sprite = new THREE.Sprite(material)
  sprite.name = 'area-hint'
  sprite.scale.set(2.6, 0.81, 1)
  sprite.renderOrder = 10
  sprite.visible = false

  let target = 0
  let base = new THREE.Vector3()
  const bob = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 0.12

  return {
    sprite,
    show(entry) {
      material.map = document.body.classList.contains('has-touch-pad') ? textures.touch : textures.key
      base = new THREE.Vector3(entry.area.position.x, 2.6, entry.area.position.z)
      sprite.position.copy(base)
      sprite.visible = true
      target = 1
    },
    hide() {
      target = 0
    },
    update(dt, clock) {
      material.opacity += (target - material.opacity) * (1 - Math.exp(-12 * dt))
      if (material.opacity < 0.01 && target === 0) sprite.visible = false
      if (sprite.visible) sprite.position.y = base.y + Math.sin(clock * 3) * bob
    },
  }
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
