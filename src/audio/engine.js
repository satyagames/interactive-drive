/**
 * The car's continuous sounds (doc 05 §3), all synthesised:
 *
 *   engine  three layers (idle, mid, high), each a sawtooth and a detuned
 *           square through a low-pass; crossfaded by speed, pitch 0.8 -> 1.8
 *           with speed, level and brightness up with throttle
 *   turbo   a whine plus a hiss while boosting
 *   road    low rumble rising with speed
 *   skid    band-passed noise, level from sideways slip while grounded
 *   landing a thud scaled by how fast the car came down
 *
 * Parameters glide with `setTargetAtTime`, so per-frame updates never click.
 */
import { settings } from '../config.js'
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

  /** Per frame. `input`: this frame's { throttle, boost }. Returns a landing strength (0 = none). */
  function update(dt, input) {
    const e = settings.audio.engine
    const st = vehicle.state
    const now = ctx.currentTime
    const k = 0.06
    const speed = Math.min(st.speed / Math.max(vehicle.topSpeed * 1.3, 1), 1)
    throttle += (Math.abs(input.throttle) - throttle) * Math.min(dt * 10, 1)
    const pitch = e.pitchMin + (e.pitchMax - e.pitchMin) * speed

    out.gain.setTargetAtTime(e.idleGain + e.throttleGain * throttle, now, k)
    for (const layer of layers) {
      const d = Math.abs(speed - layer.spec.centre) / layer.spec.width
      const weight = Math.max(0, 1 - d * d)
      const freq = layer.spec.base * pitch * (1 + 0.15 * throttle)
      layer.saw.frequency.setTargetAtTime(freq, now, k)
      layer.square.frequency.setTargetAtTime(freq, now, k)
      layer.filter.frequency.setTargetAtTime(300 + 900 * throttle + 1200 * speed, now, k)
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
    return landing
  }

  /** The thud itself, scheduled into `voice` at `at` (the caller owns the voice slot). */
  function thud(voice, at, strength) {
    tone(ctx, voice, { freq: 90, to: 38, at, decay: 0.28, gain: 0.35 + 0.4 * strength })
    return noise(ctx, voice, { buffer: noiseBuffers.brown, filter: 'lowpass', freq: 400, at, decay: 0.18, gain: 0.5 * strength })
  }


  return { update, thud }
}
