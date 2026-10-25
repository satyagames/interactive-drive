import * as THREE from 'three'

import { t } from '../content/ui.js'

/**
 * Compass / minimap (doc 05 §5, bottom right): the whole arena in a circle,
 * turned so "up" is where the camera looks. District markers in their
 * colours (solid once stamped), HQ as a square, the car as an arrow, and the
 * next objective as a pulsing diamond -- the Deadline Dash checkpoint while a
 * run is on, otherwise the nearest unstamped district.
 *
 * The objective is also written out under the map and in the map's
 * accessible name ("Next stamp: Tax, 52 m"), refreshed twice a second.
 */
const NS = 'http://www.w3.org/2000/svg'
const RADIUS = 54 // svg units, inside the -60..60 box
const WORLD_RADIUS = 118 // m: the outer districts sit at ~105 m

export function createMinimap({ root, seed, game, camera, vehicle }) {
  const svg = root.querySelector('svg')
  const caption = root.querySelector('figcaption')
  const scale = RADIUS / WORLD_RADIUS
  const el = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    parent.append(node)
    return node
  }

  el('circle', { class: 'map__disc', r: RADIUS + 4 }, svg)
  const world = el('g', {}, svg)
  // Rings: the inner district ring and the outer ring.
  el('circle', { class: 'map__ring', r: 62 * scale }, world)
  el('circle', { class: 'map__ring', r: 105 * scale }, world)
  const north = el('text', { class: 'map__north', x: 0, y: -(RADIUS - 4), 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, world)
  north.textContent = 'N'
  el('rect', { class: 'map__hq', x: -4, y: -4, width: 8, height: 8, rx: 1.5 }, world)

  const districts = [...seed.territories, ...seed.pillars].map((d) => {
    const marker = el('circle', {
      class: 'map__district',
      cx: d.position[0] * scale,
      cy: d.position[2] * scale,
      r: 4.2,
      stroke: d.color,
    }, world)
    return { id: d.id, name: d.name, x: d.position[0], z: d.position[2], marker, color: d.color }
  })

  const objective = el('path', { class: 'map__objective', d: 'M0 -5 L5 0 L0 5 L-5 0 Z' }, world)
  const car = el('path', { class: 'map__car', d: 'M0 -5 L3.6 4 L0 2 L-3.6 4 Z' }, world)

  const forward = new THREE.Vector3()
  let clock = 0
  let captionClock = Infinity
  let lastText = ''

  function stampedIds() {
    return new Set(game.progression.stamps.filter((s) => s.stamped).map((s) => s.id))
  }

  function syncStamps() {
    const stamped = stampedIds()
    for (const d of districts) d.marker.style.fill = stamped.has(d.id) ? d.color : 'transparent'
  }
  syncStamps()
  game.events.on('stamp', syncStamps)
  game.events.on('reset', syncStamps)

  /** The current objective: { name, x, z } or null. */
  function currentObjective() {
    const dash = game.dash.state
    if (dash?.phase === 'running' && dash.target) {
      const district = districts.find((d) => d.id === dash.district)
      return { name: district?.name ?? t('dash.hq'), x: dash.target.x, z: dash.target.z, dash: true }
    }
    const stamped = stampedIds()
    let best = null
    let bestD = Infinity
    for (const d of districts) {
      if (stamped.has(d.id)) continue
      const distance = Math.hypot(d.x - vehicle.position.x, d.z - vehicle.position.z)
      if (distance < bestD) {
        best = d
        bestD = distance
      }
    }
    return best
  }

  function update(dt) {
    clock += dt
    // Turn the map so the camera's ground-forward points up.
    camera.getWorldDirection(forward)
    const yaw = Math.atan2(forward.x, -forward.z)
    world.setAttribute('transform', `rotate(${(-yaw * 180) / Math.PI})`)
    const p = vehicle.position
    const q = vehicle.quaternion
    forward.set(0, 0, -1).applyQuaternion(q)
    const heading = Math.atan2(forward.x, -forward.z)
    car.setAttribute('transform', `translate(${clamp(p.x * scale)} ${clamp(p.z * scale)}) rotate(${(heading * 180) / Math.PI})`)

    captionClock += dt
    if (captionClock < 0.5) return
    captionClock = 0
    const goal = currentObjective()
    let text
    if (goal) {
      objective.style.display = ''
      objective.setAttribute('transform', `translate(${goal.x * scale} ${goal.z * scale})`)
      const m = Math.round(Math.hypot(goal.x - p.x, goal.z - p.z))
      text = t(goal.dash ? 'hud.objectiveDash' : 'hud.objective', { place: goal.name, m })
    } else {
      objective.style.display = 'none'
      text = t('hud.objectiveDone')
    }
    if (text !== lastText) {
      lastText = text
      caption.textContent = text
      svg.setAttribute('aria-label', t('hud.mapLabel', { objective: text }))
    }
  }

  // The car marker stays on the disc even off the edge of the arena.
  function clamp(v) {
    return Math.max(-RADIUS, Math.min(RADIUS, v))
  }

  return { update }
}
