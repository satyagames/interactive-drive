/**
 * The car's continuous sounds (doc 05 §3), all synthesised:
 *
 *   engine  three layers (idle, mid, high), each a sawtooth and a detuned
 *           square through a low-pass. All of it follows one value, the
 *           reference engine "progress" (carSoundModel.js): speed plus
 *           throttle, rising fast and falling slowly. It sets the layer
 *           crossfade, the pitch (0.8 -> 1.8), the level and the brightness
 *   turbo   a whine plus a hiss while boosting
 *   road    low rumble rising with speed
 *   skid    band-passed noise, level from sideways slip while grounded
 *   landing a thud scaled by how fast the car came down
 *   screech a one-shot squeal on a hard launch or handbrake slide (the
 *           model decides when; `screech()` is the sound)
 *
 * Parameters glide with `setTargetAtTime`, so per-frame updates never click.
 */
import { settings } from '../config.js'
import { createCarSoundModel } from './carSoundModel.js'
import { noise, tone } from './synth.js'

const LAYERS = [
  { base: 48, centre: 0, width: 0.45 },
  { base: 72, centre: 0.45, width: 0.4 },
  { base: 104, centre: 1, width: 0.5 },
]

export function createEngineSound({ ctx, destination, noiseBuffers, vehicle }) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)

  const layers = LAYERS.map((spec) => {
    const saw = ctx.createOscillator()
    saw.type = 'sawtooth'
    const square = ctx.createOscillator()
    square.type = 'square'
    square.detune.value = -1210 // an octave and a touch below: body without a beat
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 2
    const gain = ctx.createGain()
    gain.gain.value = 0
    const squareGain = ctx.createGain()
    squareGain.gain.value = 0.5
    saw.connect(filter)
    square.connect(squareGain)
    squareGain.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    saw.start()
    square.start()
    return { spec, saw, square, filter, gain }
  })

  const loop = (buffer, type, freq, q) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(filter)
    filter.connect(gain)
    gain.connect(destination)
    src.start()
    return { src, filter, gain }
  }
  const skid = loop(noiseBuffers.white, 'bandpass', 950, 1.4)
  const road = loop(noiseBuffers.brown, 'lowpass', 180, 0.7)
  const hiss = loop(noiseBuffers.white, 'highpass', 4000, 0.7)

  const whine = ctx.createOscillator()
  whine.type = 'sine'
  const whineGain = ctx.createGain()
  whineGain.gain.value = 0
  whine.connect(whineGain)
  whineGain.connect(destination)
  whine.start()

  let wasAirborne = false
  let fallSpeed = 0
  let throttle = 0
  const model = createCarSoundModel({ vehicle })
  const result = { landing: 0, screech: 0, screechRate: 1, progress: 0 }

  /**
   * Per frame. `input`: this frame's { throttle, boost }. Returns (the same
   * object each time) `landing`: a landing strength, 0 = none; `screech`: the
   * volume of a screech to start now, 0 = none, with its `screechRate`.
   */
  function update(dt, input) {
    const e = settings.audio.engine
    const st = vehicle.state
    const now = ctx.currentTime
    const k = 0.06
    const speed = Math.min(st.speed / Math.max(vehicle.topSpeed * 1.3, 1), 1)
    throttle += (Math.abs(input.throttle) - throttle) * Math.min(dt * 10, 1)
    const car = model.update(dt, input)
    const progress = car.progress
    const pitch = e.pitchMin + (e.pitchMax - e.pitchMin) * progress

    out.gain.setTargetAtTime(e.gain * (e.volumeMin + (e.volumeMax - e.volumeMin) * progress), now, k)
    for (const layer of layers) {
      const d = Math.abs(progress - layer.spec.centre) / layer.spec.width
      const weight = Math.max(0, 1 - d * d)
      const freq = layer.spec.base * pitch * (1 + 0.15 * throttle)
      layer.saw.frequency.setTargetAtTime(freq, now, k)
      layer.square.frequency.setTargetAtTime(freq, now, k)
      layer.filter.frequency.setTargetAtTime(300 + 900 * throttle + 1200 * progress, now, k)
      layer.gain.gain.setTargetAtTime(weight * 0.33, now, k)
    }

    const boosting = st.boosting
    whine.frequency.setTargetAtTime(1400 + 1600 * speed, now, 0.15)
    whineGain.gain.setTargetAtTime(boosting ? 0.04 : 0, now, boosting ? 0.2 : 0.1)
    hiss.gain.gain.setTargetAtTime(boosting ? 0.05 : 0, now, 0.15)
    road.gain.gain.setTargetAtTime(st.airborne ? 0 : 0.5 * speed, now, 0.1)

    const slip = st.airborne ? 0 : Math.abs(st.lateralSpeed)
    const skidLevel = Math.min(Math.max((slip - e.skidFrom) / (e.skidFull - e.skidFrom), 0), 1)
    skid.gain.gain.setTargetAtTime(0.22 * skidLevel, now, 0.05)
    skid.src.playbackRate.setTargetAtTime(0.8 + 0.4 * speed, now, 0.1)

    // Landing thud.
    let landing = 0
    if (st.airborne) fallSpeed = Math.max(fallSpeed, -vehicle.velocity.y)
    if (wasAirborne && !st.airborne) {
      if (fallSpeed > e.landingSpeed) landing = Math.min((fallSpeed - e.landingSpeed) / 8, 1)
      fallSpeed = 0
    }
    wasAirborne = st.airborne
    result.landing = landing
    result.screech = car.screech
    result.screechRate = car.screechRate
    result.progress = progress
    return result
  }

  /**
   * Tyre screech into `voice` at `at`: a narrow band of noise and a thin
   * squeal over it, both sagging in pitch as the tyre bites.
   */
  function screech(voice, at, rate = 1) {
    const f = 1750 * rate
    const seconds = 0.55 / rate
    noise(ctx, voice, { buffer: noiseBuffers.white, filter: 'bandpass', freq: f * 1.15, to: f * 0.8, q: 14, at, attack: 0.03, hold: seconds * 0.35, decay: seconds * 0.65, gain: 1.6 })
    tone(ctx, voice, { type: 'sawtooth', freq: f * 2.02, to: f * 1.55, at, attack: 0.04, hold: seconds * 0.3, decay: seconds * 0.5, gain: 0.05 })
    return tone(ctx, voice, { type: 'triangle', freq: f * 1.05, to: f * 0.78, at, attack: 0.03, hold: seconds * 0.35, decay: seconds * 0.65, gain: 0.22 })
  }

  /** The thud itself, scheduled into `voice` at `at` (the caller owns the voice slot). */
  function thud(voice, at, strength) {
    tone(ctx, voice, { freq: 90, to: 38, at, decay: 0.28, gain: 0.35 + 0.4 * strength })
    return noise(ctx, voice, { buffer: noiseBuffers.brown, filter: 'lowpass', freq: 400, at, decay: 0.18, gain: 0.5 * strength })
  }


  return { update, thud, screech, model, last: result }
}
