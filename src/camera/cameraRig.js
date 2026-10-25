import { settings } from '../config.js'
import { createChaseCamera } from './chaseCamera.js'
import { createIsoFollowCamera } from './isoFollowCamera.js'

/**
 * Owns both camera behaviours and routes each frame to the active one
 * (`settings.cameraMode`). Both drive the same three.js camera; switching
 * snaps the incoming one to the car and lets its FOV ease over.
 */
const MODES = ['iso', 'chase']

export function createCameraRig(camera, canvas) {
  const modes = {
    iso: createIsoFollowCamera(camera, canvas),
    chase: createChaseCamera(camera),
  }
  let lastMode = settings.cameraMode

  function active() {
    return modes[settings.cameraMode] ?? modes.iso
  }

  function update(dt, vehicle) {
    // The debug panel can change the mode directly, not just `toggle()`.
    if (settings.cameraMode !== lastMode) {
      lastMode = settings.cameraMode
      active().reset()
    }
    active().update(dt, vehicle)
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
