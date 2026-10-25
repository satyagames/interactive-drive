/**
 * Raw keyboard state: held driving keys plus one-shot action presses.
 *
 * Bindings follow the 2019 reference (docs/pursuit-arena/01 §2.2) and doc 05
 * §4: Space or Ctrl brakes, Shift boosts, H honks, Enter/E interacts, C
 * switches camera, M mutes, P opens the passport, Esc the menu. Q (handbrake
 * drift) is our addition.
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
  Enter: 'interact', NumpadEnter: 'interact', KeyE: 'interact',
  KeyC: 'camera',
  KeyM: 'mute',
  KeyP: 'passport',
  Escape: 'menu',
}

/** Actions that fire once per press rather than being held. */
export const EDGE_ACTIONS = new Set(['respawn', 'horn', 'interact', 'camera', 'mute', 'passport', 'menu'])

/** Keys that activate a focused button or link. */
const ACTIVATION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter'])

/**
 * Keys typed into a text field belong to it, and Space/Enter on a focused
 * button or link activate that control rather than braking or interacting.
 * Everything else still drives, so clicking a debug slider doesn't strand
 * the car.
 */
function ownedByFocusedControl(event) {
  const el = event.target
  if (!(el instanceof Element)) return false
  // Menus that use arrows/Space/Enter themselves (the Explore list) opt in.
  if (el.closest('input, textarea, select, [contenteditable], [data-captures-keys]')) return true
  return ACTIVATION_KEYS.has(event.code) && Boolean(el.closest('button, a[href], [role="button"]'))
}

export function createKeyboard(target = window) {
  const held = new Set()
  const pressed = new Set()

  const onKeyDown = (event) => {
    const action = KEY_MAP[event.code]
    if (!action) return
    // Leave browser shortcuts alone (Ctrl+R reload etc.) -- Ctrl itself
    // still brakes, matching the reference.
    if ((event.ctrlKey || event.metaKey || event.altKey) && action !== 'brake') return
    // Esc always reaches the game (it closes things); everything else yields
    // to whatever control has focus.
    if (action !== 'menu' && ownedByFocusedControl(event)) return
    // Stop space/arrows from scrolling the page.
    event.preventDefault()
    if (event.repeat) return
    held.add(action)
    if (EDGE_ACTIONS.has(action)) pressed.add(action)
  }

  const onKeyUp = (event) => {
    const action = KEY_MAP[event.code]
    if (!action) return
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
        brake: held.has('brake'),
        boost: held.has('boost'),
        handbrake: held.has('handbrake'),
      }
    },
    /** Moves this frame's one-shot presses into `into` and forgets them. */
    drainEdges(into) {
      for (const action of pressed) into.add(action)
      pressed.clear()
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
