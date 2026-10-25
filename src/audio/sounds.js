import * as THREE from 'three'

import { settings } from '../config.js'
import { morseTimeline } from '../game/morse.js'
import { noise, note, tone } from './synth.js'

/**
 * Every one-shot in doc 05 §3, synthesised, wired to the game's event bus:
 *
 *   impact ....... by \`sfx\` class -- metal ring, wood knock, paper swish,
 *                  plastic tick, brick thump, rubber boing; level and pitch
 *                  from the impact's strength, faded and panned by distance
 *   collect ...... pentatonic chime climbing with the combo; golden = chord;
 *                  shuriken = a metallic "shing"
 *   stamp ........ ink thunk + crowd cheer      badge / rank .. sparkle arpeggio
 *   dash ......... countdown beeps, start, checkpoint blip, penalty buzz,
 *                  "submitted" fanfare
 *   minigames .... bulb dings, strike cheer, completion chime
 *   easter eggs .. Konami run-up, the beacon's Morse "10"
 *   horn ......... two-tone "dot-dot"
 *
 * Each sound is one voice (a gain node every part of it goes into); at
 * most \`settings.audio.maxVoices\` play at once and the rest are dropped.
 */
const C5 = 523.25
const PENTATONIC = [0, 2, 4, 7, 9]

