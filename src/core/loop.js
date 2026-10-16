/**
 * requestAnimationFrame loop with a clamped delta.
 */
export function createLoop(update) {
  let last = performance.now()
  let running = true
  let handle = 0

  const tick = (now) => {
    if (!running) return
    handle = requestAnimationFrame(tick)
    // Clamp to 100 ms so a hitch does not produce a giant delta.
    const delta = Math.min((now - last) / 1000, 0.1)
    last = now
    update(delta)
  }

  handle = requestAnimationFrame(tick)

  return {
    stop() {
      running = false
      cancelAnimationFrame(handle)
    },
  }
}
