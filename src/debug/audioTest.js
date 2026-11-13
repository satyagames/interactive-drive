import * as THREE from 'three'

import { impactDecision, createCarSoundModel } from '../audio/carSoundModel.js'
import { createEngineSound } from '../audio/engine.js'
import { createMixer } from '../audio/mixer.js'
import { createSounds } from '../audio/sounds.js'
import { createNoiseBuffers, createVoices } from '../audio/synth.js'
import { rebuild, settings } from '../config.js'

/**
 * Development only (`#debug` in a dev build): checks the doc 11 R2 audio
 * features. Like the nav test it steps the real loop by hand and never waits
 * on requestAnimationFrame.
 *
 *   P  engine progress   rest, cruise and boost values; fast up, slow down;
 *                        the same at 60 Hz and uneven 144 Hz
 *   S  tyre screech      one per hard launch, none inside the cooldown, none
 *                        when re-applying throttle at speed, one per
 *                        handbrake slide however long it is held
 *   I  impact table      velocity floor, volume range, per-class repeat
 *                        delay, random rate per hit, no machine-gunning
 *   V  voices and mute   an offline render of the loudest case (the engine at
 *                        full progress plus more one-shots than there are
 *                        voices) never clips; M toggles; a hidden tab
 *                        suspends the sound and coming back restores it
 *
 * The car sound model (`audio/carSoundModel.js`) holds no AudioContext, so P
 * and S run on a private copy of it fed by the real car and the real input,
 * whether or not sound has been unlocked. V's last check needs the real
 * context: click Start with a real click first.
 *
 * Returns `{ passed, rows, notes }`.
 */
