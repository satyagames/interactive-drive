import * as THREE from 'three'

import { settings } from '../config.js'

import { createGamepad } from './gamepad.js'
import { createKeyboard } from './keyboard.js'
import { createTouchControls } from './touch.js'

/**
 * Merges keyboard, gamepad and touch into one driving state:
 *   throttle  -1 (reverse) .. +1 (accelerate)
 *   steer     -1 (right) .. +1 (left)
 *   brake, boost, handbrake   held flags
 * plus one-shot actions for this frame (respawn, horn, interact, camera,
 * mute, passport, menu): `consume(action)` returns true once if it was
 * pressed since the last `update()`. Presses nobody consumes that frame are
 * dropped, so a stray key can never fire a later phase's action late.
 */

const camForward = new THREE.Vector3()
const camRight = new THREE.Vector3()
const carForward = new THREE.Vector3()
const desired = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

export function createInput() {
  const keyboard = createKeyboard()
  const gamepad = createGamepad()
  const touch = createTouchControls()

  touch.setVisible(touch.isTouchDevice)

  const state = { throttle: 0, steer: 0, brake: false, boost: false, handbrake: false }
  const frameEdges = new Set()
  let lastForcedVisibility = null

  /**
   * The touch joystick points at a screen direction; turn it into steering
   * towards that direction on the ground, relative to the car's heading (or
   * its tail while reversing). Saturates at the max steer angle.
   */
  function joystickSteer(camera, vehicle, reversing) {
    camera.getWorldDirection(camForward)
    camForward.y = 0
    if (camForward.lengthSq() < 1e-6) return 0
    camForward.normalize()
    camRight.crossVectors(camForward, UP)

    const j = touch.joystick
    desired.copy(camRight).multiplyScalar(j.x).addScaledVector(camForward, j.y)

    carForward.set(0, 0, -1).applyQuaternion(vehicle.quaternion)
    carForward.y = 0
    if (carForward.lengthSq() < 1e-6) return 0
    carForward.normalize()
    if (reversing) carForward.negate()

    // Signed angle about +Y from the car's heading to the target: + is left.
    const cross = carForward.z * desired.x - carForward.x * desired.z
    const angle = Math.atan2(cross, carForward.dot(desired))
    const steer = THREE.MathUtils.clamp(angle / settings.arcade.maxSteer, -1, 1)
    return reversing ? -steer : steer
  }

  return {
    touch,
    gamepad,
    state,
    /** Call once per frame before the physics steps. */
    update({ camera, vehicle } = {}) {
      // Let the debug panel force the pad on for desktop testing.
      const visible = touch.isTouchDevice || settings.debug.forceTouchControls
      if (visible !== lastForcedVisibility) {
        touch.setVisible(visible)
        lastForcedVisibility = visible
      }

      const k = keyboard.state
      const g = gamepad.poll()
      const t = touch.state

      let throttle = k.throttle + g.throttle
      let steer = k.steer + g.steer
      if (t.reverse) throttle -= 1
      if (touch.joystick.active && camera && vehicle) {
        if (!t.reverse) throttle += touch.joystick.magnitude
        if (touch.joystick.magnitude > 0) steer += joystickSteer(camera, vehicle, t.reverse)
      }

      state.throttle = clamp(throttle, -1, 1)
      state.steer = clamp(steer, -1, 1)
      state.brake = k.brake || g.brake || t.brake
      state.boost = k.boost || g.boost || t.boost
      state.handbrake = k.handbrake || g.handbrake

      frameEdges.clear()
      keyboard.drainEdges(frameEdges)
      gamepad.drainEdges(frameEdges)
      touch.drainEdges(frameEdges)
      return state
    },
    /** True once if `action` was pressed this frame. */
    consume(action) {
      return frameEdges.delete(action)
    },
    dispose() {
      keyboard.dispose()
    },
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
