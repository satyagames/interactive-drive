/**
 * Full-screen fade used to hide teleports (R respawn). `run(midpoint)` fades
 * to black, calls `midpoint` while the screen is covered, then fades back.
 * Overlapping calls are ignored so mashing R cannot stack fades.
 *
 * Opacity only -- no movement -- so it stays on under prefers-reduced-motion,
 * just quicker.
 */
export function createScreenFade(element, { duration = 0.18 } = {}) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const ms = (reducedMotion ? duration / 2 : duration) * 1000
  element.style.transitionDuration = `${ms}ms`
  let busy = false

  function run(midpoint) {
    if (busy) return
    busy = true
    element.classList.add('is-covering')
    setTimeout(() => {
      midpoint()
      element.classList.remove('is-covering')
      setTimeout(() => {
        busy = false
      }, ms)
    }, ms)
  }

  return { run }
}
