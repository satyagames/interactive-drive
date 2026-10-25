import * as THREE from 'three'

import { settings } from '../config.js'
import { createChaseCamera } from './chaseCamera.js'
import { createIsoFollowCamera } from './isoFollowCamera.js'

/**
 * Owns both camera behaviours and routes each frame to the active one
 * (`settings.cameraMode`). Both drive the same three.js camera; switching
 * snaps the incoming one to the car and lets its FOV ease over.
 *
 * Camera FX (doc 05 §2) sit on top of whichever mode is active: `kick(deg)`
 * punches the FOV and `shake(amount)` adds trauma that decays. Both are
 * layered on after the mode's update and taken off again before the next
 * one, so the follow cameras never see (or smooth towards) the offsets.
 * Both are no-ops under prefers-reduced-motion.
 */
const MODES = ['iso', 'chase']

export function createCameraRig(camera, canvas) {
  const modes = {
    iso: createIsoFollowCamera(camera, canvas),
    chase: createChaseCamera(camera),
  }
  let lastMode = settings.cameraMode

  // Read live: the OS setting can change mid-visit, and `settings.vfx.reducedMotion` can force it.
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const reducedMotion = () => settings.vfx.reducedMotion === 'auto' ? Boolean(motionQuery?.matches) : Boolean(settings.vfx.reducedMotion)
  let fovKick = 0
  let trauma = 0
  let fxTime = 0
  let appliedFov = 0
  const appliedShake = new THREE.Vector3()
  const axis = new THREE.Vector3()

  function active() {
    return modes[settings.cameraMode] ?? modes.iso
  }

  function update(dt, vehicle) {
    // The debug panel can change the mode directly, not just `toggle()`.
    if (settings.cameraMode !== lastMode) {
      lastMode = settings.cameraMode
      active().reset()
    }
    removeFx()
    active().update(dt, vehicle)
    applyFx(dt)
  }

  function removeFx() {
    if (appliedFov !== 0) {
      camera.fov -= appliedFov
      appliedFov = 0
      camera.updateProjectionMatrix()
    }
    camera.position.sub(appliedShake)
    appliedShake.set(0, 0, 0)
  }

  function applyFx(dt) {
    const fx = settings.vfx.camera
    fxTime += dt
    fovKick *= Math.exp(-fx.kickDecay * dt)
    trauma = Math.max(trauma - fx.shakeDecay * dt, 0)
    if (Math.abs(fovKick) > 0.01) {
      appliedFov = fovKick
      camera.fov += appliedFov
      camera.updateProjectionMatrix()
    } else {
      fovKick = 0
    }
    if (trauma > 0) {
      // Smooth pseudo-noise along the screen axes, scaled by trauma squared.
      const amount = trauma * trauma * fx.maxShake
      camera.updateMatrixWorld()
      const t = fxTime * 31
      appliedShake.copy(axis.setFromMatrixColumn(camera.matrixWorld, 0)).multiplyScalar(amount * (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4))
      appliedShake.addScaledVector(axis.setFromMatrixColumn(camera.matrixWorld, 1), amount * (Math.sin(t * 1.3 + 0.5) * 0.6 + Math.sin(t * 2.9 + 3.1) * 0.4))
      camera.position.add(appliedShake)
    }
  }

  function toggle() {
    const next = MODES[(MODES.indexOf(settings.cameraMode) + 1) % MODES.length]
    settings.cameraMode = next
  }

  // Explore fly-to always uses the iso view (a chase camera has nothing to
  // sit behind); the player's chosen mode comes back with the car.
  let modeBeforeFocus = null

  function focusOn(point) {
    if (modeBeforeFocus === null) modeBeforeFocus = settings.cameraMode
    if (settings.cameraMode !== 'iso') {
      settings.cameraMode = 'iso'
      lastMode = 'iso'
      modes.iso.reset()
    }
    modes.iso.focusOn(point)
  }

  function clearFocus() {
    if (modeBeforeFocus === null) return
    modes.iso.focusOn(null)
    settings.cameraMode = modeBeforeFocus
    modeBeforeFocus = null
  }

  return {
    modes,
    update,
    toggle,
    /** FOV punch in degrees (+ widens); eases back out. */
    kick(degrees) {
      if (reducedMotion()) return
      const max = settings.vfx.camera.maxKick
      fovKick = Math.max(-max, Math.min(max, fovKick + degrees))
    },
    /** Add shake trauma, 0..1 (it adds up and is capped at 1). */
    shake(amount) {
      if (reducedMotion()) return
      trauma = Math.min(trauma + amount, 1)
    },
    reset: () => active().reset(),
    playIntro: () => modes.iso.playIntro(),
    focusOn,
    clearFocus,
    get focused() {
      return modeBeforeFocus !== null
    },
    get focusPoint() {
      return modes.iso.focusPoint
    },
    get mode() {
      return settings.cameraMode
    },
  }
}

export const cameraModes = MODES
