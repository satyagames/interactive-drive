import { settings } from '../config.js'
import { noise, note, tone } from './synth.js'

/**
 * The 10th-anniversary theme (doc 05 §3), as a placeholder: an original
 * 8-bar loop in C (C | Am | F | G | C | Em | F | G) played by a small
 * sequencer in four stems -- keys, bass, drums, lead. A stem joins (fades
 * in) once the passport has `settings.audio.music.unlock[stem]` stamps; the
 * finale brings in all four. When the real stems arrive they replace the
 * synth voices and keep this unlock logic.
 *
 * Scheduling runs on a timer with a look-ahead on the audio clock, not on
 * requestAnimationFrame, so the beat holds when frames stutter.
 */
const C4 = 261.63
const C2 = 65.41
const LOOKAHEAD = 0.3
const TICK_MS = 50

// Per bar: chord tones (semitones from C4) and the bass root (from C2).
const BARS = [
  { chord: [0, 4, 7], root: 0 },
  { chord: [-3, 0, 4], root: 9 },
  { chord: [-7, -3, 0], root: 5 },
  { chord: [-5, -1, 2], root: 7 },
  { chord: [0, 4, 7], root: 0 },
  { chord: [-8, -5, -1], root: 4 },
  { chord: [-7, -3, 0], root: 5 },
  { chord: [-5, -1, 2], root: 7 },
]
// Lead: per bar, [sixteenth, semitones from C5, length in sixteenths].
const LEAD = [
  [[0, 7, 2], [4, 9, 2], [8, 12, 4], [14, 9, 2]],
  [[0, 7, 3], [4, 4, 2], [8, 2, 4]],
  [[0, 0, 2], [2, 2, 2], [4, 4, 4], [10, 9, 4]],
  [[0, 7, 6], [8, 2, 6]],
  [[0, 7, 2], [4, 9, 2], [8, 12, 4], [14, 14, 2]],
  [[0, 16, 4], [6, 14, 2], [8, 11, 4]],
  [[0, 9, 3], [4, 12, 3], [8, 9, 2], [12, 7, 2]],
  [[0, 7, 4], [8, 2, 2], [12, 7, 4]],
]
const STEMS = ['keys', 'bass', 'drums', 'lead']
const LEVELS = { keys: 0.9, bass: 0.9, drums: 0.8, lead: 0.7 }

export function createMusic({ ctx, destination, noiseBuffers }) {
  const stems = {}
  for (const name of STEMS) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(destination)
    stems[name] = { gain, on: false }
  }

  let step = 0 // sixteenths since the start
  let nextTime = ctx.currentTime + 0.1
  let timer = 0

  function sixteenth() {
    return 60 / settings.audio.music.bpm / 4
  }

  function schedule(index, at) {
    const bar = BARS[Math.floor(index / 16) % BARS.length]
    const s = index % 16
    const len = sixteenth()
    if (stems.keys.on && (s === 0 || s === 8 || s === 14)) {
      for (const semis of bar.chord) tone(ctx, stems.keys.gain, { type: 'triangle', freq: note(C4, semis), at, attack: 0.01, decay: s === 14 ? 0.25 : 0.9, gain: 0.045 })
    }
    if (stems.bass.on && (s === 0 || s === 6 || s === 8 || s === 11)) {
      tone(ctx, stems.bass.gain, { type: 'triangle', freq: note(C2, bar.root), at, attack: 0.01, hold: len, decay: 0.25, gain: 0.2 })
    }
    if (stems.drums.on) {
      if (s === 0 || s === 8 || s === 10) tone(ctx, stems.drums.gain, { freq: 150, to: 45, at, decay: 0.22, gain: 0.35 })
      if (s === 4 || s === 12) {
        noise(ctx, stems.drums.gain, { buffer: noiseBuffers.white, freq: 1800, q: 0.9, at, decay: 0.14, gain: 0.18 })
        tone(ctx, stems.drums.gain, { type: 'triangle', freq: 185, at, decay: 0.07, gain: 0.08 })
      }
      if (s % 2 === 0) noise(ctx, stems.drums.gain, { buffer: noiseBuffers.white, filter: 'highpass', freq: 7000, at, decay: 0.035, gain: s % 4 === 2 ? 0.08 : 0.05 })
    }
    if (stems.lead.on) {
      for (const [at16, semis, length] of LEAD[Math.floor(index / 16) % LEAD.length]) {
        if (at16 !== s) continue
        tone(ctx, stems.lead.gain, { type: 'square', freq: note(C4 * 2, semis), at, attack: 0.02, hold: length * len * 0.6, decay: length * len * 0.4, gain: 0.035 })
        tone(ctx, stems.lead.gain, { freq: note(C4 * 4, semis), at, attack: 0.02, decay: length * len, gain: 0.015 })
      }
    }
  }

  function tick() {
    // After a long stall (a hidden tab) don't try to catch up: restart the bar.
    if (nextTime < ctx.currentTime - 0.5) {
      nextTime = ctx.currentTime + 0.05
      step = Math.ceil(step / 16) * 16
    }
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      schedule(step, nextTime)
      nextTime += sixteenth()
      step += 1
    }
  }

  /** Bring stems in or out for this many stamps (`finale` = everything). */
  function setProgress(stamps, finale = false) {
    const unlock = settings.audio.music.unlock
    for (const name of STEMS) {
      const on = finale || stamps >= unlock[name]
      if (on === stems[name].on) continue
      stems[name].on = on
      stems[name].gain.gain.setTargetAtTime(on ? LEVELS[name] : 0, ctx.currentTime, on ? 1.5 : 0.4)
    }
  }

  return {
    setProgress,
    start() {
      if (!timer) timer = setInterval(tick, TICK_MS)
    },
    stop() {
      clearInterval(timer)
      timer = 0
    },
    get stems() {
      return STEMS.filter((name) => stems[name].on)
    },
  }
}
