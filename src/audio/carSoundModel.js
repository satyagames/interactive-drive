import { rebuild, settings } from '../config.js'

/**
 * What the car should sound like, as numbers: no AudioContext in here, so
 * the same model drives the synth (`engine.js`) and can be stepped by the
 * audio test without sound.
 *
 *   progress   the reference's engine value, 0..1 (see `settings.audio.engine`)
 *   screech    0, or the volume (volumeMin..volumeMax) of a tyre screech
 *              that starts this frame (see `settings.audio.screech`)
 *
 * Techniques and tuning numbers from folio-2019 (Sounds.js, Car.js); the
 * code is ours.
 */
const REFERENCE_FPS = 60

/** A per-frame easing factor at 60 Hz as a 0..1 blend for a frame of `dt` seconds. */
function ease(perFrame, dt) {
  return 1 - (1 - perFrame) ** (dt * REFERENCE_FPS)
}

export function createCarSoundModel({ vehicle }) {
  const out = { progress: 0, screech: 0, screechRate: 1, cause: null }
  let accel = 0
  let sinceScreech = Infinity
  // A launch is judged over a short window after the threshold is crossed, so
  // its volume reflects how hard the launch turned out to be, not the instant
  // it crossed (which is always "just over").
  let judging = -1
  let judgedPeak = 0

  /** Per frame. `input`: { throttle -1..1, boost }. Returns the same object every time. */
  function update(dt, input) {
    const e = settings.audio.engine
    const st = vehicle.state
    dt = Math.max(dt, 0)

    // ---- engine progress ----
    const throttle = Math.abs(input.throttle ?? 0)
    const speedPerFrame = Math.abs(st.forwardSpeed ?? st.speed) / rebuild.worldScale / REFERENCE_FPS
    const boosting = Boolean(input.boost) && throttle > 0
    const target = Math.min(Math.max(speedPerFrame * e.speedMultiplier + throttle * (boosting ? 1 : 0.5) * e.accelMultiplier, 0), 1)
    out.progress += (target - out.progress) * ease(target > out.progress ? e.easeUp : e.easeDown, dt)
    out.progress = Math.min(Math.max(out.progress, 0), 1)

    // ---- tyre screech ----
    const s = settings.audio.screech
    out.screech = 0
    out.cause = null
    sinceScreech += dt
    // The physics state changes once per step, not per frame: smooth it.
    accel += ((st.forwardAccel ?? 0) - accel) * (1 - Math.exp(-dt / Math.max(s.accelSmoothing, 1e-3)))
    if (!s.enabled || sinceScreech < s.cooldown) {
      judging = -1
    } else if (!st.airborne) {
      let slip = 0
      const speed = Math.abs(st.forwardSpeed ?? st.speed)
      if (judging >= 0) {
        judging += dt
        judgedPeak = Math.max(judgedPeak, accel)
        if (judging >= s.judgeTime) {
          slip = judgedPeak / s.accel
          out.cause = 'launch'
          judging = -1
        }
      } else if (input.throttle > 0 && speed < s.launchMaxSpeed && accel > s.accel) {
        judging = 0
        judgedPeak = accel
      } else if (st.handbrake && st.speed > s.handbrakeMinSpeed && Math.abs(st.lateralSpeed) > s.handbrakeSlip) {
        slip = Math.abs(st.lateralSpeed) / s.handbrakeSlip
        out.cause = 'handbrake'
      }
      if (slip > 0) {
        const amount = Math.min((slip - 1) / Math.max(s.slipFull - 1, 1e-3), 1)
        out.screech = s.volumeMin + (s.volumeMax - s.volumeMin) * amount
        out.screechRate = s.rateMin + Math.random() * (s.rateMax - s.rateMin)
        sinceScreech = 0
      }
    }
    return out
  }

  return {
    update,
    /** Smoothed forward acceleration, m/s² (for tuning the threshold). */
    get accel() {
      return accel
    },
    /** Forget the cooldown and the easing (a respawn, a test). */
    reset() {
      out.progress = 0
      accel = 0
      sinceScreech = Infinity
      judging = -1
    },
  }
}

/**
 * One impact against the per-class table (`settings.audio.impacts`): returns
 * `{ volume, rate }`, or null when the table says not to play it. `lastPlayed`
 * is a Map of class -> the last time (ms) one played; `now` in ms.
 */
export function impactDecision(sfx, speed, lastPlayed, now, random = Math.random) {
  const table = settings.audio.impacts
  const row = table[sfx] ?? table.plastic
  const last = lastPlayed.get(sfx) ?? -Infinity
  if (now - last < row.minDelta) return null
  if (row.velocityMin > 0 && !(speed > row.velocityMin)) return null
  lastPlayed.set(sfx, now)
  const volume = Math.min(Math.max((speed - row.velocityMin) * row.velocityMultiplier, row.volumeMin), row.volumeMax) ** 2
  return { volume, rate: row.rateMin + random() * (row.rateMax - row.rateMin) }
}
