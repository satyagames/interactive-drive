import { settings } from '../config.js'

import { createKeyboard } from './keyboard.js'
import { createTouchControls } from './touch.js'

/**
 * Merges keyboard and touch into one axis set:
 *   throttle  -1 (reverse/brake) .. +1 (accelerate)
 *   steer     -1 (right) .. +1 (left)
 *   brake, boost, handbrake   held flags
 * plus edge-triggered `consumeRespawn()` / `consumeHorn()`.
 */
export function createInput() {
  const keyboard = createKeyboard()
  const touch = createTouchControls()

  touch.setVisible(touch.isTouchDevice)

  const state = { throttle: 0, steer: 0, brake: false, boost: false, handbrake: false }
  let lastForcedVisibility = null

  return {
    touch,
    state,
    update() {
      // Let the debug panel force the pad on for desktop testing.
      const visible = touch.isTouchDevice || settings.debug.forceTouchControls
      if (visible !== lastForcedVisibility) {
        touch.setVisible(visible)
        lastForcedVisibility = visible
      }

      const k = keyboard.state
      const t = touch.state
      state.throttle = clamp(k.throttle + t.throttle, -1, 1)
      state.steer = clamp(k.steer + t.steer, -1, 1)
      state.brake = k.brake || t.brake
      state.boost = k.boost || t.boost
      state.handbrake = k.handbrake || t.handbrake
      return state
    },
    consumeHorn() {
      return keyboard.consumeHorn()
    },
    consumeRespawn() {
      // Both are edge-triggered, so evaluate both -- do not short-circuit.
      const fromKeyboard = keyboard.consumeRespawn()
      const fromTouch = touch.consumeRespawn()
      return fromKeyboard || fromTouch
    },
    dispose() {
      keyboard.dispose()
    },
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
