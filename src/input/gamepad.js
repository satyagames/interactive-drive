import { settings } from '../config.js'

/**
 * Gamepad API, polled once per frame. Uses the first connected pad with the
 * W3C "standard" layout (Xbox / PlayStation / most others in a browser):
 *
 *   left stick X      steer            RT / R2   throttle (analog)
 *   LT / L2           reverse (analog) B / ○     brake
 *   X / □             boost (held)     RB / R1   handbrake drift
 *   A / ✕             interact         LB / L1   horn
 *   Y / △             switch camera    D-pad up  passport
 *   View / Share      respawn          Menu / Options   menu
 *
 * No connection prompts, no vibration -- it simply reads whatever is plugged in.
 */

const BUTTON = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, up: 12,
}

/** Button index -> one-shot action. */
const EDGE_BUTTONS = [
  [BUTTON.a, 'interact'],
  [BUTTON.lb, 'horn'],
  [BUTTON.y, 'camera'],
  [BUTTON.up, 'passport'],
  [BUTTON.view, 'respawn'],
  [BUTTON.menu, 'menu'],
]

export function createGamepad() {
  const previous = new Map()
  const state = { connected: false, throttle: 0, steer: 0, brake: false, boost: false, handbrake: false }
  const edges = new Set()

  function poll() {
    const pads = navigator.getGamepads?.() ?? []
    const pad = [...pads].find((p) => p && p.connected && p.mapping === 'standard')
    state.connected = Boolean(pad)
    if (!pad) {
      state.throttle = 0
      state.steer = 0
      state.brake = state.boost = state.handbrake = false
      previous.clear()
      return state
    }

    const g = settings.gamepad
    const value = (i) => pad.buttons[i]?.value ?? 0
    const down = (i) => Boolean(pad.buttons[i]?.pressed)
    const trigger = (i) => (value(i) > g.triggerDeadZone ? value(i) : 0)

    const x = pad.axes[0] ?? 0
    state.steer = Math.abs(x) > g.stickDeadZone
      ? -Math.sign(x) * (Math.abs(x) - g.stickDeadZone) / (1 - g.stickDeadZone)
      : 0
    state.throttle = trigger(BUTTON.rt) - trigger(BUTTON.lt)
    state.brake = down(BUTTON.b)
    state.boost = down(BUTTON.x)
    state.handbrake = down(BUTTON.rb)

    for (const [index, action] of EDGE_BUTTONS) {
      const now = down(index)
      if (now && !previous.get(index)) edges.add(action)
      previous.set(index, now)
    }
    return state
  }

  return {
    state,
    poll,
    drainEdges(into) {
      for (const action of edges) into.add(action)
      edges.clear()
    },
  }
}
