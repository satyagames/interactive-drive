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

  // ---- per frame ----------------------------------------------------------

  function update(dt, vehicle) {
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
    } else {
      target.set(vehicle.position.x, 0, vehicle.position.z)
      if (c.lookAhead > 0) {
        target.x += vehicle.velocity.x * c.lookAhead
        target.z += vehicle.velocity.z * c.lookAhead
      }
    }
    if (!initialised) {
      targetEased.copy(target)
      initialised = true
    }
    if (flight) {
      // Explore fly-to (or the flight home): a timed ease from where the
      // camera was, so long hops read as travel rather than a snap.
      flight.time += dt
      const t = Math.min(flight.time / flight.duration, 1)
      targetEased.lerpVectors(flight.from, target, easeInOutCubic(t))
      if (t >= 1) flight = null
    } else {
      targetEased.lerp(target, 1 - Math.exp(-c.followRate * dt))
    }

    const pitch = THREE.MathUtils.degToRad(c.pitch)
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
    flight = reducedMotion || !initialised
      ? null
      : { time: 0, duration: settings.isoCamera.flyDuration, from: targetEased.clone() }
    if (!flight && next) targetEased.copy(next)
    if (!flight && !next) initialised = false
  }

  function reset() {
    initialised = false
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
  }

  return {
    update,
    reset,
    playIntro,
    focusOn,
    get focused() {
      return focusPoint !== null
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
  return Math.min(Math.max(value, MIN_USER_ZOOM), 1)
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
