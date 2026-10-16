/**
 * Raw keyboard state. Produces the same axis shape as the touch pad so the two
 * can simply be summed.
 */

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  KeyR: 'respawn',
}

export function createKeyboard(target = window) {
  const held = new Set()
  let respawnPressed = false

  const onKeyDown = (event) => {
    const action = KEY_MAP[event.code]
    if (!action) return
    // Stop space/arrows from scrolling the page.
    event.preventDefault()
    if (event.repeat) return
    held.add(action)
    if (action === 'respawn') respawnPressed = true
  }

  const onKeyUp = (event) => {
    const action = KEY_MAP[event.code]
    if (!action) return
    event.preventDefault()
    held.delete(action)
  }

  // Losing focus mid-throttle would otherwise leave the car pinned.
  const onBlur = () => held.clear()

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  return {
    get state() {
      return {
        throttle: (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0),
        steer: (held.has('left') ? 1 : 0) - (held.has('right') ? 1 : 0),
        handbrake: held.has('handbrake'),
      }
    },
    /** Edge-triggered: returns true once per press. */
    consumeRespawn() {
      const value = respawnPressed
      respawnPressed = false
      return value
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
