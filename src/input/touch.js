import { settings } from '../config.js'

/**
 * On-screen touch pad (doc 05 §4): a joystick on the left, and on the right
 * hold buttons (boost, brake, reverse) plus one-shot buttons (interact,
 * respawn). Multi-touch aware: each control tracks its own pointer ids, so
 * you can steer and boost at once.
 *
 * The joystick reports a screen-space vector, not "steer left/right": like
 * the reference, you point where you want to go and `input/index.js` turns
 * that into steering relative to the camera and the car.
 *
 * The markup lives in index.html; this module only wires behaviour.
 */

const HOLD_ACTIONS = new Set(['boost', 'brake', 'reverse'])

export function createTouchControls(root = document.getElementById('touch')) {
  const active = new Map() // action -> Set<pointerId>
  const edges = new Set()
  const joystick = { x: 0, y: 0, magnitude: 0, active: false }

  const isDown = (action) => (active.get(action)?.size ?? 0) > 0

  if (root) {
    for (const button of root.querySelectorAll('[data-action]')) {
      const action = button.dataset.action

      const press = (event) => {
        event.preventDefault()
        if (HOLD_ACTIONS.has(action)) {
          if (!active.has(action)) active.set(action, new Set())
          active.get(action).add(event.pointerId)
        } else {
          edges.add(action)
        }
        button.classList.add('is-active')
        // Capture last: it throws if the pointer is already gone, and losing
        // the press because of that would leave the button doing nothing.
        try {
          button.setPointerCapture?.(event.pointerId)
        } catch {
          // Without capture we still get pointerup on the button itself.
        }
      }

      const release = (event) => {
        active.get(action)?.delete(event.pointerId)
        if (!isDown(action)) button.classList.remove('is-active')
      }

      button.addEventListener('pointerdown', press)
      button.addEventListener('pointerup', release)
      button.addEventListener('pointercancel', release)
      button.addEventListener('lostpointercapture', release)
      // Suppress the synthetic click/zoom behaviour on iOS.
      button.addEventListener('contextmenu', (e) => e.preventDefault())
    }

    const base = root.querySelector('[data-joystick]')
    const knob = base?.querySelector('.touch-joystick-knob')
    if (base && knob) wireJoystick(base, knob)
  }

  function wireJoystick(base, knob) {
    let pointerId = null
    let centreX = 0
    let centreY = 0

    const move = (clientX, clientY) => {
      const radius = settings.touch.joystickRadius
      const dx = clientX - centreX
      const dy = clientY - centreY
      const distance = Math.hypot(dx, dy)
      // Past the rim the knob keeps creeping, logarithmically, so a thumb
      // that overshoots still feels connected (the reference does the same).
      const shown = distance > radius ? radius + Math.log(1 + distance - radius) * 4 : distance
      const k = distance > 0 ? shown / distance : 0
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`

      const raw = Math.min(distance / radius, 1)
      const dead = settings.touch.deadZone
      joystick.magnitude = raw <= dead ? 0 : (raw - dead) / (1 - dead)
      // Screen up is +y here (DOM y grows downwards).
      joystick.x = distance > 0 ? dx / distance : 0
      joystick.y = distance > 0 ? -dy / distance : 0
    }

    const release = (event) => {
      if (event.pointerId !== pointerId) return
      pointerId = null
      joystick.active = false
      joystick.magnitude = 0
      knob.style.transform = ''
      base.classList.remove('is-active')
    }

    base.addEventListener('pointerdown', (event) => {
      if (pointerId !== null) return
      event.preventDefault()
      pointerId = event.pointerId
      const rect = base.getBoundingClientRect()
      centreX = rect.left + rect.width / 2
      centreY = rect.top + rect.height / 2
      joystick.active = true
      base.classList.add('is-active')
      try {
        base.setPointerCapture(event.pointerId)
      } catch {
        // Capture is a nicety; pointermove on the base still arrives.
      }
      move(event.clientX, event.clientY)
    })
    base.addEventListener('pointermove', (event) => {
      if (event.pointerId === pointerId) move(event.clientX, event.clientY)
    })
    base.addEventListener('pointerup', release)
    base.addEventListener('pointercancel', release)
    base.addEventListener('lostpointercapture', release)
    base.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Coarse pointer == finger. Desktops with a touchscreen still report fine. */
  const isTouchDevice =
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0

  return {
    isTouchDevice,
    joystick,
    setVisible(visible) {
      if (root) root.hidden = !visible
    },
    get state() {
      return {
        brake: isDown('brake'),
        boost: isDown('boost'),
        reverse: isDown('reverse'),
      }
    },
    drainEdges(into) {
      for (const action of edges) into.add(action)
      edges.clear()
    },
  }
}
