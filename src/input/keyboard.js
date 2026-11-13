/**
 * Raw keyboard state: held driving keys plus one-shot action presses.
 *
 * Bindings follow the 2019 reference (docs/pursuit-arena/01 §2.2) and doc 05
 * §4: Space or Ctrl brakes, Shift boosts, H honks, Enter/E interacts, C
 * switches camera, M mutes, P opens the passport, Esc the menu. Q (handbrake
 * drift) is our addition, and so is map look: F re-centres the view, O
 * toggles the overview, and Alt + the arrow keys pan it (the arrows on their
 * own still drive).
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
  KeyF: 'recenter',
  KeyO: 'overview',
  KeyM: 'mute',
  KeyP: 'passport',
  Escape: 'menu',
}

/** Actions that fire once per press rather than being held. */
export const EDGE_ACTIONS = new Set(['respawn', 'horn', 'interact', 'camera', 'recenter', 'overview', 'mute', 'passport', 'menu'])

/** Alt + these pan the map instead of driving. */
const PAN_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

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
  const panHeld = new Set()
  /** True from the first Alt + arrow until Alt comes up: that Alt press is ours. */
  let altUsed = false

  const onKeyDown = (event) => {
    const action = KEY_MAP[event.code]
    if (!action) return
    // Alt + arrows look around the map. Checked before the modifier rule
    // below, and it must cancel the default: Alt + Left is "Back" in browsers.
    const panKey = PAN_KEYS[event.code]
    if (panKey && event.altKey && !event.ctrlKey && !event.metaKey) {
      if (ownedByFocusedControl(event)) return
      event.preventDefault()
      // An arrow that was already driving stops driving (its repeats arrive here).
      held.delete(action)
      panHeld.add(panKey)
      altUsed = true
      return
    }
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
    if (event.code === 'AltLeft' || event.code === 'AltRight') {
      panHeld.clear()
      // Releasing Alt on its own focuses the browser's menu bar in some browsers.
      if (altUsed) event.preventDefault()
      altUsed = false
      return
    }
    const action = KEY_MAP[event.code]
    if (!action) return
    held.delete(action)
    if (PAN_KEYS[event.code]) panHeld.delete(PAN_KEYS[event.code])
  }

  // Losing focus mid-throttle would otherwise leave the car pinned.
  const onBlur = () => {
    held.clear()
    panHeld.clear()
    altUsed = false
  }

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
        /** Map look: screen right and screen up, -1..1. */
        panX: (panHeld.has('right') ? 1 : 0) - (panHeld.has('left') ? 1 : 0),
        panY: (panHeld.has('up') ? 1 : 0) - (panHeld.has('down') ? 1 : 0),
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
