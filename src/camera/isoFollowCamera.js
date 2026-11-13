import * as THREE from 'three'

import { rebuild, settings } from '../config.js'

/**
 * The reference's camera: a fixed world-space offset (south-east of the car,
 * 32 deg down, 40 deg FOV) that eases after the car but never rotates with it
 * -- see docs/pursuit-arena/07 §2 for every number.
 *
 * The aim point follows the car's X/Z only and stays on the floor plane, so
 * jumps lift the car out of a steady frame instead of bobbing the camera.
 *
 * Zoom is one 0..1 value (wheel, pinch, or the intro tween) mapped to a
 * distance range. Easing is frame-rate independent: the reference's
 * per-frame factors are converted to rates in config.js.
 *
 * Map look (doc 11 R1): drag the floor, Alt + arrows, a click on the minimap
 * or the Overview key move the view away from the car; driving, F, a
 * double-click or the "Back to car" chip glide it home. Under reduced motion
 * every one of those transitions is instant.
 */

/**
 * Below this aspect (portrait) the camera backs off. Landscape screens of any
 * shape keep the reference's exact distance, as the reference itself does.
 */
const PORTRAIT_ASPECT = 1
/** Cap on how far the portrait correction may push the camera back. */
const MAX_FRAMING_SCALE = 1.6
/** Below this zoom you are closer than `minDistance` -- reserved for the intro. */
const MIN_USER_ZOOM = 0

/**
 * Things drawn over the canvas that let presses through (`pointer-events:
 * none`): a drag must not start under them. The joystick gets a wider margin
 * so a thumb landing just off the ring never moves the map. Toasts are left
 * out on purpose: they come and go, and a stack of them would otherwise make
 * the middle of the floor undraggable for seconds.
 */
const PAN_BLOCKERS = '#game-hud, .hud__top-right, #hint, #minimap, #pan-home, #dash-hud, #hud, #station-panel, #touch [data-action]'
const JOYSTICK = '#touch [data-joystick]'