export async function runAudioTest({
  loop, vehicle, input, audio, cameraRig, post, world, RAPIER, gameWorld,
  isReady = () => true, sections = 'PSIV', restart = true,
}) {
  const rows = []
  const notes = []
  const row = (id, check, measured, limit, pass) => rows.push({ id, check, measured, limit, pass })
  const round = (v, d = 3) => Number(v.toFixed(d))
  if (!isReady()) return { passed: false, rows, notes: ['Not run: press Start and close the menu first.'] }

  const a = settings.audio
  const savedRender = post.render
  // Back here afterwards, at ground level: the car may still be dropping in from a respawn.
  const home = { position: vehicle.position.clone().setY(0.6), quaternion: vehicle.quaternion.clone() }
  loop.stop()
  await gameWorld.streamRest()
  post.render = () => {}
  for (let i = 0; i < 6; i++) loop.step(1 / 60)

  // ---- helpers --------------------------------------------------------------

  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
  const model = createCarSoundModel({ vehicle })
  /** Step the game for `seconds`, feeding the private model; `each(dt, out)` sees every frame. */
  function drive(seconds, each = null, hz = 60) {
    const frames = Math.max(1, Math.round(seconds * hz))
    for (let i = 0; i < frames; i++) {
      loop.step(1 / hz)
      const out = model.update(1 / hz, input.state)
      each?.(1 / hz, out)
    }
  }

  const shape = new RAPIER.Cuboid(1.3, 0.5, 1.9)
  const identity = { x: 0, y: 0, z: 0, w: 1 }
  function clearAt(x, z, margin = 5) {
    if (world.intersectionWithShape({ x, y: 0.9, z }, identity, shape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, vehicle.body)) return false
    const near = (list) => list.some((e) => Math.hypot(e.position.x - x, e.position.z - z) < Math.hypot(e.halfExtents.x, e.halfExtents.z) + margin)
    return !near(gameWorld.areas) && !near(gameWorld.triggers)
  }
  /** A straight of `length` m, `width` m wide, clear of colliders, areas and triggers. */
  function findStraight(length, width = 0) {
    for (const radius of [100, 110, 85, 70, 55, 120, 40]) {
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2
        const sx = Math.sin(ang) * radius
        const sz = Math.cos(ang) * radius
        for (const yaw of [ang + Math.PI / 2, ang - Math.PI / 2, ang, ang + Math.PI]) {
          const fx = -Math.sin(yaw)
          const fz = -Math.cos(yaw)
          let ok = true
          for (let d = 0; d <= length && ok; d += 1.5) {
            for (const side of width ? [-width / 2, 0, width / 2] : [0]) {
              const x = sx + fx * d - fz * side
              const z = sz + fz * d + fx * side
              ok = ok && Math.hypot(x, z) < 135 && clearAt(x, z)
            }
          }
          if (ok) return { x: sx, z: sz, yaw }
        }
      }
    }
    return null
  }
  /** Put the car at x, z facing `yaw`, moving at `speed`; not a respawn. */
  function place(spot, speed = 0) {
    const fx = -Math.sin(spot.yaw)
    const fz = -Math.cos(spot.yaw)
    vehicle.body.setTranslation({ x: spot.x, y: 0.5, z: spot.z }, true)
    vehicle.body.setRotation({ x: 0, y: Math.sin(spot.yaw / 2), z: 0, w: Math.cos(spot.yaw / 2) }, true)
    vehicle.body.setLinvel({ x: fx * speed, y: 0, z: fz * speed }, true)
    vehicle.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    cameraRig.reset()
  }
  const rest = (spot) => {
    place(spot)
    drive(1)
  }

  const straight = findStraight(70)
  const pad = findStraight(60, 30) ?? straight
  if (!straight) notes.push('No clear 70 m straight found: sections P and S skipped.')

  try {
    // ---- P: engine progress ---------------------------------------------------
    if (sections.includes('P') && straight) {
      const e = a.engine
      const perFrame = (speed) => speed / rebuild.worldScale / 60
      rest(straight)
      model.reset()
      drive(1)
      const atRest = model.update(0, input.state).progress
      row('P1', 'Progress at rest, no input', round(atRest), '< 0.02', atRest < 0.02)

      key('keydown', 'KeyW')
      drive(2.5)
      const cruise = model.update(0, input.state).progress
      const cruiseWanted = Math.min(perFrame(vehicle.state.speed) * e.speedMultiplier + 0.5 * e.accelMultiplier, 1)
      row('P2', `Progress cruising at the cap (${round(vehicle.state.speed, 1)} m/s)`, round(cruise), `${round(cruiseWanted)} +- 0.02`, Math.abs(cruise - cruiseWanted) < 0.02)
      key('keyup', 'KeyW')
      drive(0.6)
      const coast = model.update(0, input.state).progress
      const coastWanted = perFrame(vehicle.state.speed) * e.speedMultiplier
      row('P3', 'Progress coasting just after lifting off (throttle term gone)', round(coast), `${round(coastWanted)} +- 0.03`, Math.abs(coast - coastWanted) < 0.03)

      rest(straight)
      key('keydown', 'KeyW')
      key('keydown', 'ShiftLeft')
      drive(2)
      const boost = model.update(0, input.state).progress
      key('keyup', 'ShiftLeft')
      key('keyup', 'KeyW')
      row('P4', 'Progress boosting', round(boost), '>= 0.99', boost >= 0.99)

      // Easing on its own: a stand-in car whose speed steps, so the only thing
      // moving the value is the up / down easing.
      const fake = { state: { forwardSpeed: 0, speed: 0, lateralSpeed: 0, airborne: false, forwardAccel: 0 } }
      const full = (1 / e.speedMultiplier) * rebuild.worldScale * 60 // the speed that alone gives progress 1
      const none = { throttle: 0, boost: false }
      const time90 = (from, to, dts) => {
        const m = createCarSoundModel({ vehicle: fake })
        fake.state.forwardSpeed = from * full
        for (let i = 0; i < 600; i++) m.update(1 / 60, none)
        fake.state.forwardSpeed = to * full
        let t = 0
        for (let i = 0; i < 4000; i++) {
          const dt = dts(i)
          const p = m.update(dt, none).progress
          t += dt
          if (Math.abs(p - to) <= 0.1) return t
        }
        return Infinity
      }
      const at60 = () => 1 / 60
      // Deterministic uneven frames around 144 Hz.
      const uneven = (i) => (1 / 144) * (1 + 0.35 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414))
      const up = time90(0, 1, at60)
      const down = time90(1, 0, at60)
      const wantedUp = Math.log(10) / (-Math.log(1 - e.easeUp) * 60)
      const wantedDown = Math.log(10) / (-Math.log(1 - e.easeDown) * 60)
      row('P5', 'Time to cover 90% of a step: up, down (s, 60 Hz)', `${round(up)}, ${round(down)}`,
        `${round(wantedUp)}, ${round(wantedDown)} (+- one frame); down slower`,
        Math.abs(up - wantedUp) < 0.02 && Math.abs(down - wantedDown) < 0.02 && down > up * 1.5)
      const up144 = time90(0, 1, uneven)
      const down144 = time90(1, 0, uneven)
      row('P6', 'The same at uneven 144 Hz: up, down (s)', `${round(up144)}, ${round(down144)}`,
        `${round(wantedUp)}, ${round(wantedDown)} (+- 0.01)`, Math.abs(up144 - wantedUp) < 0.01 && Math.abs(down144 - wantedDown) < 0.01)
    }

    // ---- S: tyre screech ------------------------------------------------------
    if (sections.includes('S') && straight) {
      const s = a.screech
      const launch = (seconds, keys = ['KeyW']) => {
        let count = 0
        let first = null
        let peak = 0
        let t = 0
        for (const code of keys) key('keydown', code)
        drive(seconds, (dt, out) => {
          t += dt
          peak = Math.max(peak, model.accel)
          if (out.screech > 0) {
            count += 1
            first ??= { t, volume: out.screech, rate: out.screechRate, cause: out.cause }
          }
        })
        for (const code of keys) key('keyup', code)
        return { count, first, peak }
      }

      rest(straight)
      model.reset()
      const one = launch(2)
      row('S1', 'Standing start: screeches, cause, time after the throttle (s)',
        `${one.count}, ${one.first?.cause ?? '-'}, ${one.first ? round(one.first.t, 2) : '-'}`, '1, launch, < 0.5',
        one.count === 1 && one.first.cause === 'launch' && one.first.t < 0.5)
      if (one.first) {
        row('S2', 'Its volume and rate are inside the configured ranges', `${round(one.first.volume)}, ${round(one.first.rate)}`,
          `${s.volumeMin}..${s.volumeMax}, ${s.rateMin}..${s.rateMax}`,
          one.first.volume >= s.volumeMin && one.first.volume <= s.volumeMax && one.first.rate >= s.rateMin && one.first.rate <= s.rateMax)
      }

      // Three more hard launches straight away: all inside the cooldown.
      let inside = 0
      let elapsed = 2
      for (let i = 0; i < 3 && elapsed < s.cooldown - 1.2; i++) {
        place(straight)
        drive(0.3)
        inside += launch(0.6).count
        elapsed += 0.9
      }
      row('S3', `Three more hard launches inside the ${s.cooldown} s cooldown: screeches`, inside, '0', inside === 0)

      // Wait the cooldown out, launch again.
      rest(straight)
      drive(s.cooldown)
      const again = launch(1)
      row('S4', 'After the cooldown, a standing start screeches again', again.count, '1', again.count === 1)

      // Lifting off and back on at speed is not a launch, however hard it pulls.
      place(straight, vehicle.topSpeed * 0.5)
      model.reset()
      drive(0.3)
      const reapply = launch(1.2)
      row('S5', 'Throttle re-applied at 50% of the cap: screeches (peak acceleration, m/s²)', `${reapply.count} (${round(reapply.peak, 1)})`,
        '0', reapply.count === 0)

      // A boost start, for the record and as the loudest case.
      rest(straight)
      model.reset()
      const boosted = launch(1.5, ['KeyW', 'ShiftLeft'])
      row('S6', 'Boost start: screeches, volume', `${boosted.count}, ${boosted.first ? round(boosted.first.volume) : '-'}`,
        `1, >= the plain start's (${one.first ? round(one.first.volume) : '-'})`,
        boosted.count === 1 && (!one.first || boosted.first.volume >= one.first.volume - 1e-6))
      notes.push(`S: peak smoothed forward acceleration: standing start ${round(one.peak, 1)} m/s², boost start ${round(boosted.peak, 1)} m/s², re-applied at speed ${round(reapply.peak, 1)} m/s² (threshold ${s.accel}).`)

      // A handbrake slide, held long: one screech, however long it lasts.
      place(pad, vehicle.topSpeed * 0.98)
      model.reset()
      drive(0.2)
      let slides = 0
      let slideCause = null
      let peakSlip = 0
      for (const code of ['KeyW', 'KeyA', 'KeyQ']) key('keydown', code)
      drive(2.5, (dt, out) => {
        peakSlip = Math.max(peakSlip, Math.abs(vehicle.state.lateralSpeed))
        if (out.screech > 0) {
          slides += 1
          slideCause = out.cause
        }
      })
      for (const code of ['KeyW', 'KeyA', 'KeyQ']) key('keyup', code)
      row('S7', 'Handbrake slide held for 2.5 s: screeches, cause (peak sideways speed, m/s)', `${slides}, ${slideCause ?? '-'} (${round(peakSlip, 1)})`,
        '1, handbrake', slides === 1 && slideCause === 'handbrake')
    }

    // ---- I: impact table ------------------------------------------------------
    if (sections.includes('I')) {
      const classes = Object.keys(a.impacts)
      let floorOk = true
      let rangeOk = true
      const detail = []
      for (const name of classes) {
        const r = a.impacts[name]
        const soft = impactDecision(name, r.velocityMin, new Map(), 0)
        const justOver = impactDecision(name, r.velocityMin + 0.01, new Map(), 0)
        const hard = impactDecision(name, r.velocityMin + 100, new Map(), 0)
        if (soft !== null) floorOk = false
        if (!justOver || !hard || Math.abs(justOver.volume - r.volumeMin ** 2) > 1e-6 || Math.abs(hard.volume - r.volumeMax ** 2) > 1e-6) rangeOk = false
        detail.push(`${name} ${round(r.volumeMin ** 2, 2)}-${round(r.volumeMax ** 2, 2)}`)
      }
      row('I1', `A hit at exactly velocityMin is not played (${classes.length} classes)`, floorOk, 'true', floorOk)
      row('I2', 'Volume runs from volumeMin² to volumeMax²', detail.join(', '), 'matches the table', rangeOk)

      // Repeat delay, per class.
      let delayOk = true
      for (const name of classes) {
        const r = a.impacts[name]
        const last = new Map()
        const first = impactDecision(name, 50, last, 1000)
        const tooSoon = impactDecision(name, 50, last, 1000 + r.minDelta - 1)
        const other = impactDecision(name === 'brick' ? 'wood' : 'brick', 50, last, 1000 + 1)
        const later = impactDecision(name, 50, last, 1000 + r.minDelta)
        if (!first || tooSoon !== null || !other || !later) delayOk = false
      }
      row('I3', 'Same class inside its minDelta is dropped; another class is not; at minDelta it plays', delayOk, 'true', delayOk)

      // A wall coming down: 300 brick hits over one second.
      const last = new Map()
      let played = 0
      const rates = []
      for (let i = 0; i < 300; i++) {
        const d = impactDecision('brick', 2 + (i % 7), last, (i * 1000) / 300)
        if (d) {
          played += 1
          rates.push(d.rate)
        }
      }
      const most = Math.ceil(1000 / a.impacts.brick.minDelta)
      row('I4', '300 brick hits in one second: sounds played', played, `<= ${most}`, played <= most && played > 0)

      // Random rate per hit.
      let spreadOk = true
      const spreads = []
      for (const name of classes) {
        const r = a.impacts[name]
        const seen = []
        for (let i = 0; i < 200; i++) seen.push(impactDecision(name, 50, new Map(), 0).rate)
        const lo = Math.min(...seen)
        const hi = Math.max(...seen)
        const distinct = new Set(seen.map((v) => v.toFixed(4))).size
        const covered = (hi - lo) / (r.rateMax - r.rateMin)
        if (lo < r.rateMin || hi > r.rateMax || covered < 0.9 || distinct < 150) spreadOk = false
        spreads.push(`${name} ${round(lo, 2)}-${round(hi, 2)}`)
      }
      row('I5', 'Rate is random per hit, inside rateMin..rateMax, covering at least 90% of it (200 hits each)', spreads.join(', '), 'matches the table', spreadOk)
    }

    // ---- V: voices, clipping, mute ---------------------------------------------
    if (sections.includes('V')) {
      const Offline = window.OfflineAudioContext ?? window.webkitOfflineAudioContext
      if (Offline) {
        // The loudest moment we can build: engine at full progress, boosting and
        // sliding, plus every impact class at full volume, a screech, the horn,
        // a stamp, a finale fanfare and a run of pickups, all at once.
        const seconds = 2.5
        const ctx = new Offline(2, Math.ceil(44100 * seconds), 44100)
        const mixer = createMixer(ctx)
        for (const name of ['master', 'music', 'sfx', 'ambience']) mixer.buses[name].gain.value = name === 'music' || name === 'ambience' ? a.volumes[name] : 1
        const buffers = createNoiseBuffers(ctx)
        const voices = createVoices(() => a.maxVoices)
        const top = vehicle.topSpeed * 2
        const fakeCar = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          topSpeed: vehicle.topSpeed,
          state: { speed: top, forwardSpeed: top, lateralSpeed: 12, airborne: false, boosting: true, forwardAccel: 0, handbrake: false },
        }
        const engine = createEngineSound({ ctx, destination: mixer.buses.sfx, noiseBuffers: buffers, vehicle: fakeCar })
        for (let i = 0; i < 120; i++) engine.update(1 / 60, { throttle: 1, boost: true })
        const handlers = new Map()
        const sounds = createSounds({ ctx, bus: mixer.buses.sfx, noiseBuffers: buffers, voices, vehicle: fakeCar, camera: new THREE.PerspectiveCamera() })
        sounds.listen({ on: (type, fn) => handlers.set(type, [...(handlers.get(type) ?? []), fn]) })
        const emit = (type, payload) => handlers.get(type)?.forEach((fn) => fn(payload))
        let asked = 0
        for (const name of Object.keys(a.impacts)) {
          asked += 1
          sounds.impact({ position: null, sfx: name, strength: 1, speed: 100, withCar: name === 'car', prop: name === 'car' ? null : 'test' })
        }
        asked += 1
        sounds.play((out, at) => engine.screech(out, at, 1), { gain: a.screech.volumeMax ** 2 * a.screech.gain })
        asked += 1
        sounds.horn()
        for (const [type, payload] of [['stamp', {}], ['finale', {}], ['collect', { kind: 'golden', combo: 1 }], ['collect', { kind: 'shuriken', combo: 1 }],
          ['collect', { kind: 'dot', combo: 3 }], ['collect', { kind: 'dot', combo: 4 }], ['dash', { phase: 'finish' }], ['badge', {}], ['rank', {}]]) {
          asked += 1
          emit(type, payload)
        }
        const live = voices.live
        const rendered = await ctx.startRendering()
        let peak = 0
        let over = 0
        for (let c = 0; c < rendered.numberOfChannels; c++) {
          const data = rendered.getChannelData(c)
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs(data[i])
            if (v > peak) peak = v
            if (v >= 1) over += 1
          }
        }
        row('V1', `${asked} one-shots asked for at once: voices playing, dropped`, `${live}, ${voices.stats.dropped}`,
          `${a.maxVoices}, ${asked - a.maxVoices}`, live === a.maxVoices && voices.stats.dropped === asked - a.maxVoices)
        row('V2', 'Offline render of that with the engine at full progress, master and SFX at 100%: peak sample, samples at or over full scale',
          `${round(peak)}, ${over}`, '< 1, 0', peak < 1 && over === 0)
      } else {
        row('V1', 'Offline render', 'OfflineAudioContext not available', '-', false)
      }

      // M toggles (the mute is a preference, so it works before sound is unlocked too).
      const was = audio.muted
      key('keydown', 'KeyM')
      key('keyup', 'KeyM')
      loop.step(1 / 60)
      const flipped = audio.muted
      key('keydown', 'KeyM')
      key('keyup', 'KeyM')
      loop.step(1 / 60)
      row('V3', 'M toggles the mute and back', `${was} -> ${flipped} -> ${audio.muted}`, 'flips twice', flipped === !was && audio.muted === was)

      // Hidden tab: needs the real context.
      const ctx = audio.context
      if (ctx && ctx.state === 'running') {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        const setHidden = (value) => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
          document.dispatchEvent(new Event('visibilitychange'))
        }
        let whileHidden = '-'
        let after = '-'
        try {
          setHidden(true)
          await wait(400)
          whileHidden = ctx.state
          setHidden(false)
          await wait(300)
          after = ctx.state
        } finally {
          delete document.hidden
        }
        row('V4', 'Tab hidden: the audio context suspends; visible again: it runs', `${whileHidden}, ${after}`, 'suspended, running',
          whileHidden === 'suspended' && after === 'running')
      } else {
        row('V4', 'Tab hidden suspends the sound', `no running audio context (${ctx?.state ?? 'locked'}): click Start with a real click first`, 'suspended, running', false)
      }
    }
  } finally {
    for (const code of ['KeyW', 'KeyA', 'KeyQ', 'ShiftLeft']) key('keyup', code)
    post.render = savedRender
    vehicle.respawn(home)
    cameraRig.reset()
    if (restart) loop.start()
  }

  return { passed: rows.length > 0 && rows.every((r) => r.pass), rows, notes }
}
