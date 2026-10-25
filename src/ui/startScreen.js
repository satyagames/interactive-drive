import { t } from '../content/ui.js'

/**
 * Loading and Start (doc 05 §5): a black screen whose big "10" fills with
 * Deloitte green as the arena loads, "USI Pursuits COE · 10 Years" under it,
 * then a Start button. Pressing Start is the visitor's first gesture, so it
 * is also what unlocks the sound (src/audio/ listens for it).
 *
 * The progress bar is a real `role="progressbar"`; "Ready" is announced
 * when Start appears, and Start takes focus so Enter or Space begins.
 */
export function createStartScreen({ root }) {
  const fill = root.querySelector('.start__ten-fill')
  const bar = root.querySelector('.start__bar')
  const progressbar = root.querySelector('[role="progressbar"]')
  const status = root.querySelector('.start__status')
  const button = root.querySelector('.start__button')
  let shown = 0

  /** 0..1. Never goes backwards (stages report independently). */
  function setProgress(fraction) {
    shown = Math.max(shown, Math.min(Math.max(fraction, 0), 1))
    const percent = Math.round(shown * 100)
    fill.setAttribute('y', String(140 * (1 - shown)))
    bar.style.transform = `scaleX(${shown})`
    progressbar.setAttribute('aria-valuenow', String(percent))
  }

  /** Loading finished: show Start; `onStart` runs once, on the click. */
  function ready(onStart) {
    setProgress(1)
    root.classList.add('is-ready')
    status.textContent = t('start.ready')
    button.hidden = false
    button.focus()
    button.addEventListener('click', () => {
      root.classList.add('is-leaving')
      // Fade out, then take it out of the accessibility tree entirely.
      setTimeout(() => {
        root.hidden = true
      }, 450)
      onStart()
    }, { once: true })
  }

  function fail(message) {
    status.textContent = message
    root.classList.add('is-failed')
  }

  return { setProgress, ready, fail }
}
