import { rebuild } from '../config.js'
import { arcadeGravity, createArcadePhysics } from '../vehicle/arcadePhysics.js'

/**
 * Automated feel check for the 'arcade2019' preset against
 * docs/pursuit-arena/07-feel-targets.md.
 *
 * Builds its own throwaway Rapier world (a flat floor, nothing else) so it
 * never disturbs the running game, scripts the same manoeuvres the reference
 * was measured with, and returns one row per target. Runs in the browser
 * (debug panel, `#debug` only) and under Node (`npm run probe:feel`).
 *
 * Targets are the doc 07 "Ours" column: reference values x worldScale for
 * lengths and speeds, unchanged for times and rates.
 */

const DT = 1 / 60
const TOLERANCE = 0.1

/** [id, label, reference value, unit, scales with worldScale?, tolerance] */
const TARGETS = [
  ['V1', 'top speed, throttle', 9.93, 'speed', true],
  ['V2t', '0 -> 90% cap, time', 0.65, 's', false],
  ['V2d', '0 -> 90% cap, distance', 2.94, 'len', true],
  ['V3t', '0 -> 99% cap, time', 0.72, 's', false],
  ['V4', 'top speed, boost', 19.53, 'speed', true],
  ['V5t', '0 -> 90% boost cap, time', 0.75, 's', false],
  ['V5d', '0 -> 90% boost cap, distance', 6.83, 'len', true],
  ['V6t', 'brake from V1, time', 1.12, 's', false],
  ['V6d', 'brake from V1, distance', 5.33, 'len', true],
  ['V7t', 'brake from V4, time', 2.1, 's', false],
  ['V7d', 'brake from V4, distance', 18.7, 'len', true],
  ['V8h', 'coast from V1, half-speed time', 4.33, 's', false, 0.15],
  ['V8d', 'coast from V1, distance', 60.6, 'len', true, 0.15],
  ['V9', 'reverse top speed', 9.74, 'speed', true],
  ['V11', 'full-lock radius @ 50% cap', 2.06, 'len', true],
  ['V12', 'full-lock radius @ cap', 2.17, 'len', true],
  ['V13', 'full-lock radius @ boost cap', 9.22, 'len', true, 0.2],
  ['V14', 'horn hop airtime', 0.52, 's', false],
  ['V16', 'ride height at rest', 0.284, 'len', true],
]

const NO_INPUT = { throttle: 0, steer: 0, brake: false, boost: false, handbrake: false }

export function runFeelProbe({ RAPIER }) {
  const s = rebuild.worldScale
  const measured = {}
  const sanity = []

  function makeCar() {
    const world = new RAPIER.World(arcadeGravity())
    world.timestep = DT
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0).setFriction(0),
    )
    const car = createArcadePhysics({
      world, RAPIER, position: { x: 0, y: 1.2 * s, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    const step = (input) => {
      car.update(DT, { ...NO_INPUT, ...input })
      world.step()
    }
    for (let i = 0; i < 180; i++) step(NO_INPUT)
    car.readBodyState()
    return { world, car, step }
  }

  const position = (car) => {
    const t = car.body.translation()
    return { x: t.x, y: t.y, z: t.z }
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
  const planarSpeed = (car) => Math.hypot(car.velocity.x, car.velocity.z)
  const yaw = (car) => Math.atan2(-car.forward.x, -car.forward.z)

  // Rest + sanity: throttle moves the nose first (-Z), left steer turns left.
  {
    const { car, step } = makeCar()
    measured.V16 = position(car).y
    const start = position(car)
    for (let i = 0; i < 30; i++) step({ throttle: 1 })
    const end = position(car)
    sanity.push(['forward input moves towards -Z (nose first)', end.z < start.z - 0.1])
    const y0 = yaw(car)
    for (let i = 0; i < 30; i++) step({ throttle: 1, steer: 1 })
    sanity.push(['steer +1 (left) yaws left', yaw(car) > y0 + 0.05])
  }

  for (const boost of [false, true]) {
    const { car, step } = makeCar()
    const cap = (boost ? 19.41 : 9.706) * s
    const start = position(car)
    let t = 0
    for (let i = 0; i < 600; i++) {
      step({ throttle: 1, boost })
      t += DT
      const v = planarSpeed(car)
      const key = boost ? 'V5' : 'V2'
      if (measured[`${key}t`] === undefined && v >= 0.9 * cap) {
        measured[`${key}t`] = t
        measured[`${key}d`] = distance(start, position(car))
      }
      if (!boost && measured.V3t === undefined && v >= 0.99 * cap) measured.V3t = t
    }
    measured[boost ? 'V4' : 'V1'] = planarSpeed(car)

    const brakeStart = position(car)
    let bt = 0
    while (planarSpeed(car) > 0.05 * s && bt < 20) {
      step({ brake: true })
      bt += DT
    }
    measured[boost ? 'V7t' : 'V6t'] = bt
    measured[boost ? 'V7d' : 'V6d'] = distance(brakeStart, position(car))
  }

  {
    const { car, step } = makeCar()
    for (let i = 0; i < 300; i++) step({ throttle: 1 })
    const v0 = planarSpeed(car)
    const start = position(car)
    let t = 0
    while (planarSpeed(car) > 0.05 * s && t < 60) {
      step(NO_INPUT)
      t += DT
      if (measured.V8h === undefined && planarSpeed(car) < v0 / 2) measured.V8h = t
    }
    measured.V8d = distance(start, position(car))
  }

  {
    const { car, step } = makeCar()
    for (let i = 0; i < 300; i++) step({ throttle: -1 })
    measured.V9 = planarSpeed(car)
  }

  for (const [id, fraction, boost] of [['V11', 0.5, false], ['V12', 1, false], ['V13', 1, true]]) {
    const { car, step } = makeCar()
    const cap = (boost ? 19.41 : 9.706) * s * fraction
    const governed = (extra) => ({ throttle: car.state.speed < cap ? 1 : 0, boost, ...extra })
    for (let i = 0; i < 240; i++) step(governed())
    let previous = yaw(car)
    let turned = 0
    let speedSum = 0
    let samples = 0
    for (let i = 0; i < 240; i++) {
      step(governed({ steer: -1 }))
      const current = yaw(car)
      if (i >= 60) {
        let d = current - previous
        if (d > Math.PI) d -= 2 * Math.PI
        if (d < -Math.PI) d += 2 * Math.PI
        turned += d
        speedSum += planarSpeed(car)
        samples += 1
      }
      previous = current
    }
    const omega = Math.abs(turned) / (samples * DT)
    measured[id] = speedSum / samples / omega
  }

  {
    const { car, step } = makeCar()
    car.hop()
    let air = 0
    let left = false
    for (let i = 0; i < 240; i++) {
      step(NO_INPUT)
      if (car.state.airborne) {
        left = true
        air += DT
      } else if (left) break
    }
    measured.V14 = air
  }

  const rows = TARGETS.map(([id, label, reference, unit, scales, tolerance = TOLERANCE]) => {
    const target = scales ? reference * s : reference
    const value = measured[id]
    const error = value === undefined ? Infinity : (value - target) / target
    return {
      id,
      target: label,
      expected: round(target),
      measured: value === undefined ? 'n/a' : round(value),
      unit: unit === 'speed' ? 'm/s' : unit === 'len' ? 'm' : unit,
      error: Number.isFinite(error) ? `${(error * 100).toFixed(1)}%` : 'n/a',
      pass: Math.abs(error) <= tolerance,
    }
  })

  return {
    rows,
    sanity,
    passed: rows.every((row) => row.pass) && sanity.every(([, ok]) => ok),
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
