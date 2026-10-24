/**
 * Raw keyboard state. Produces the same axis shape as the touch pad so the two
 * can simply be summed.
 *
 * Bindings follow the 2019 reference (docs/pursuit-arena/01 §2.2): Space or
 * Ctrl brakes, Shift boosts, H honks. Q (handbrake drift) is our addition.
 */

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'brake', ControlLeft: 'brake', ControlRight: 'brake',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyQ: 'handbrake',
  KeyR: 'respawn',
  KeyH: 'horn',
}

/** Actions that fire once per press rather than being held. */
const EDGE_ACTIONS = new Set(['respawn', 'horn'])

export function createKeyboard(target = window) {
  const held = new Set()
  const pressed = new Set()

  const onKeyDown = (event) => {
    const action = KEY_MAP[event.code]
    if (!action) return
    // Leave browser shortcuts alone (Ctrl+R reload etc.) -- Ctrl itself
    // still brakes, matching the reference.
    if ((event.ctrlKey || event.metaKey || event.altKey) && action !== 'brake') return
    // Stop space/arrows from scrolling the page.
    event.preventDefault()
    if (event.repeat) return
    held.add(action)
    if (EDGE_ACTIONS.has(action)) pressed.add(action)
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

  /** Edge-triggered: returns true once per press. */
  const consume = (action) => {
    const value = pressed.has(action)
    pressed.delete(action)
    return value
  }

  return {
    get state() {
      return {
        throttle: (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0),
        steer: (held.has('left') ? 1 : 0) - (held.has('right') ? 1 : 0),
        brake: held.has('brake'),
        boost: held.has('boost'),
        handbrake: held.has('handbrake'),
      }
    },
    consumeRespawn: () => consume('respawn'),
    consumeHorn: () => consume('horn'),
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
