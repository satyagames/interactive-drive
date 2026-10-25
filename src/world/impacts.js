import * as THREE from 'three'

import { rebuild, settings } from '../config.js'

/**
 * Collision impacts. Prop colliders and the car's body ask Rapier for
 * contact-force events above a per-collider threshold (`dynamicProps.js`,
 * `arcadePhysics.js`); after every physics step this drains them and emits
 *
 *   impact { position, sfx, strength 0..1, withCar, prop }
 *
 * on the game's event bus. `sfx` is the prop's material class (paper, wood,
 * metal, plastic, brick, rubber), or 'metal' for the car scraping a wall.
 * One impact per body per `perBodyMs`, as doc 05 §3 asks of the sounds.
 * `queue` is the EventQueue the stepper passes to `world.step`.
 */
const CAR_MASS = () => rebuild.arcade.chassis.mass

export function createImpacts({ world, queue, props, vehicle, events }) {
  const carColliders = new Set()
  for (let i = 0; i < vehicle.body.numColliders(); i++) carColliders.add(vehicle.body.collider(i).handle)

  const lastByBody = new Map()
  let clock = 0
  // Collected during the drain, resolved after it (contact queries stay out of the callback).
  const pending = []
  const pool = []

  let stepDt = 0
  // Made once, not per drain.
  const collect = (event) => {
    const entry = pool.pop() ?? { h1: 0, h2: 0, impulse: 0 }
    entry.h1 = event.collider1()
    entry.h2 = event.collider2()
    entry.impulse = event.totalForceMagnitude() * stepDt
    pending.push(entry)
  }

  /** Call right after each `world.step(queue)`. */
  function drain(dt) {
    clock += dt
    stepDt = dt
    queue.drainContactForceEvents(collect)
    for (let i = 0; i < pending.length; i++) {
      resolve(pending[i])
      pool.push(pending[i])
    }
    pending.length = 0
  }

  function resolve({ h1, h2, impulse }) {
    const p1 = props.propForCollider(h1)
    const p2 = props.propForCollider(h2)
    const car = carColliders.has(h1) || carColliders.has(h2)
    // The lightest dynamic body involved is the one the impulse moves most.
    let prop = p1 ?? p2
    if (p1 && p2 && p2.mass < p1.mass) prop = p2
    const mass = prop ? prop.mass : CAR_MASS()
    const deltaV = impulse / mass
    const cfg = settings.impacts
    if (deltaV < (prop ? cfg.minDeltaV : cfg.carMinDeltaV)) return

    const subject = prop ? prop.body : vehicle.body
    const last = lastByBody.get(subject.handle) ?? -Infinity
    if ((clock - last) * 1000 < cfg.perBodyMs) return
    lastByBody.set(subject.handle, clock)

    events.emit('impact', {
      position: contactPoint(h1, h2, subject),
      sfx: prop?.sfx ?? 'metal',
      strength: Math.min(deltaV / cfg.fullDeltaV, 1),
      withCar: car,
      prop: prop?.name ?? null,
    })
  }

  function contactPoint(h1, h2, subject) {
    const point = new THREE.Vector3()
    const c1 = world.getCollider(h1)
    const c2 = world.getCollider(h2)
    let found = false
    if (c1 && c2) {
      world.contactPair(c1, c2, (manifold) => {
        if (found || manifold.numSolverContacts() === 0) return
        const p = manifold.solverContactPoint(0)
        point.set(p.x, p.y, p.z)
        found = true
      })
    }
    if (!found) {
      const t = subject.translation()
      point.set(t.x, t.y, t.z)
    }
    return point
  }

  return { drain }
}
