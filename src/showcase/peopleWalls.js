import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createBuilder } from './builder.js'
import { near } from './hotspots.js'
import { createAtlasMaterial, createLabelQuads, createPackedAtlas, drawPlate, quadMatrix } from './labels.js'

/**
 * Team territories: people as architecture (doc 10 §2.3). The gateway of
 * every team territory grows two wings, and the wings carry one name tile
 * per person in the territory's rosters (the `roles` of its stations, the
 * same list the panels show), name over designation, on both faces so they
 * read from either side. Above each tile a small lamp is lit: one light per
 * person, so a team's size reads from across the map.
 *
 * Static and respectful: tiles are part of the wall, never physics props.
 * While a territory's rosters are still `placeholder` (team membership
 * reconstructed from the 2D site, awaiting confirmation -- CLAUDE.md rule
 * 3) the right-hand wing's header says so in amber. A territory with no
 * roster yet shows "Roster coming soon".
 *
 * Draw calls per territory: the merged wings, the tiles, the lamps (3).
 * One packed atlas holds every territory's tiles.
 */
export function createPeopleWalls(ctx) {
  const territories = ctx.seed.territories
  const L = ctx.layout.peopleWall
  if (!L) return null
  let atlas = null
  let material = null
  let lampMaterial = null
  const rects = new Map()

  /** Everyone in a territory's rosters, once each, in roster order. */
  function rosterOf(d) {
    const seen = new Set()
    const people = []
    for (const s of d.stations) {
      for (const r of s.roles ?? []) {
        if (seen.has(r.name)) continue
        seen.add(r.name)
        people.push(r)
      }
    }
    return people
  }

  /** Paint every territory's tiles and headers into one atlas, once. */
  function ensureAtlas() {
    if (atlas) return
    atlas = createPackedAtlas({ width: 2048, height: 2048 })
    // Headers first, then tiles, so the shelves pack tightly.
    const header = (text, colour, ink) => atlas.add(1000, 84, (g, w, h) => drawPlate(g, w, h, { title: text, bg: colour, fg: ink, radius: 14 }))
    for (const d of territories) {
      const team = d.name.split(':')[0].trim()
      const pending = d.stations.some((s) => s.status === 'placeholder')
      rects.set(`${d.id}:left`, header(`${t('showcase.wallTitle')} · ${team}`, '#1A1A1A', '#FFFFFF'))
      rects.set(`${d.id}:right`, pending
        ? header(t('showcase.wallPending'), '#ED8B00', '#1A1A1A')
        : header(d.name, d.color, '#FFFFFF'))
    }
    for (const d of territories) {
      const people = rosterOf(d)
      if (people.length === 0) {
        rects.set(`${d.id}:empty`, atlas.add(600, 116, (g, w, h) => drawPlate(g, w, h, { title: t('showcase.wallEmpty'), bg: '#F4F4F2', fg: '#53565A', accent: d.color })))
      }
      people.forEach((person, i) => {
        rects.set(`${d.id}:${i}`, atlas.add(290, 100, (g, w, h) => drawPlate(g, w, h, {
          title: person.name,
          sub: person.role,
          bg: '#FFFFFF',
          fg: '#1A1A1A',
          accent: d.color,
          radius: 8,
        })))
      })
    }
    material = createAtlasMaterial(atlas.texture)
    // One glowing lamp per person: HDR green, over the bloom threshold.
    lampMaterial = new THREE.MeshBasicMaterial({ fog: true })
    lampMaterial.color.set('#86BC25').multiplyScalar(3.2)
    lampMaterial.name = 'showcase:lamp'
  }

  function build(info) {
    const d = territories.find((x) => x.id === info.id)
    if (!d) return
    ensureAtlas()
    const frame = ctx.frames.get(d.id)
    const people = rosterOf(d)
    const team = d.name.split(':')[0].trim()
    const [tileW, tileH] = L.tile
    const gap = L.gap
    const perWing = Math.ceil(Math.max(people.length, 1) / 2 / L.cols) * L.cols
    const rows = Math.max(Math.ceil(perWing / L.cols), 1)
    const wingW = L.outer - L.inner
    const headerH = 0.4
    const wallH = Math.max(L.height, rows * (tileH + gap) + headerH + 0.5)
    const thick = 0.5
    const yawWorld = frame.yaw(180) // the wings face the approach (local -Z)
    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: `${d.id}:people` })

    const tiles = []
    const lamps = []
    const sides = [-1, 1]
    for (const side of sides) {
      const lx = side * (L.inner + wingW / 2)
      const centre = frame.toWorld(lx, L.lz)
      b.box('ivory', '#F4F4F2', [centre.x, wallH / 2, centre.z], [wingW, wallH, thick], yawWorld, { collide: true })
      b.box('ivory', d.color, [centre.x, wallH + 0.08, centre.z], [wingW + 0.16, 0.16, thick + 0.16], yawWorld)
      // Both faces: front (towards HQ) and back (towards the plaza).
      for (const face of [0, 1]) {
        const faceYaw = yawWorld + face * Math.PI
        const n = { x: Math.sin(faceYaw), z: Math.cos(faceYaw) }
        const out = thick / 2 + 0.012
        // Wing axis: the local +X direction, as seen from this face.
        const ax = { x: Math.cos(faceYaw), z: -Math.sin(faceYaw) }
        const at = (u, y) => [centre.x + ax.x * u + n.x * out, y, centre.z + ax.z * u + n.z * out]
        const headerRect = rects.get(`${d.id}:${(side < 0) === (face === 0) ? 'right' : 'left'}`)
        const hp = at(0, wallH - 0.32)
        tiles.push({ matrix: quadMatrix(hp[0], hp[1], hp[2], faceYaw, wingW - 0.4, headerH), rect: headerRect })
        // This wing's share of the roster: the wing on your left as you
        // arrive from HQ (local +X) takes the first half.
        const first = side > 0 ? 0 : perWing
        const mine = people.slice(first, first + perWing)
        if (people.length === 0 && side > 0) {
          const p = at(0, wallH - 0.32 - headerH - 0.5)
          tiles.push({ matrix: quadMatrix(p[0], p[1], p[2], faceYaw, 2.4, 0.46), rect: rects.get(`${d.id}:empty`) })
        }
        mine.forEach((person, k) => {
          const col = k % L.cols
          const row = Math.floor(k / L.cols)
          // `ax` is this face's own left-to-right, so both faces read normally.
          const u = (col - (L.cols - 1) / 2) * (tileW + gap)
          const y = wallH - 0.32 - headerH / 2 - 0.12 - (row + 0.5) * (tileH + gap)
          const p = at(u, y)
          tiles.push({ matrix: quadMatrix(p[0], p[1], p[2], faceYaw, tileW, tileH), rect: rects.get(`${d.id}:${first + k}`) })
          if (face === 0) {
            // A string of lights along the wing's top: one per person.
            const span = wingW - 0.7
            const lu = mine.length > 1 ? -span / 2 + (span * k) / (mine.length - 1) : 0
            const lp = at(lu, wallH + 0.26)
            lamps.push(new THREE.Matrix4().compose(
              new THREE.Vector3(lp[0] - n.x * out, lp[1], lp[2] - n.z * out),
              new THREE.Quaternion().setFromAxisAngle(UP, faceYaw),
              new THREE.Vector3(0.18, 0.18, 0.18),
            ))
          }
        })
      }
      // Enter at either wing opens the team's roster.
      const rosterStation = d.stations.find((s) => s.roles?.length) ?? d.stations[0]
      ctx.hotspots.add({
        test: near(frame.toWorld(lx, L.lz - 2.2), settings.showcase.hotspotRadius - 1),
        label: () => t('showcase.openWall', { team }),
        open: () => ctx.openStation(rosterStation.id),
      })
    }
    for (const mesh of b.finish()) info.staticGroup.add(mesh)
    info.staticGroup.add(createLabelQuads({ items: tiles, material, name: `${d.id}:people:tiles` }))
    if (lamps.length) {
      const lampMesh = new THREE.InstancedMesh(LAMP, lampMaterial, lamps.length)
      lampMesh.name = `${d.id}:people:lamps`
      lamps.forEach((matrix, i) => lampMesh.setMatrixAt(i, matrix))
      lampMesh.computeBoundingSphere()
      info.staticGroup.add(lampMesh)
    }
  }

  return {
    name: 'peopleWalls',
    districts: territories.map((d) => d.id),
    build,
  }
}

const UP = new THREE.Vector3(0, 1, 0)
const LAMP = new THREE.BoxGeometry(1, 1, 1)
