import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Collectibles (doc 03 §2.3): 100 green dots, 10 golden Decade Dots, 8
 * Proposal Ninja shuriken, placed by `collect_<kind>_<n>` empties and drawn
 * as kit instances (`world.js`).
 *
 *   - every one bobs and spins in place;
 *   - within `magnet` m of the car it flies to it, then counts;
 *   - dots chain into a combo (each within `comboWindow` s of the last);
 *   - picked ones stay gone across reloads (store.collected).
 *
 * Completion: all 10 golden -> "Decade Historian"; all 8 shuriken ->
 * "Proposal Ninja" + the ninja skin.
 */
export function createCollectibles({ gameWorld, store, events, progression, seed }) {
  const g = seed.gamification
  const xpFor = { dot: g.xp.dot, golden: g.xp.goldenDot, shuriken: g.xp.shuriken }
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  const up = new THREE.Vector3(0, 1, 0)

  const flying = new Map()   // id -> { t }
  let clock = 0
  let combo = 0
  let lastDot = -Infinity

  /** Hide what's already collected (call as districts load). */
  function sync() {
    for (const c of gameWorld.collectibles) {
      if (store.state.collected[c.id] && c.mesh) {
        c.mesh.setMatrixAt(c.index, zero)
        c.mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  /**
   * Counted from the saved record (ids are `collect_<kind>_...`), not from
   * what's loaded -- outer-ring districts stream in after the first frame.
   */
  function counts() {
    const got = { dot: 0, golden: 0, shuriken: 0 }
    for (const id of Object.keys(store.state.collected)) {
      const kind = id.split('_')[1]
      if (kind in got) got[kind] += 1
    }
    return { got, expected: g.collectibles }
  }

  function collect(c) {
    store.state.collected[c.id] = true
    store.save()
    if (c.mesh) {
      c.mesh.setMatrixAt(c.index, zero)
      c.mesh.instanceMatrix.needsUpdate = true
    }
    if (c.kind === 'dot') {
      combo = clock - lastDot <= settings.collectibles.comboWindow ? combo + 1 : 1
      lastDot = clock
    }
    events.emit('collect', { kind: c.kind, id: c.id, combo: c.kind === 'dot' ? combo : 0, position: c.position.clone() })
    progression.addXp(xpFor[c.kind] ?? 0, `collect:${c.kind}`)
    const n = counts()
    if (c.kind === 'golden' && n.got.golden >= g.collectibles.golden) progression.awardBadge('decade_historian')
    if (c.kind === 'shuriken' && n.got.shuriken >= g.collectibles.shuriken) {
      progression.awardBadge('proposal_ninja')
      progression.unlockSkin('ninja')
    }
  }

  /** Per frame: animate visible pickups, pull nearby ones in, count arrivals. */
  function update(dt, carPosition) {
    const c = settings.collectibles
    clock += dt
    const touched = new Set()
    for (const item of gameWorld.collectibles) {
      // Skip collected ones and those in a district that hasn't revealed yet.
      if (store.state.collected[item.id] || !item.mesh || !item.mesh.parent?.visible) continue
      const flight = flying.get(item.id)
      const distance = item.position.distanceTo(carPosition)
      if (!flight && distance < c.magnet) flying.set(item.id, { t: 0 })

      const spin = clock * c.spinSpeed + item.index
      quat.setFromAxisAngle(up, spin)
      pos.copy(item.position)
      pos.y += Math.sin(clock * 2.4 + item.index) * c.bob
      if (flight) {
        flight.t += dt / c.flyTime
        pos.lerp(carPosition, Math.min(flight.t, 1))
        if (flight.t >= 1) {
          flying.delete(item.id)
          collect(item)
          touched.add(item.mesh)
          continue
        }
      }
      item.mesh.setMatrixAt(item.index, matrix.compose(pos, quat, one))
      touched.add(item.mesh)
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true
  }

  return {
    update,
    sync,
    counts,
    /** Debug / tests: collect by id as if driven into. */
    collectById(id) {
      const c = gameWorld.collectibles.find((x) => x.id === id)
      if (c && !store.state.collected[c.id]) collect(c)
    },
  }
}
