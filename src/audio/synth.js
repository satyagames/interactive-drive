/**
 * Placeholder sound synthesis: every effect is built from oscillators and
 * filtered noise until the real files in public/audio/MANIFEST.md arrive.
 * These helpers schedule one note or one noise burst on the audio clock and
 * clean up after themselves; `voices` caps how many play at once.
 */

/** Seconds of white, pink-ish or brown noise as a loopable buffer (made once, shared). */
export function createNoiseBuffers(ctx, seconds = 2) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const make = (fill) => {
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    fill(buffer.getChannelData(0))
    return buffer
  }
  return {
    white: make((d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }),
    // Brown: integrated white noise, normalised -- rumble, wind, crowds.
    brown: make((d) => {
      let last = 0
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        d[i] = last * 3.5
      }
    }),
  }
}

/**
 * At most `max()` one-shots at once. `take()` claims a slot (null when full:
 * the caller drops the sound), the returned `free` gives it back when the
 * sound's last node ends.
 */
export function createVoices(max) {
  let live = 0
  const stats = { peakVoices: 0, dropped: 0, played: 0 }
  return {
    stats,
    get live() {
      return live
    },
    take() {
      if (live >= max()) {
        stats.dropped += 1
        return null
      }
      live += 1
      stats.played += 1
      stats.peakVoices = Math.max(stats.peakVoices, live)
      let freed = false
      return () => {
        if (freed) return
        freed = true
        live -= 1
      }
    },
  }
}

/**
 * One enveloped oscillator note into `destination`.
 * { type, freq, to (glide target), at, attack, hold, decay, gain, detune }
 * Returns the time it ends.
 */
export function tone(ctx, destination, { type = 'sine', freq, to = null, at = ctx.currentTime, attack = 0.005, hold = 0, decay = 0.3, gain = 0.3, detune = 0 }, onEnd) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + attack + hold + decay)
  osc.detune.value = detune
  envelope(env.gain, at, attack, hold, decay, gain)
  osc.connect(env)
  env.connect(destination)
  const end = at + attack + hold + decay + 0.02
  osc.start(at)
  osc.stop(end)
  osc.onended = () => {
    env.disconnect()
    onEnd?.()
  }
  return end
}

/**
 * One filtered noise burst. { buffer, filter: 'bandpass' | 'lowpass' |
 * 'highpass', freq, to, q, at, attack, hold, decay, gain, rate }
 */
export function noise(ctx, destination, { buffer, filter = 'bandpass', freq = 1000, to = null, q = 1, at = ctx.currentTime, attack = 0.002, hold = 0, decay = 0.2, gain = 0.3, rate = 1 }, onEnd) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate
  const biquad = ctx.createBiquadFilter()
  biquad.type = filter
  biquad.frequency.setValueAtTime(freq, at)
  if (to) biquad.frequency.exponentialRampToValueAtTime(to, at + attack + hold + decay)
  biquad.Q.value = q
  const env = ctx.createGain()
  envelope(env.gain, at, attack, hold, decay, gain)
  src.connect(biquad)
  biquad.connect(env)
  env.connect(destination)
  const end = at + attack + hold + decay + 0.02
  // Start somewhere random in the buffer so repeats don't sound identical.
  src.start(at, Math.random() * Math.max(buffer.duration - (end - at), 0))
  src.stop(end)
  src.onended = () => {
    env.disconnect()
    onEnd?.()
  }
  return end
}

function envelope(param, at, attack, hold, decay, peak) {
  param.setValueAtTime(0, at)
  param.linearRampToValueAtTime(peak, at + attack)
  param.setValueAtTime(peak, at + attack + hold)
  // Exponential decay reads as natural; it can't reach 0, so aim just above.
  param.exponentialRampToValueAtTime(0.0001, at + attack + hold + decay)
}

/** Semitones above `base` Hz. */
export const note = (base, semitones) => base * 2 ** (semitones / 12)
