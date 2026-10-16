import { settings } from '../config.js'

/**
 * Frame-rate meter for the HUD.
 *
 * Deliberately not a full stats panel: the only question this has to answer
 * is "did that change cost anything", and for that a smoothed instantaneous
 * rate plus a worst-case over the last window is more useful than a graph.
 * `window.__proto.fps.sample()` dumps both from the console.
 */

/** Length of the rolling window used for the 1%-low figure, in frames. */
const WINDOW = 180

export function createFpsMeter(element) {
  const frames = new Float32Array(WINDOW)
  let cursor = 0
  let filled = 0
  let smoothed = 60
  let accumulator = 0

  function update(delta) {
    if (delta > 0) {
      frames[cursor] = delta
      cursor = (cursor + 1) % WINDOW
      filled = Math.min(filled + 1, WINDOW)
      // Exponential smoothing, otherwise the readout is unreadable noise.
      smoothed += (1 / delta - smoothed) * 0.08
    }

    if (!element) return
    const visible = settings.debug.showFps
    element.hidden = !visible
    if (!visible) return

    accumulator += delta
    if (accumulator < 0.25) return
    accumulator = 0
    element.textContent = `${Math.round(smoothed)} fps`
  }

  /** Average and worst frame time over the window, in fps. */
  function sample() {
    if (filled === 0) return { average: 0, worst: 0, frames: 0 }
    let total = 0
    let slowest = 0
    for (let i = 0; i < filled; i++) {
      total += frames[i]
      if (frames[i] > slowest) slowest = frames[i]
    }
    return {
      average: filled / total,
      worst: 1 / slowest,
      frames: filled,
    }
  }

  return { update, sample }
}
