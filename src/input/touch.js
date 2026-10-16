/**
 * On-screen d-pad for phones/tablets. Multi-touch aware: each button tracks the
 * pointer ids currently on it, so you can hold throttle and steer at once.
 *
 * The markup lives in index.html; this module only wires behaviour.
 */

export function createTouchControls(root = document.getElementById('touch')) {
  const active = new Map() // action -> Set<pointerId>
  let respawnPressed = false

  const isDown = (action) => (active.get(action)?.size ?? 0) > 0

  if (root) {
    for (const button of root.querySelectorAll('[data-action]')) {
      const action = button.dataset.action

      const press = (event) => {
        event.preventDefault()
        if (!active.has(action)) active.set(action, new Set())
        active.get(action).add(event.pointerId)
        button.classList.add('is-active')
        if (action === 'respawn') respawnPressed = true

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
  }

  /** Coarse pointer == finger. Desktops with a touchscreen still report fine. */
  const isTouchDevice =
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0

  return {
    isTouchDevice,
    setVisible(visible) {
      if (root) root.hidden = !visible
    },
    get state() {
      return {
        throttle: (isDown('throttle') ? 1 : 0) - (isDown('reverse') ? 1 : 0),
        steer: (isDown('steerLeft') ? 1 : 0) - (isDown('steerRight') ? 1 : 0),
        handbrake: isDown('handbrake'),
      }
    },
    consumeRespawn() {
      const value = respawnPressed
      respawnPressed = false
      return value
    },
  }
}
