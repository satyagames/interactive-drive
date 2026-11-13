import { noise, note, tone } from './synth.js'

/**
 * Positional ambiences (doc 05 §3) on the arena's \`sfx_<id>\` empties: each
 * gets a PannerNode at the empty, full level within half its radius and
 * silent past 1.6x. An emitter only exists while the car is in range, so
 * at most two or three run at once. A profile is a looping bed and/or
 * occasional "grains" (a scratch, a chirp, a passing car) on a random timer.
 *
 * Only the ambiences doc 05 names are voiced; other emitters (gateways,
 * Decade Drive, the territories it doesn't mention) stay silent until the
 * team's sound design says what they should be.
 */
const rand = (a, b) => a + Math.random() * (b - a)
const C4 = 261.63

function bedLoop(ctx, out, buffer, type, freq, q, gain, lfo = 0) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const level = ctx.createGain()
  level.gain.value = gain
  src.connect(filter)
  filter.connect(level)
  level.connect(out)
  const nodes = [src]
  if (lfo) {
    // A slow swell, so a bed breathes instead of hissing flatly.
    const osc = ctx.createOscillator()
    osc.frequency.value = lfo
    const depth = ctx.createGain()
    depth.gain.value = gain * 0.5
    osc.connect(depth)
    depth.connect(level.gain)
    osc.start()
    nodes.push(osc)
  }
  src.start(0, Math.random() * buffer.duration)
  return nodes
}

function padChord(ctx, out, semitones, gain, cutoff = 900) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  filter.connect(out)
  const nodes = []
  for (const s of semitones) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = note(C4 / 2, s)
      osc.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gain
      osc.connect(g)
      g.connect(filter)
      osc.start()
      nodes.push(osc)
    }
  }
  return nodes
}

/** id -> { bed(ctx, out, noise) -> nodes[], grain(ctx, out, noise, at) -> next interval s } */
const PROFILES = {
  // Air over the whole arena.
  arena_wind: { bed: (ctx, out, n) => bedLoop(ctx, out, n.brown, 'lowpass', 420, 0.5, 0.18, 0.07) },
  // HQ: office hum.
  hq: {
    bed: (ctx, out, n) => [
      ...bedLoop(ctx, out, n.brown, 'lowpass', 260, 0.7, 0.25),
      ...padChord(ctx, out, [-12, -5], 0.015, 200),
    ],
  },
  // Studio: pencil scratches and a soft keyboard.
  studio: {
    grain(ctx, out, n, at) {
      if (Math.random() < 0.5) {
        noise(ctx, out, { buffer: n.white, filter: 'highpass', freq: rand(2500, 4000), to: rand(4000, 6000), at, attack: 0.02, decay: rand(0.08, 0.2), gain: 0.18 })
      } else {
        const keys = Math.floor(rand(3, 8))
        for (let i = 0; i < keys; i++) noise(ctx, out, { buffer: n.white, freq: rand(2500, 3500), q: 5, at: at + i * rand(0.08, 0.14), decay: 0.02, gain: 0.25 })
      }
      return rand(0.4, 1.4)
    },
  },
  // Speedway (PACE): distant engines, and a car passing now and then.
  pace: {
    bed: (ctx, out, n) => bedLoop(ctx, out, n.brown, 'bandpass', 160, 1.5, 0.3, 0.2),
    grain(ctx, out, n, at) {
      tone(ctx, out, { type: 'sawtooth', freq: rand(150, 190), to: rand(80, 100), at, attack: 0.9, decay: 1.2, gain: 0.05 })
      return rand(3, 6)
    },
  },
  // R&R: crowd murmur, and applause now and then.
  rnr: {
    bed: (ctx, out, n) => bedLoop(ctx, out, n.brown, 'bandpass', 700, 0.9, 0.35, 0.13),
    grain(ctx, out, n, at) {
      noise(ctx, out, { buffer: n.white, freq: 1800, q: 0.6, at, attack: 0.4, hold: rand(0.8, 1.6), decay: 1.2, gain: 0.12 })
      return rand(8, 15)
    },
  },
  // Culture Commons: birds and soft music.
  culture: {
    bed: (ctx, out) => padChord(ctx, out, [0, 4, 7, 12], 0.008, 700),
    grain(ctx, out, n, at) {
      const chirps = Math.floor(rand(2, 5))
      const base = rand(2400, 3400)
      for (let i = 0; i < chirps; i++) {
        tone(ctx, out, { freq: base, to: base * rand(1.2, 1.5), at: at + i * rand(0.09, 0.16), attack: 0.005, decay: rand(0.05, 0.1), gain: 0.05 })
      }
      return rand(1, 3)
    },
  },
  // Innovation Lab: a synth pad.
  innovation: { bed: (ctx, out) => padChord(ctx, out, [0, 7, 14, 19], 0.012, 1100) },
  // L&D Library: page turns.
  lnd: {
    grain(ctx, out, n, at) {
      noise(ctx, out, { buffer: n.white, freq: 900, to: 3200, q: 0.8, at, attack: 0.05, decay: 0.3, gain: 0.25 })
      return rand(3, 7)
    },
  },
}

export function createAmbience({ ctx, destination, noiseBuffers, emitters }) {
  const live = new Map() // emitter -> { out, panner, nodes, next }

  function start(emitter, profile) {
    const panner = ctx.createPanner()
    panner.panningModel = 'equalpower'
    panner.distanceModel = 'linear'
    panner.refDistance = emitter.radius * 0.5
    panner.maxDistance = emitter.radius * 1.6
    panner.rolloffFactor = 1
    setParam(panner, 'position', emitter.position)
    const out = ctx.createGain()
    out.gain.value = 0
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.6)
    out.connect(panner)
    panner.connect(destination)
    const nodes = profile.bed?.(ctx, out, noiseBuffers) ?? []
    live.set(emitter, { out, panner, nodes, next: ctx.currentTime + rand(0.2, 1) })
  }

  function stop(emitter) {
    const entry = live.get(emitter)
    live.delete(emitter)
    entry.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
    setTimeout(() => {
      for (const node of entry.nodes) node.stop()
      entry.panner.disconnect()
    }, 1500)
  }

  /** Per frame: start emitters the car came into range of, stop the ones it left, fire grains. */
  function update(listenerPosition) {
    for (const emitter of emitters) {
      const profile = PROFILES[emitter.id]
      if (!profile) continue
      const d = emitter.position.distanceTo(listenerPosition)
      const on = live.has(emitter)
      if (!on && d < emitter.radius * 1.6) start(emitter, profile)
      else if (on && d > emitter.radius * 1.75) stop(emitter)
    }
    const now = ctx.currentTime
    for (const [emitter, entry] of live) {
      const grain = PROFILES[emitter.id].grain
      if (!grain || now < entry.next) continue
      entry.next = now + grain(ctx, entry.out, noiseBuffers, now + 0.02)
    }
  }

  return {
    update,
    get live() {
      return [...live.keys()].map((e) => e.id)
    },
  }
}

/** PannerNode / AudioListener position, with the old setter as a fallback (older Safari). */
export function setParam(node, name, v) {
  if (node[`${name}X`]) {
    node[`${name}X`].value = v.x
    node[`${name}Y`].value = v.y
    node[`${name}Z`].value = v.z
  } else if (name === 'position') {
    node.setPosition(v.x, v.y, v.z)
  }
}
