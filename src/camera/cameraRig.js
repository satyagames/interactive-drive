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

  return {
    modes,
    update,
    toggle,
    reset: () => active().reset(),
    playIntro: () => modes.iso.playIntro(),
    get mode() {
      return settings.cameraMode
    },
  }
}

export const cameraModes = MODES