export function createSounds({ ctx, bus, noiseBuffers, voices, vehicle, camera }) {
  const { white, brown } = noiseBuffers
  const right = new THREE.Vector3()
  const toSound = new THREE.Vector3()

  /**
   * Play one sound. \`build(out, at)\` schedules its parts into \`out\` and
   * returns when the last ends. \`position\` (optional) fades and pans it
   * relative to the car.
   */
  function play(build, { gain = 1, position = null, delay = 0 } = {}) {
    let level = gain
    let pan = 0
    if (position) {
      toSound.subVectors(position, vehicle.position)
      const distance = toSound.length()
      if (distance > settings.audio.hearing) return false
      level *= 1 / (1 + distance / 10)
      right.setFromMatrixColumn(camera.matrixWorld, 0)
      pan = distance > 0.5 ? Math.max(-1, Math.min(1, toSound.dot(right) / distance)) : 0
    }
    const free = voices.take()
    if (!free) return false
    const out = ctx.createGain()
    out.gain.value = level
    let tail = out
    if (pan !== 0) {
      const panner = ctx.createStereoPanner()
      panner.pan.value = pan * 0.8
      out.connect(panner)
      tail = panner
    }
    tail.connect(bus)
    const at = ctx.currentTime + 0.005 + delay
    const end = build(out, at)
    setTimeout(() => {
      tail.disconnect()
      if (tail !== out) out.disconnect()
      free()
    }, (end - ctx.currentTime) * 1000 + 50)
    return true
  }

  // ---- impacts ----------------------------------------------------------------

  const IMPACTS = {
    metal: (out, at, s) => {
      const f = 520 * (1.3 - 0.5 * s) * (0.9 + Math.random() * 0.2)
      let end = noise(ctx, out, { buffer: white, filter: 'highpass', freq: 3000, at, decay: 0.03, gain: 0.25 })
      for (const [ratio, level] of [[1, 0.22], [2.76, 0.12], [5.4, 0.07], [8.93, 0.04]]) {
        end = Math.max(end, tone(ctx, out, { freq: f * ratio, at, decay: 0.25 + 0.35 * s / ratio, gain: level }))
      }
      return end
    },
    wood: (out, at, s) => {
      tone(ctx, out, { freq: 190 * (1.2 - 0.3 * s), to: 150, at, decay: 0.12, gain: 0.35 })
      return noise(ctx, out, { buffer: white, freq: 900, q: 3, at, decay: 0.07, gain: 0.4 })
    },
    paper: (out, at, s) =>
      noise(ctx, out, { buffer: white, filter: 'highpass', freq: 2500, to: 5000, at, attack: 0.03, decay: 0.18 + 0.1 * s, gain: 0.25 }),
    plastic: (out, at, s) => {
      tone(ctx, out, { type: 'triangle', freq: 420 * (1.2 - 0.3 * s), at, decay: 0.06, gain: 0.2 })
      return noise(ctx, out, { buffer: white, freq: 1600, q: 4, at, decay: 0.05, gain: 0.35 })
    },
    brick: (out, at, s) => {
      tone(ctx, out, { freq: 95, to: 55, at, decay: 0.2, gain: 0.45 })
      return noise(ctx, out, { buffer: brown, filter: 'lowpass', freq: 700, at, decay: 0.22 + 0.1 * s, gain: 0.6 })
    },
    rubber: (out, at, s) =>
      tone(ctx, out, { type: 'triangle', freq: 170 * (1.1 - 0.2 * s), to: 85, at, decay: 0.2, gain: 0.4 }),
  }

  function impact({ position, sfx, strength }) {
    const make = IMPACTS[sfx] ?? IMPACTS.plastic
    play((out, at) => make(out, at, strength), { gain: 0.25 + 0.6 * strength, position })
  }

  // ---- pickups and progress -----------------------------------------------------

  const bell = (out, at, freq, gain = 0.25, decay = 0.5) => {
    tone(ctx, out, { freq: freq * 2, at, decay: decay * 0.5, gain: gain * 0.3 })
    return tone(ctx, out, { freq, at, decay, gain })
  }

  function collect({ kind, combo }) {
    if (kind === 'golden') {
      play((out, at) => {
        let end = 0
        for (const [i, s] of [0, 4, 7, 12].entries()) end = Math.max(end, bell(out, at + i * 0.04, note(C5, s), 0.18, 0.9))
        return end
      })
    } else if (kind === 'shuriken') {
      play((out, at) => {
        noise(ctx, out, { buffer: white, filter: 'highpass', freq: 3000, to: 9000, at, attack: 0.04, decay: 0.25, gain: 0.25 })
        return tone(ctx, out, { freq: 1800, to: 3200, at, decay: 0.4, gain: 0.12 })
      })
    } else {
      // Dots climb the C-major pentatonic with the combo, two octaves at most.
      const step = Math.min(Math.max(combo, 1) - 1, 9)
      const semis = PENTATONIC[step % 5] + 12 * Math.floor(step / 5)
      play((out, at) => bell(out, at, note(C5, semis), 0.22, 0.45))
    }
  }

  function arpeggio(steps, { base = C5, gap = 0.07, type = 'triangle', gain = 0.16, decay = 0.35, delay = 0 } = {}) {
    play((out, at) => {
      let end = 0
      steps.forEach((s, i) => {
        end = Math.max(end, tone(ctx, out, { type, freq: note(base, s), at: at + i * gap, decay, gain }))
      })
      return end
    }, { delay })
  }

  /** A crowd: band-passed brown noise swelling, with a wobble for many voices. */
  const cheer = (out, at, seconds = 1.6, gain = 0.4) => {
    noise(ctx, out, { buffer: brown, freq: 900, q: 0.8, at, attack: 0.25, hold: seconds * 0.4, decay: seconds * 0.6, gain })
    return noise(ctx, out, { buffer: white, freq: 2400, q: 1.2, at: at + 0.05, attack: 0.3, hold: seconds * 0.3, decay: seconds * 0.6, gain: gain * 0.25 })
  }

  function stamp() {
    play((out, at) => {
      tone(ctx, out, { freq: 110, to: 45, at, decay: 0.25, gain: 0.5 })
      noise(ctx, out, { buffer: brown, filter: 'lowpass', freq: 500, at, decay: 0.15, gain: 0.6 })
      return cheer(out, at + 0.1)
    })
  }

  // ---- the Deadline Dash ----------------------------------------------------------

  function dash({ phase }) {
    if (phase === 'countdown') play((out, at) => tone(ctx, out, { type: 'square', freq: 660, at, hold: 0.08, decay: 0.08, gain: 0.08 }))
    else if (phase === 'start') play((out, at) => tone(ctx, out, { type: 'square', freq: 1320, at, hold: 0.25, decay: 0.15, gain: 0.08 }))
    else if (phase === 'checkpoint') arpeggio([7, 12], { gap: 0.08, gain: 0.14 })
    else if (phase === 'penalty') play((out, at) => tone(ctx, out, { type: 'sawtooth', freq: 110, at, hold: 0.18, decay: 0.1, gain: 0.08 }))
    else if (phase === 'finish') fanfare()
    else if (phase === 'cancel') arpeggio([7, 3, 0], { base: C5 / 2, gap: 0.1, gain: 0.1 })
  }

  /** "Submitted": a brassy C major run, then the chord held. */
  function fanfare(big = false) {
    play((out, at) => {
      const brass = (s, t, hold, gain = 0.1) =>
        tone(ctx, out, { type: 'sawtooth', freq: note(C5 / 2, s), at: at + t, attack: 0.03, hold, decay: 0.3, gain })
      ;[0, 4, 7].forEach((s, i) => brass(s, i * 0.12, 0.06))
      let end = 0
      for (const s of [0, 4, 7, 12]) end = Math.max(end, brass(s, 0.38, big ? 1.1 : 0.6, 0.07))
      if (big) end = Math.max(end, cheer(out, at + 0.3, 2.4, 0.35))
      return end
    })
  }

  // ---- the rest --------------------------------------------------------------------

  function horn() {
    // Two-tone "dot-dot": a major third, twice.
    play((out, at) => {
      let end = 0
      for (const t of [0, 0.2]) {
        for (const freq of [440, 554.37]) end = Math.max(end, tone(ctx, out, { type: 'square', freq, at: at + t, attack: 0.01, hold: 0.1, decay: 0.05, gain: 0.06 }))
      }
      return end
    })
  }

  function morse() {
    play((out, at) => {
      let t = 0
      let end = 0
      for (const [on, off] of morseTimeline()) {
        end = tone(ctx, out, { freq: 880, at: at + t, attack: 0.01, hold: on - 0.02, decay: 0.03, gain: 0.08 })
        t += on + off
      }
      return end
    })
  }
  // The light repeats the code twice (src/vfx); so does the sound.
  const morseLength = morseTimeline().reduce((sum, [on, off]) => sum + on + off, 0)

  return {
    play,
    impact,
    horn,
    /** Subscribe to the game's events. */
    listen(events) {
      events.on('impact', impact)
      events.on('collect', collect)
      events.on('stamp', stamp)
      events.on('badge', () => arpeggio([0, 4, 7, 11, 14], { gap: 0.06, gain: 0.12, delay: 0.15 }))
      events.on('rank', () => arpeggio([0, 7, 12, 16, 19], { gap: 0.08, gain: 0.12, delay: 0.3 }))
      events.on('station-open', () => play((out, at) => tone(ctx, out, { freq: 880, to: 1320, at, decay: 0.08, gain: 0.08 })))
      events.on('dash', dash)
      events.on('minigame', ({ id, phase, lit }) => {
        if (id === 'idea_spark' && phase === 'progress') play((out, at) => bell(out, at, note(C5, PENTATONIC[(lit - 1) % 5] + 12), 0.15))
        else if (id === 'strike_a_win' && phase === 'confetti') play((out, at) => cheer(out, at, 2))
        else if (phase === 'complete') arpeggio([0, 4, 7, 12], { gap: 0.08, gain: 0.13 })
        else if (phase === 'fail') arpeggio([4, 0], { base: C5 / 2, gap: 0.15, gain: 0.1 })
      })
      events.on('easter-egg', ({ id }) => {
        if (id === 'konami') arpeggio([0, 2, 4, 5, 7, 9, 11, 12, 16, 19, 24], { gap: 0.05, gain: 0.1, type: 'square' })
        if (id === 'beacon_morse') {
          morse()
          setTimeout(morse, morseLength * 1000)
        }
      })
      events.on('finale', () => fanfare(true))
    },
  }
}