export function createIsoFollowCamera(camera, canvas, { reducedMotion = () => false } = {}) {
  const s = rebuild.worldScale

  /** What the camera follows: the car (plus its lead) or the Explore focus point. */
  const target = new THREE.Vector3()
  /** `target`, smoothed. */
  const followEased = new THREE.Vector3()
  /** Where the camera looks: `followEased` plus the pan. */
  const targetEased = new THREE.Vector3()
  const offsetDir = new THREE.Vector3()
  let initialised = false

  let zoom = settings.isoCamera.defaultZoom
  let zoomTarget = zoom
  let intro = null
  /** Explore mode: aim here instead of at the car (null = follow the car). */
  let focusPoint = null
  let flight = null

  // ---- zoom input ---------------------------------------------------------

  const onWheel = (event) => {
    zoomTarget = clampZoom(zoomTarget + event.deltaY * settings.isoCamera.wheelSensitivity)
  }
  canvas.addEventListener('wheel', onWheel, { passive: true })

  // ---- drag the floor to look around (the reference's camera pan) ---------
  //
  // The point grabbed on the floor stays under the pointer while dragging.
  // One mouse button or one finger pans; a second finger on the canvas hands
  // over to pinch-zoom. Only pointers that went down on the canvas count, so a
  // thumb on the joystick is never the "second finger". Any driving input
  // glides the view back to the car (see `update`).
  //
  // The pan is an offset from the followed point. `panMode`:
  //   'free'   the offset is held as the visitor left it
  //   'home'   gliding back to the car
  //   'point'  gliding to, then pinned on, a world point (minimap, Overview)

  const panOffset = new THREE.Vector3()
  const panGoal = new THREE.Vector3()
  const glideFrom = new THREE.Vector3()
  const pin = new THREE.Vector3()
  let panMode = 'free'
  let gliding = false
  let glideTime = 0
  let glideDuration = 0
  /** Overview (O): the zoom to go back to, or null when not in the overview. */
  let overview = null

  const lead = new THREE.Vector3()
  const leadTarget = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ndc = new THREE.Vector2()
  const grabbed = new THREE.Vector3()
  const under = new THREE.Vector3()
  const pointers = new Map() // pointerId -> { x, y }, canvas pointers only
  let drag = null // { id, startX, startY, active }
  let pinch = null // { startDistance, startZoom }
  let lastTap = null // { time, x, y }
  let pitchCurrent = settings.isoCamera.pitch
  let tiltCurrent = 1
  // Follow smoothing state (exact solution for a target moving in a line).
  const prevTarget = new THREE.Vector3()
  const targetVel = new THREE.Vector3()
  const lag = new THREE.Vector3()

  function floorPointAt(clientX, clientY, out) {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    camera.updateMatrixWorld()
    raycaster.setFromCamera(ndc, camera)
    return raycaster.ray.intersectPlane(floorPlane, out)
  }

  const inside = (el, x, y, margin = 0) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    return x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin
  }

  /** True when a press at x, y belongs to the HUD, a panel, the minimap or the touch pad. */
  function blocked(x, y) {
    const joystick = document.querySelector(JOYSTICK)
    if (joystick && inside(joystick, x, y, settings.isoCamera.pan.joystickMargin)) return true
    for (const el of document.querySelectorAll(PAN_BLOCKERS)) if (inside(el, x, y)) return true
    return false
  }

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function endDrag() {
    if (!drag) return
    if (drag.active) {
      try {
        canvas.releasePointerCapture?.(drag.id)
      } catch {
        // The pointer is already gone; nothing to release.
      }
    }
    drag = null
    canvas.classList.remove('is-panning')
  }

  const onPointerDown = (event) => {
    if (!settings.isoCamera.pan.enabled || settings.cameraMode !== 'iso') return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (blocked(event.clientX, event.clientY)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2) { // second finger: pinch takes over, the pan stays where it is
      endDrag()
      lastTap = null
      pinch = { startDistance: pinchDistance(), startZoom: zoomTarget }
      return
    }
    if (pointers.size > 2) return
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, active: false }
  }

  const onPointerMove = (event) => {
    const pointer = pointers.get(event.pointerId)
    if (!pointer) return
    pointer.x = event.clientX
    pointer.y = event.clientY
    if (pinch) {
      if (pointers.size === 2 && pinch.startDistance > 0) {
        zoomTarget = clampZoom(pinch.startZoom - (pinchDistance() / pinch.startDistance - 1))
      }
      return
    }
    if (!drag || event.pointerId !== drag.id) return
    if (!drag.active) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (moved < settings.isoCamera.pan.dragThreshold) return
      if (!floorPointAt(drag.startX, drag.startY, grabbed)) return
      drag.active = true
      panMode = 'free'
      gliding = false
      // Capture can throw if the pointer has already gone (see touch.js); the
      // drag still works without it while the pointer stays over the canvas.
      try {
        canvas.setPointerCapture?.(event.pointerId)
      } catch {
        // No capture.
      }
      canvas.classList.add('is-panning')
    }
    if (!floorPointAt(event.clientX, event.clientY, under)) return
    const dx = grabbed.x - under.x
    const dz = grabbed.z - under.z
    // Move the view at once so the grabbed point stays under the pointer.
    panOffset.x += dx
    panOffset.z += dz
    camera.position.x += dx
    camera.position.z += dz
  }

  const onPointerUp = (event) => {
    if (!pointers.delete(event.pointerId)) return
    if (pinch) {
      // The finger left on the glass does not start a pan: lift and press again.
      if (pointers.size === 0) pinch = null
      return
    }
    if (!drag || event.pointerId !== drag.id) return
    const tapped = !drag.active && event.type === 'pointerup'
    endDrag()
    if (!tapped) {
      lastTap = null
      return
    }
    // Double-click or double-tap on the floor: back to the car.
    const pan = settings.isoCamera.pan
    const now = event.timeStamp
    if (lastTap && now - lastTap.time < pan.doubleTapMs &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < pan.doubleTapSlop) {
      lastTap = null
      recenter()
    } else {
      lastTap = { time: now, x: event.clientX, y: event.clientY }
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)

  // ---- pan glides -----------------------------------------------------------

  function startGlide(mode) {
    const pan = settings.isoCamera.pan
    panMode = mode
    glideFrom.copy(panOffset)
    glideTime = 0
    if (mode === 'point') panGoal.set(pin.x - target.x, 0, pin.z - target.z)
    else panGoal.set(0, 0, 0)
    // Longer trips take a little longer, up to a cap, so no return drags on.
    glideDuration = reducedMotion()
      ? 0
      : Math.min(pan.returnDuration + glideFrom.distanceTo(panGoal) * pan.returnPerMetre, pan.returnMaxDuration)
    gliding = true
  }

  function leaveOverview() {
    if (!overview) return
    zoomTarget = clampZoom(overview.zoom)
    overview = null
  }

  /** Glide the view back to the car (F, the Back to car chip, a double-click, driving). */
  function recenter() {
    leaveOverview()
    if (panMode === 'home' && gliding) return
    if (panOffset.lengthSq() < 1e-6) {
      panOffset.set(0, 0, 0)
      panMode = 'free'
      gliding = false
      return
    }
    startGlide('home')
  }

  /** Glide the view to a world point and hold it there (the minimap). */
  function panTo(x, z) {
    if (!settings.isoCamera.pan.enabled || focusPoint) return
    const limit = settings.isoCamera.pan.maxRadius
    const r = Math.hypot(x, z)
    const k = r > limit ? limit / r : 1
    pin.set(x * k, 0, z * k)
    endDrag()
    startGlide('point')
  }

  /** O: ease out to the widest zoom over the arena centre; again (or driving) to come back. */
  function toggleOverview() {
    if (focusPoint || !settings.isoCamera.pan.enabled) return false
    if (overview) {
      recenter()
      return false
    }
    overview = { zoom: zoomTarget }
    zoomTarget = clampZoom(settings.isoCamera.maxZoom ?? 1)
    panTo(0, 0)
    return true
  }

  // ---- per frame ----------------------------------------------------------

  /**
   * `driving`: any driving input this frame (it sends the view home).
   * `panX` / `panY`: keyboard map look, -1..1, screen right and screen up.
   */
  function update(dt, vehicle, { driving = false, panX = 0, panY = 0 } = {}) {
    const c = settings.isoCamera
    const instant = reducedMotion()

    if (intro) {
      intro.time += dt
      const t = Math.min(intro.time / intro.duration, 1)
      zoom = THREE.MathUtils.lerp(intro.from, c.defaultZoom, easeInOutCubic(t))
      zoomTarget = zoom
      if (t >= 1) intro = null
    } else if (instant) {
      zoom = zoomTarget
    } else {
      zoom += (zoomTarget - zoom) * (1 - Math.exp(-c.zoomRate * dt))
    }

    if (focusPoint) {
      target.copy(focusPoint)
      lead.set(0, 0, 0)
    } else {
      target.set(vehicle.position.x, 0, vehicle.position.z)
      // Smoothed velocity lead, so the view drifts ahead at speed without twitching on steering.
      leadTarget.set(vehicle.velocity.x, 0, vehicle.velocity.z).multiplyScalar(c.lookAhead)
      if (leadTarget.length() > c.lookAheadMax) leadTarget.setLength(c.lookAheadMax)
      lead.lerp(leadTarget, 1 - Math.exp(-c.lookAheadRate * dt))
      target.add(lead)
    }

    const azimuth = THREE.MathUtils.degToRad(c.azimuth)
    const distance = (c.minDistance + c.zoomRange * zoom) * s * framingScale(camera, c)

    // ---- pan ----
    const pan = c.pan
    if (focusPoint) {
      // Explore owns the view.
      panOffset.set(0, 0, 0)
      panMode = 'free'
      gliding = false
    } else if (!drag?.active) {
      // Driving brings the view home (and ends the overview).
      if (driving && !(panMode === 'home' && gliding) && (overview || panOffset.lengthSq() > 1e-6)) recenter()
      if ((panX !== 0 || panY !== 0) && pan.enabled) {
        // Keyboard map look: along the screen axes on the floor, faster when zoomed out.
        const speed = pan.keySpeed * distance * dt
        const fx = -Math.sin(azimuth)
        const fz = -Math.cos(azimuth)
        panOffset.x += (fx * panY - fz * panX) * speed
        panOffset.z += (fz * panY + fx * panX) * speed
        panMode = 'free'
        gliding = false
      }
      if (panMode === 'point') panGoal.set(pin.x - target.x, 0, pin.z - target.z)
      else panGoal.set(0, 0, 0)
      if (gliding) {
        glideTime += dt
        const t = glideDuration > 0 ? Math.min(glideTime / glideDuration, 1) : 1
        panOffset.lerpVectors(glideFrom, panGoal, easeOutCubic(t))
        if (t >= 1) {
          gliding = false
          if (panMode === 'home') panMode = 'free'
        }
      } else if (panMode === 'point') {
        panOffset.copy(panGoal)
      }
    }
    // Keep a panned view inside the arena.
    if (panOffset.lengthSq() > 0) {
      const wanted = under.set(target.x + panOffset.x, 0, target.z + panOffset.z)
      if (wanted.length() > pan.maxRadius) {
        wanted.setLength(pan.maxRadius)
        panOffset.set(wanted.x - target.x, 0, wanted.z - target.z)
      }
    }

    // Zone angles: steeper over boards and plazas, and (like the reference)
    // no tilt-shift blur where there are boards to read. Eased in and out together.
    let zonePitch = c.pitch
    let zoneTilt = 1
    if (!focusPoint) {
      for (const z of c.zones) {
        if (Math.hypot(vehicle.position.x - z.x, vehicle.position.z - z.z) < z.radius) {
          zonePitch = z.pitch ?? c.pitch
          zoneTilt = z.tiltShift ?? 1
          break
        }
      }
    }
    const zoneEase = 1 - Math.exp(-c.zoneRate * dt)
    pitchCurrent += (zonePitch - pitchCurrent) * zoneEase
    tiltCurrent += (zoneTilt - tiltCurrent) * zoneEase
    if (Math.abs(zoneTilt - tiltCurrent) < 0.002) tiltCurrent = zoneTilt

    if (!initialised) {
      followEased.copy(target)
      prevTarget.copy(target)
      initialised = true
    }
    if (flight) {
      // Explore fly-to (or the flight home): a timed ease from where the
      // camera was, so long hops read as travel rather than a snap.
      flight.time += dt
      const t = Math.min(flight.time / flight.duration, 1)
      followEased.lerpVectors(flight.from, target, easeInOutCubic(t))
      if (t >= 1) flight = null
    } else if (dt > 0) {
      // Same exponential follow as before (rate `followRate`), but integrated
      // exactly for a target moving in a straight line during the frame. The
      // plain per-frame lerp makes the lag depend on each frame's length, so
      // uneven frame times read as camera judder; this keeps the lag at v/k.
      const k = c.followRate
      const e = Math.exp(-k * dt)
      targetVel.copy(target).sub(prevTarget).divideScalar(dt)
      if (targetVel.lengthSq() > 80 * 80) targetVel.setLength(80) // teleports, not driving
      lag.copy(prevTarget).sub(followEased).multiplyScalar(e).addScaledVector(targetVel, (1 - e) / k)
      followEased.copy(target).sub(lag)
    }
    prevTarget.copy(target)
    targetEased.copy(followEased).add(panOffset)

    const pitch = THREE.MathUtils.degToRad(pitchCurrent)
    // Azimuth is measured from due south (+Z) towards east (+X).
    offsetDir.set(
      Math.cos(pitch) * Math.sin(azimuth),
      Math.sin(pitch),
      Math.cos(pitch) * Math.cos(azimuth),
    )

    camera.position.copy(targetEased).addScaledVector(offsetDir, distance)
    camera.lookAt(targetEased)

    let projection = false
    if (camera.near !== c.near) {
      camera.near = c.near
      projection = true
    }
    if (camera.fov !== c.fov) {
      camera.fov += (c.fov - camera.fov) * (1 - Math.exp(-6 * dt))
      if (Math.abs(camera.fov - c.fov) < 0.01) camera.fov = c.fov
      projection = true
    }
    if (projection) camera.updateProjectionMatrix()
  }

  /**
   * Fly to a world point ([x, y, z] or {x, z}) and hold there, or back to the
   * car with `null`. Instant under prefers-reduced-motion.
   */
  function focusOn(point) {
    const next = point ? new THREE.Vector3(point.x ?? point[0], 0, point.z ?? point[2]) : null
    if (!next && !focusPoint) return
    focusPoint = next
    leaveOverview()
    endDrag()
    // The flight starts from what is on screen now, pan included.
    const from = followEased.clone().add(panOffset)
    panOffset.set(0, 0, 0)
    panMode = 'free'
    gliding = false
    flight = reducedMotion() || !initialised
      ? null
      : { time: 0, duration: settings.isoCamera.flyDuration, from }
    if (flight) followEased.copy(from)
    if (!flight && next) followEased.copy(next)
    if (!flight && !next) initialised = false
  }

  /** Snap to the car on the next update (after a respawn or a mode switch). */
  function reset() {
    initialised = false
    leaveOverview()
    endDrag()
    panOffset.set(0, 0, 0)
    panMode = 'free'
    gliding = false
    lead.set(0, 0, 0)
  }

  /** The opening dolly: start close, ease out while the car drops in. */
  function playIntro() {
    const c = settings.isoCamera
    if (reducedMotion() || c.introDuration <= 0) return
    intro = { time: 0, duration: c.introDuration, from: c.introZoom }
    zoom = c.introZoom
  }

  function dispose() {
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
  }

  return {
    update,
    reset,
    playIntro,
    focusOn,
    recenter,
    panTo,
    toggleOverview,
    get focused() {
      return focusPoint !== null
    },
    /** True while the view is away from the car (for the "Back to car" chip). */
    get panned() {
      return overview !== null || panMode === 'point' || panOffset.lengthSq() > 4
    },
    get inOverview() {
      return overview !== null
    },
    /** The floor point in the middle of the view (read-only). */
    get viewPoint() {
      return targetEased
    },
    /** 0..1: how much tilt-shift blur the zone the car is in allows. */
    get tiltShift() {
      return tiltCurrent
    },
    /** The Explore focus point, or null while following the car. */
    get focusPoint() {
      return focusPoint
    },
    dispose,
    /** Current 0..1 zoom and the distance it maps to, for debugging. */
    get zoom() {
      return zoom
    },
    get distance() {
      const c = settings.isoCamera
      return (c.minDistance + c.zoomRange * zoom) * s * framingScale(camera, c)
    },
  }
}

function clampZoom(value) {
  return Math.min(Math.max(value, MIN_USER_ZOOM), settings.isoCamera.maxZoom ?? 1)
}

/** Tall viewports see less floor across, so back away a little (never closer). */
function framingScale(camera, c) {
  if (!c.portraitFraming) return 1
  const raw = PORTRAIT_ASPECT / Math.max(camera.aspect, 0.35)
  if (!Number.isFinite(raw)) return 1
  return Math.min(Math.max(Math.sqrt(raw), 1), MAX_FRAMING_SCALE)
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
