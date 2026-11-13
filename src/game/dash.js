import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Deadline Dash, the time trial (doc 03 §2.4).
 *
 *   start   opening the RFP Gate's "Deadline Dash" pad -> 3-2-1 (car held)
 *   chain   picked at random each run:
 *             Qualify  a team territory's gateway
 *             Write    the Toolkit Depot or the Studio gateway
 *             Review   another territory's gateway
 *             Submit   the Submission Portal at HQ
 *   penalty +collisionPenaltySec per heavy collision ("scope creep")
 *   finish  medal from the seed's thresholds, personal best saved,
 *           gold -> "Deadline Hero"
 *
 * Checkpoint positions come from the world (`trigger_stamp_<id>`,
 * `area_hq_submission_portal`), so they follow the generated layout.
 */
export function createDash({ seed, gameWorld, events, progression, store }) {
  const cfg = seed.gamification.deadlineDash
  const territories = seed.territories.map((d) => d.id)
  let run = null
  let lastSpeed = 0
  let penaltyCooldown = 0

  function gatewayPoint(district) {
    const trigger = gameWorld.triggers.find((t) => t.name === `trigger_stamp_${district}`)
    return trigger ? trigger.position.clone() : null
  }

  function portalPoint() {
    const area = gameWorld.areas.find((a) => a.id === 'hq_submission_portal')
    return area ? area.position.clone() : new THREE.Vector3(0, 0, 13)
  }

  function pick(list, not = []) {
    const options = list.filter((x) => !not.includes(x))
    return options[Math.floor(Math.random() * options.length)]
  }

  function buildChain() {
    const qualify = pick(territories)
    const write = pick(['toolkit', 'studio'], [qualify])
    const review = pick(territories, [qualify, write])
    return [
      { step: 'qualify', district: qualify, position: gatewayPoint(qualify) },
      { step: 'write', district: write, position: gatewayPoint(write) },
      { step: 'review', district: review, position: gatewayPoint(review) },
      { step: 'submit', district: 'hq', position: portalPoint() },
    ]
  }

  function start() {
    if (run) return false
    run = { phase: 'countdown', count: settings.game.dash.countdown, time: 0, penalty: 0, steps: buildChain(), index: 0 }
    events.emit('dash', { phase: 'countdown', count: run.count })
    return true
  }

  function cancel(reason = 'cancelled') {
    if (!run) return
    events.emit('dash', { phase: 'cancel', reason })
    run = null
  }

  function finish() {
    const total = run.time + run.penalty
    const medal = total < cfg.medals.gold ? 'gold' : total < cfg.medals.silver ? 'silver' : total < cfg.medals.bronze ? 'bronze' : null
    const best = store.state.best.dash
    const personalBest = best === undefined || total < best
    if (personalBest) {
      store.state.best.dash = total
      store.save()
    }
    events.emit('dash', {
      phase: 'finish', time: total, penalty: run.penalty, medal, personalBest,
      margin: cfg.medals.bronze - total,
    })
    if (medal === 'gold') progression.awardBadge('deadline_hero')
    run = null
  }

  /** Per frame. Returns { hold } -- true during the countdown. */
  function update(dt, vehicle) {
    const speed = vehicle.state.speed
    const drop = lastSpeed - speed
    lastSpeed = speed
    penaltyCooldown = Math.max(penaltyCooldown - dt, 0)
    if (!run) return { hold: false }

    if (run.phase === 'countdown') {
      const before = Math.ceil(run.count)
      run.count -= dt
      const after = Math.ceil(run.count)
      if (after !== before && after > 0) events.emit('dash', { phase: 'countdown', count: after })
      if (run.count <= 0) {
        run.phase = 'running'
        events.emit('dash', { phase: 'start', next: run.steps[0] })
      }
      return { hold: true }
    }

    run.time += dt
    const d = settings.game.dash
    // Scope creep: a sudden loss of speed that braking alone wouldn't cause.
    if (drop > d.penaltySpeedDrop && !vehicle.state.braking && penaltyCooldown === 0) {
      run.penalty += cfg.collisionPenaltySec
      penaltyCooldown = d.penaltyCooldown
      events.emit('dash', { phase: 'penalty', seconds: cfg.collisionPenaltySec, total: run.penalty })
    }

    const step = run.steps[run.index]
    if (step.position && Math.hypot(vehicle.position.x - step.position.x, vehicle.position.z - step.position.z) < d.checkpointRadius) {
      run.index += 1
      if (run.index >= run.steps.length) {
        finish()
        return { hold: false }
      }
      events.emit('dash', { phase: 'checkpoint', done: step, next: run.steps[run.index], index: run.index })
    }
    if (run.time > cfg.medals.bronze * d.timeoutFactor) cancel('timeout')
    return { hold: false }
  }

  return {
    start,
    cancel,
    update,
    get state() {
      if (!run) return null
      const step = run.steps[run.index]
      return {
        phase: run.phase, count: run.count, time: run.time, penalty: run.penalty,
        step: step.step, district: step.district, target: step.position, index: run.index, total: run.steps.length,
      }
    },
    get best() {
      return store.state.best.dash ?? null
    },
  }
}
