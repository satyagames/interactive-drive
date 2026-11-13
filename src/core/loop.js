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

  // A hidden tab gets no frames. Without this the first frame back would be a
  // 100 ms step (six physics steps at once) and the world would lurch forward.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now()
  })

  return {
    stop() {
      running = false
      cancelAnimationFrame(handle)
    },
    /** Resume after `stop()`. */
    start() {
      if (running) return
      running = true
      last = performance.now()
      handle = requestAnimationFrame(tick)
    },
    /**
     * Run one frame by hand with a fixed delta (debug: scripted tests in a
     * hidden or throttled tab, where requestAnimationFrame barely fires).
     */
    step(delta) {
      update(delta)
    },
  }
}
