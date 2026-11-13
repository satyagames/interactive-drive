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

export function createIsoFollowCamera(camera, canvas) {
  const s = rebuild.worldScale
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const target = new THREE.Vector3()
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

  // Two-finger pinch on the canvas. The touch pad sits above the canvas with
  // its own handlers, so steering touches never reach this.
  let pinchStart = 0
  let pinchZoomStart = 0
  const pinchDistance = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  const onTouchStart = (event) => {
    if (event.touches.length !== 2) return
    pinchStart = pinchDistance(event.touches)
    pinchZoomStart = zoomTarget
  }
  const onTouchMove = (event) => {
    if (event.touches.length !== 2 || pinchStart <= 0) return
    event.preventDefault()
    const ratio = pinchDistance(event.touches) / pinchStart
    zoomTarget = clampZoom(pinchZoomStart - (ratio - 1))
  }

  canvas.addEventListener('wheel', onWheel, { passive: true })
  canvas.addEventListener('touchstart', onTouchStart, { passive: true })
  canvas.addEventListener('touchmove', onTouchMove, { passive: false })

  // ---- drag the floor to look around (the reference's camera pan) ---------
  //
  // The point grabbed on the floor stays under the pointer while dragging.
  // One mouse button or one finger pans; a second finger hands over to pinch.
  // Any driving input eases the view back to the car (see `update`).

  const panOffset = new THREE.Vector3()
  const lead = new THREE.Vector3()
  const leadTarget = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ndc = new THREE.Vector2()
  const grabbed = new THREE.Vector3()
  const under = new THREE.Vector3()
  const pointers = new Map()
  let drag = null // { id, startX, startY, active }
  let pitchCurrent = settings.isoCamera.pitch
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

  const onPointerDown = (event) => {
    if (!settings.isoCamera.pan.enabled || settings.cameraMode !== 'iso') return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.set(event.pointerId, true)
    if (pointers.size > 1) { // second finger: pinch takes over
      drag = null
      return
    }
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, active: false }
  }

  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return
    if (!drag.active) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (moved < settings.isoCamera.pan.dragThreshold) return
      if (!floorPointAt(drag.startX, drag.startY, grabbed)) return
      drag.active = true
      canvas.setPointerCapture?.(event.pointerId)
      canvas.classList.add('is-panning')
    }
    if (!floorPointAt(event.clientX, event.clientY, under)) return
    const dx = grabbed.x - under.x
    const dz = grabbed.z - under.z
    // Move the view at once so the grabbed point stays under the pointer.
    panOffset.x += dx
    panOffset.z += dz
    targetEased.x += dx
    targetEased.z += dz
    camera.position.x += dx
    camera.position.z += dz
  }

  const onPointerUp = (event) => {
    pointers.delete(event.pointerId)
    if (drag && event.pointerId === drag.id) {
      if (drag.active) canvas.releasePointerCapture?.(event.pointerId)
      drag = null
      canvas.classList.remove('is-panning')
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.classList.add('can-pan')

  // ---- per frame ----------------------------------------------------------

  function update(dt, vehicle, { driving = false } = {}) {
    const c = settings.isoCamera

    if (intro) {
      intro.time += dt
      const t = Math.min(intro.time / intro.duration, 1)
      zoom = THREE.MathUtils.lerp(intro.from, c.defaultZoom, easeInOutCubic(t))
      zoomTarget = zoom
      if (t >= 1) intro = null
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

    // Pan: driving (or Explore) brings the view home; dragging holds it.
    const pan = c.pan
    if (!drag?.active && (driving || focusPoint)) panOffset.multiplyScalar(Math.exp(-pan.returnRate * dt))
    if (panOffset.lengthSq() < 1e-6) panOffset.set(0, 0, 0)
    // Keep the view inside the arena.
    const wanted = under.set(target.x + panOffset.x, 0, target.z + panOffset.z)
    if (wanted.length() > pan.maxRadius) {
      wanted.setLength(pan.maxRadius)
      panOffset.set(wanted.x - target.x, 0, wanted.z - target.z)
    }
    target.add(panOffset)

    // Zone angles: steeper over boards and plazas, eased in and out.
    let zonePitch = c.pitch
    if (!focusPoint) {
      for (const z of c.zones) {
        if (Math.hypot(vehicle.position.x - z.x, vehicle.position.z - z.z) < z.radius) {
          zonePitch = z.pitch
          break
        }
      }
    }
    pitchCurrent += (zonePitch - pitchCurrent) * (1 - Math.exp(-c.zoneRate * dt))
    if (!initialised) {
      targetEased.copy(target)
      prevTarget.copy(target)
      initialised = true
    }
    if (flight) {
      // Explore fly-to (or the flight home): a timed ease from where the
      // camera was, so long hops read as travel rather than a snap.
      flight.time += dt
      const t = Math.min(flight.time / flight.duration, 1)
      targetEased.lerpVectors(flight.from, target, easeInOutCubic(t))
      if (t >= 1) flight = null
    } else if (drag?.active) {
      targetEased.copy(target) // the pointer drives the view directly
    } else if (dt > 0) {
      // Same exponential follow as before (rate `followRate`), but integrated
      // exactly for a target moving in a straight line during the frame. The
      // plain per-frame lerp makes the lag depend on each frame's length, so
      // uneven frame times read as camera judder; this keeps the lag at v/k.
      const k = c.followRate
      const e = Math.exp(-k * dt)
      targetVel.copy(target).sub(prevTarget).divideScalar(dt)
      if (targetVel.lengthSq() > 80 * 80) targetVel.setLength(80) // teleports, not driving
      lag.copy(prevTarget).sub(targetEased).multiplyScalar(e).addScaledVector(targetVel, (1 - e) / k)
      targetEased.copy(target).sub(lag)
    }
    prevTarget.copy(target)

    const pitch = THREE.MathUtils.degToRad(pitchCurrent)
    const azimuth = THREE.MathUtils.degToRad(c.azimuth)
    // Azimuth is measured from due south (+Z) towards east (+X).
    offsetDir.set(
      Math.cos(pitch) * Math.sin(azimuth),
      Math.sin(pitch),
      Math.cos(pitch) * Math.cos(azimuth),
    )

    const distance = (c.minDistance + c.zoomRange * zoom) * s * framingScale(camera, c)
    camera.position.copy(targetEased).addScaledVector(offsetDir, distance)
    camera.lookAt(targetEased)

    if (camera.fov !== c.fov) {
      camera.fov += (c.fov - camera.fov) * (1 - Math.exp(-6 * dt))
      if (Math.abs(camera.fov - c.fov) < 0.01) camera.fov = c.fov
      camera.updateProjectionMatrix()
    }
  }

  /** Snap to the car on the next update (after a respawn or a mode switch). */
  /**
   * Fly to a world point ([x, y, z] or {x, z}) and hold there, or back to the
   * car with `null`. Instant under prefers-reduced-motion.
   */
  function focusOn(point) {
    const next = point ? new THREE.Vector3(point.x ?? point[0], 0, point.z ?? point[2]) : null
    if (!next && !focusPoint) return
    focusPoint = next
    panOffset.set(0, 0, 0)
    flight = reducedMotion || !initialised
      ? null
      : { time: 0, duration: settings.isoCamera.flyDuration, from: targetEased.clone() }
    if (!flight && next) targetEased.copy(next)
    if (!flight && !next) initialised = false
  }

  function reset() {
    initialised = false
    panOffset.set(0, 0, 0)
    lead.set(0, 0, 0)
  }

  /** The opening dolly: start close, ease out while the car drops in. */
  function playIntro() {
    const c = settings.isoCamera
    if (reducedMotion || c.introDuration <= 0) return
    intro = { time: 0, duration: c.introDuration, from: c.introZoom }
    zoom = c.introZoom
  }

  function dispose() {
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('touchstart', onTouchStart)
    canvas.removeEventListener('touchmove', onTouchMove)
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
    get focused() {
      return focusPoint !== null
    },
    /** True while the view is panned away from the car (for a "back to car" hint). */
    get panned() {
      return panOffset.lengthSq() > 4
    },
    /** Snap the pan back to the car (keyboard: the reset-view control). */
    recenter() {
      panOffset.set(0, 0, 0)
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

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
