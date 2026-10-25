import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * The district mini-games (doc 02 §3.3-3.4, doc 03 §2.5), each watching
 * real props and the car -- nothing is scripted:
 *
 *   Chart Stack    (Audit)       knock every bar-chart block over   -> variance_found
 *   Coin Run       (Tax)         knock every coin within 20 s       -> coin_collector
 *   Idea Spark     (Consulting)  hit all five hanging bulbs         -> bright_idea
 *   Pace Lap       (PACE)        a timed lap of the oval, ghosted   -> pole_position
 *   Paint Trail    (Studio)      60 s of driving in the Studio      -> paint skin
 *   Bridge Run     (Catalyst)    jump the gap onto the far deck     -> across_time_zones
 *   Strike a Win   (R&R)         all ten pins down                  -> bright_strike
 *   Red Tape Wall  (Toolkit)     smash through half the wall        -> red_tape_cutter
 *
 * (The Ninja Dojo's shuriken hunt lives in collectibles.js.) Coin Run is
 * scored on the twelve coins the Tax playground has (doc 03 asks for 25 in a
 * lane; the generated playground is a coin stack -- see CHANGELOG Phase 6).
 *
 * District geometry is recomputed the way blender/scripts/gen_district.py
 * lays it out (local -Z towards HQ), so the checks follow the generated arena.
 */

const KNOCKED_DISTANCE = 0.8
const KNOCKED_TILT = Math.cos(THREE.MathUtils.degToRad(40))
const BULB_HIT = 0.3
const POLL = 0.25

export function createMinigames({ seed, gameWorld, events, progression, store, scene }) {
  const districts = Object.fromEntries([...seed.territories, ...seed.pillars].map((d) => [d.id, d]))
  const up = new THREE.Vector3()
  const q = new THREE.Quaternion()
  let pollClock = 0

  const frameOf = (id, radius) => {
    const d = districts[id]
    const x = d.position[0]
    const z = d.position[2]
    const yaw = Math.atan2(x, z)
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return {
      radius,
      toWorld: (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }),
      toLocal: (wx, wz) => {
        const dx = wx - x
        const dz = wz - z
        return { x: dx * c - dz * s, z: dx * s + dz * c }
      },
      centre: { x, z },
    }
  }

  const propsOf = (district, type) => gameWorld.props.props.filter((p) => p.district === district && p.type === type)
  /**
   * A game only counts once its props are in play: while a district reveals,
   * its props ride a kinematic path from 8 m up, and "far from home" then
   * means "still falling in", not "knocked over".
   */
  const inPlay = (list) => list.length > 0 && list.every((p) => !p.body.isKinematic())

  function knocked(prop) {
    const t = prop.body.translation()
    const r = prop.body.rotation()
    q.set(r.x, r.y, r.z, r.w)
    up.set(0, 1, 0).applyQuaternion(q)
    const homeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(prop.home.quaternion)
    return Math.hypot(t.x - prop.home.position.x, t.y - prop.home.position.y, t.z - prop.home.position.z) > KNOCKED_DISTANCE ||
      up.dot(homeUp) < KNOCKED_TILT
  }

  function displacedBy(prop, metres) {
    const t = prop.body.translation()
    const h = prop.home.position
    return Math.hypot(t.x - h.x, t.y - h.y, t.z - h.z) > metres
  }

  function resetProps(list) {
    for (const p of list) {
      const h = p.home.position
      p.body.setTranslation({ x: h.x, y: h.y, z: h.z }, true)
      p.body.setRotation(p.home.quaternion, true)
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      p.body.sleep()
      p.awake = true
    }
  }

  const done = (badge) => Boolean(store.state.badges[badge])

  // ---- prop-knocking games -------------------------------------------------

  const coinRun = { started: null, failed: false }
  const bulbsLit = new Set()

  function pollProps(clock) {
    if (!done('variance_found')) {
      const blocks = propsOf('audit', 'barblock')
      if (inPlay(blocks) && blocks.every(knocked)) finish('chart_stack', 'variance_found')
    }

    if (!done('coin_collector')) {
      const coins = propsOf('tax', 'coin')
      const down = inPlay(coins) ? coins.filter(knocked).length : 0
      if (down > 0 && coinRun.started === null) {
        coinRun.started = clock
        events.emit('minigame', { id: 'coin_run', phase: 'start', seconds: settings.game.coinRunSeconds })
      }
      if (coinRun.started !== null) {
        if (coins.length && down === coins.length) finish('coin_run', 'coin_collector', { time: clock - coinRun.started })
        else if (clock - coinRun.started > settings.game.coinRunSeconds) {
          events.emit('minigame', { id: 'coin_run', phase: 'fail', got: down, of: coins.length })
          resetProps(coins)
          coinRun.started = null
        }
      }
    }

    if (!done('bright_idea')) {
      const bulbs = propsOf('consulting', 'bulb')
      for (const bulb of inPlay(bulbs) ? bulbs : []) {
        if (!bulbsLit.has(bulb.name) && displacedBy(bulb, BULB_HIT)) {
          bulbsLit.add(bulb.name)
          events.emit('minigame', { id: 'idea_spark', phase: 'progress', lit: bulbsLit.size, of: 5, prop: bulb.name })
        }
      }
      if (bulbsLit.size >= propsOf('consulting', 'bulb').length && bulbsLit.size > 0) finish('idea_spark', 'bright_idea')
    }

    if (!done('bright_strike')) {
      const pins = propsOf('rnr', 'pin')
      if (inPlay(pins) && pins.every(knocked)) {
        events.emit('minigame', { id: 'strike_a_win', phase: 'confetti' })
        finish('strike_a_win', 'bright_strike')
      }
    }

    if (!done('red_tape_cutter')) {
      const bricks = propsOf('toolkit', 'brick')
      if (inPlay(bricks) && bricks.filter(knocked).length >= bricks.length / 2) finish('red_tape_wall', 'red_tape_cutter')
    }
  }

  function finish(id, badge, extra = {}) {
    events.emit('minigame', { id, phase: 'complete', badge, ...extra })
    progression.awardBadge(badge)
  }

  // ---- Pace Lap (with a ghost of the best lap) ------------------------------

  const pace = frameOf('pace', 15)
  const ovalCentre = pace.toWorld(0, 15 * 0.45)
  const lap = { inside: false, angle: 0, last: 0, time: 0, samples: [] }
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 3.0),
    new THREE.MeshBasicMaterial({ color: 0x86bc25, transparent: true, opacity: 0.35, depthWrite: false }),
  )
  ghost.name = 'pace-ghost'
  ghost.visible = false
  scene.add(ghost)
  let ghostPath = null
  let ghostTime = 0

  function updatePace(dt, car) {
    const dx = car.position.x - ovalCentre.x
    const dz = car.position.z - ovalCentre.z
    const r = Math.hypot(dx, dz)
    const onTrack = r > 3.0 && r < 9.5
    const angle = Math.atan2(dx, dz)
    if (onTrack && !lap.inside) {
      Object.assign(lap, { inside: true, angle: 0, last: angle, time: 0, samples: [] })
      ghostTime = 0
      ghost.visible = Boolean(ghostPath)
    } else if (!onTrack && lap.inside) {
      lap.inside = false
      ghost.visible = false
    }
    if (!lap.inside) return
    let delta = angle - lap.last
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    lap.angle += delta
    lap.last = angle
    lap.time += dt
    lap.samples.push({ t: lap.time, x: car.position.x, z: car.position.z, yaw: Math.atan2(-car.velocity.x, -car.velocity.z) })
    if (ghostPath) {
      ghostTime += dt
      const sample = ghostPath.find((s) => s.t >= ghostTime) ?? ghostPath[ghostPath.length - 1]
      ghost.position.set(sample.x, 0.6, sample.z)
      ghost.rotation.y = sample.yaw
    }
    if (Math.abs(lap.angle) >= Math.PI * 2) {
      const best = store.state.best.paceLap
      const personalBest = best === undefined || lap.time < best
      if (personalBest) {
        store.state.best.paceLap = lap.time
        store.save()
        ghostPath = lap.samples
      }
      events.emit('minigame', { id: 'pace_lap', phase: 'lap', time: lap.time, personalBest })
      progression.awardBadge('pole_position')
      Object.assign(lap, { angle: 0, time: 0, samples: [] })
      ghostTime = 0
      ghost.visible = Boolean(ghostPath)
    }
  }

  // ---- Bridge Run --------------------------------------------------------------

  const catalyst = frameOf('catalyst', 15)
  const bridge = { lz: 15 + 2.5, gap: 4.0, farDeck: [2.0, 5.0], farHeight: 1.5 }
  let overGap = false

  function updateBridge(car) {
    if (done('across_time_zones')) return
    const local = catalyst.toLocal(car.position.x, car.position.z)
    const onBridgeLine = Math.abs(local.z - bridge.lz) < 2.6
    if (onBridgeLine && Math.abs(local.x) < bridge.gap / 2 && car.state.airborne && car.position.y > 1.0) overGap = true
    if (!onBridgeLine) overGap = false
    const landedFar = onBridgeLine && local.x > bridge.farDeck[0] && local.x < bridge.farDeck[1] &&
      !car.state.airborne && car.position.y > bridge.farHeight - 0.2
    if (overGap && landedFar) finish('bridge_run', 'across_time_zones')
  }

  // ---- Paint Trail -------------------------------------------------------------

  const studio = frameOf('studio', 15)
  function updatePaint(dt, car) {
    if (store.state.skins.paint) return
    const inside = Math.hypot(car.position.x - studio.centre.x, car.position.z - studio.centre.z) < 15
    if (!inside || car.state.speed < 3) return
    const c = store.state.counters
    c.paintSeconds = (c.paintSeconds ?? 0) + dt
    store.save()
    if (c.paintSeconds >= settings.game.paintSeconds) {
      events.emit('minigame', { id: 'paint_trail', phase: 'complete' })
      progression.unlockSkin('paint')
    }
  }

  function update(dt, car, clock) {
    pollClock += dt
    if (pollClock >= POLL) {
      pollClock = 0
      pollProps(clock)
    }
    updatePace(dt, car)
    updateBridge(car)
    updatePaint(dt, car)
  }

  return {
    update,
    get paintSeconds() {
      return store.state.counters.paintSeconds ?? 0
    },
    /** Exposed for the debug badge test. */
    geometry: { ovalCentre, catalyst, bridge },
    knocked,
  }
}
