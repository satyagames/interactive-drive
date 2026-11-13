import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createMatcapMaterial } from '../render/materials.js'
import { createBuilder } from './builder.js'
import { near } from './hotspots.js'
import { createAtlasMaterial, createLabelQuads, createPackedAtlas, drawPlate, floorMatrix, quadMatrix, viewYaw } from './labels.js'

/**
 * R&R Arena (doc 10 §2.5).
 *
 * Thank It Forward: one physics trophy per award, standing in a glass tray
 * per award type -- `exhibits.thankItForward.awards` (Spot 72, Applause 41,
 * Outstanding 4 today), so the counts are something you can touch. They are
 * ordinary dynamic props (`world/dynamicProps.js`): they start asleep, sleep
 * again when still, cast blob shadows, clink as metal and drop in with the
 * district reveal. Each one knocked over (moved `trophyKnockDistance` or
 * tipped past 50°) counts once, for good, towards the "Spot On" badge.
 *
 * BrightStar: a star sculpture per award category on a pole whose height,
 * and star size, grow with the category's count (`exhibits.brightStar`);
 * the stars turn slowly. A plate on each pole names it.
 *
 * Trays and floor labels have no colliders: you drive straight in.
 */
export function createRnr(ctx) {
  const tif = ctx.exhibits?.thankItForward
  const stars = ctx.exhibits?.brightStar
  if (!tif && !stars) return null
  const L = ctx.layout.rnr
  const district = tif?.district ?? stars.district

  const trophies = []
  let starMesh = null
  const starBase = []
  let clock = 0
  let checkTimer = 0

  const SPECS = {
    // Height, cup radius, matcap, tint -- by order of prestige in the data
    // (the smallest count gets the grandest trophy).
    grand: { h: 0.95, r: 0.22, matcap: 'gold', tint: null, mass: 1.6 },
    mid: { h: 0.62, r: 0.15, matcap: 'ivory', tint: '#C9CDD3', mass: 0.8 },
    small: { h: 0.5, r: 0.13, matcap: 'brand-green', tint: null, mass: 0.6 },
  }

  function trophyGeometry({ h, r }) {
    // Base, stem, cup: a lathe profile, then two handles. Kept lean (~150
    // triangles): prop batches are never frustum-culled, so all 117 draw
    // wherever you are.
    const pts = [
      [0, 0], [r * 1.05, 0], [r * 1.05, h * 0.1], [r * 0.18, h * 0.2],
      [r * 0.16, h * 0.45], [r * 0.95, h * 0.66], [r * 1.0, h], [0, h * 0.9],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const lathe = new THREE.LatheGeometry(pts, 8)
    const handle = new THREE.TorusGeometry(r * 0.38, r * 0.09, 3, 5, Math.PI)
    const parts = [lathe.toNonIndexed()]
    for (const side of [-1, 1]) {
      const g = handle.toNonIndexed()
      g.rotateZ(side < 0 ? Math.PI / 2 : -Math.PI / 2)
      g.translate(side * r * 0.95, h * 0.78, 0)
      parts.push(g)
    }
    for (const g of parts) for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key)
    const merged = mergeAll(parts)
    merged.translate(0, -h / 2, 0) // the body's centre is the trophy's middle
    merged.computeVertexNormals()
    return merged
  }

  function buildTrophies(info, frame, atlas, floorLabels) {
    const yawWorld = frame.yaw(180)
    const ranked = [...tif.awards].sort((a, b) => a.count - b.count)
    const roots = []
    for (const award of tif.awards) {
      const tray = L.trays[award.id]
      if (!tray) {
        console.warn(`[showcase] no tray layout for award "${award.id}" (rebuild.showcase.rnr.trays)`)
        continue
      }
      const rank = ranked.indexOf(award)
      const spec = rank === 0 ? SPECS.grand : rank === ranked.length - 1 ? SPECS.small : SPECS.mid
      const geometry = trophyGeometry(spec)
      const material = createMatcapMaterial(ctx.renderAssets, spec.matcap, spec.tint)
      const proxy = new THREE.BoxGeometry(spec.r * 2, spec.h, spec.r * 2)
      const rows = Math.ceil(award.count / tray.cols)
      const width = (tray.cols - 1) * tray.pitch
      const depth = (rows - 1) * tray.pitch
      for (let i = 0; i < award.count; i++) {
        const col = i % tray.cols
        const row = Math.floor(i / tray.cols)
        const p = frame.toWorld(tray.lx - width / 2 + col * tray.pitch, tray.lz - depth / 2 + row * tray.pitch)
        const root = new THREE.Object3D()
        root.name = `dyn_trophy_${award.id}_${i}`
        root.userData = { mass: spec.mass, friction: 0.5, restitution: 0.25, sfx: 'metal', type: `trophy-${award.id}` }
        root.position.set(p.x, spec.h / 2 + 0.005, p.z)
        root.rotation.y = yawWorld
        const visual = new THREE.Mesh(geometry, material)
        visual.name = `trophy_${award.id}`
        const collider = new THREE.Mesh(proxy)
        collider.name = 'collision_trophy_cyl'
        root.add(visual, collider)
        root.updateMatrixWorld(true)
        roots.push(root)
        trophies.push({ key: `${award.id}-${i}`, root, prop: null, knocked: false })
      }
      // The glass tray: a low rim round the rows (visual only).
      const rimW = width + tray.pitch + 0.3
      const rimD = depth + tray.pitch + 0.3
      const c = frame.toWorld(tray.lx, tray.lz)
      const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: `rnr:tray:${award.id}` })
      b.box('glass', null, [c.x, 0.03, c.z], [rimW, 0.06, rimD], yawWorld)
      for (const [dx, dz, w, d] of [[0, rimD / 2, rimW, 0.08], [0, -rimD / 2, rimW, 0.08], [rimW / 2, 0, 0.08, rimD], [-rimW / 2, 0, 0.08, rimD]]) {
        const q = frame.toWorld(tray.lx + dx, tray.lz + dz)
        b.box('glass', null, [q.x, 0.2, q.z], [w, 0.4, d], yawWorld)
      }
      for (const mesh of b.finish()) info.staticGroup.add(mesh)
      // Its label on the floor, on the gateway side of the tray.
      const label = atlas.add(640, 120, (g, w, h) => drawPlate(g, w, h, { title: t('showcase.trophyBin', { label: award.label, count: award.count }), sub: tif.period, bg: '#1A1A1A', fg: '#FFFFFF', subFg: '#E3B505' }))
      const lp = frame.toWorld(tray.lx, tray.lz - rimD / 2 - 0.55)
      floorLabels.push({ matrix: floorMatrix(lp.x, lp.z, viewYaw(), 3.2, 3.2 * (120 / 640)), rect: label })
    }
    const meshes = ctx.gameWorld.props.addDistrict({ roots, group: info.group, name: `${district}:trophies` })
    // The reveal shows/hides these with the district's own prop batches.
    info.propMeshes.push(...meshes)
    for (const trophy of trophies) trophy.prop = ctx.gameWorld.props.props.find((p) => p.name === trophy.root.name) ?? null
    // Already knocked on an earlier visit: still counted, standing again.
    const done = ctx.game.store.state.exhibits?.trophies ?? {}
    for (const trophy of trophies) trophy.knocked = Boolean(done[trophy.key])

    const centre = frame.toWorld(L.trays.applause?.lx ?? 0, (L.trays.applause?.lz ?? 0) + 2)
    ctx.hotspots.add({
      test: near(centre, settings.showcase.hotspotRadius + 1),
      label: () => t('showcase.openTrophies'),
      open: () => ctx.openStation(tif.station),
    })
  }

  function buildStars(info, frame, atlas, plates) {
    const max = Math.max(...stars.categories.map((c) => c.count), 1)
    const shape = starShape()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 })
    geometry.center()
    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: 'rnr:stars' })
    const count = Math.min(stars.categories.length, L.stars.length)
    starMesh = new THREE.InstancedMesh(geometry, createMatcapMaterial(ctx.renderAssets, 'gold'), count)
    starMesh.name = 'rnr:brightstar'
    starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const [lo, hi] = L.starHeight
    for (let i = 0; i < count; i++) {
      const cat = stars.categories[i]
      const k = Math.sqrt(cat.count / max)
      const height = lo + (hi - lo) * k
      const size = 0.55 + 1.15 * k
      const p = frame.toWorld(L.stars[i].lx, L.stars[i].lz)
      b.cylinder('ivory', '#FFFFFF', [p.x, height / 2, p.z], 0.09, height, { segments: 8, collide: true })
      b.cylinder('ivory', '#E3B505', [p.x, 0.08, p.z], 0.45, 0.16, { segments: 14 })
      starBase.push({ position: new THREE.Vector3(p.x, height + size * 0.55, p.z), size, phase: i * 0.9 })
      const rect = atlas.add(560, 112, (g, w, h) => drawPlate(g, w, h, { title: cat.label, sub: t('showcase.star', { label: stars.title, count: cat.count }), bg: '#FFFFFF', fg: '#1A1A1A', accent: '#E3B505' }))
      for (const face of [0, 1]) {
        const yaw = viewYaw() + face * Math.PI
        const n = { x: Math.sin(yaw), z: Math.cos(yaw) }
        plates.push({ matrix: quadMatrix(p.x + n.x * 0.11, 1.15, p.z + n.z * 0.11, yaw, 1.5, 0.3), rect })
      }
    }
    for (const mesh of b.finish()) info.staticGroup.add(mesh)
    info.staticGroup.add(starMesh)
    writeStars(0)

    const mid = frame.toWorld((L.stars[0].lx + L.stars[1].lx) / 2, L.stars[0].lz - 1.6)
    ctx.hotspots.add({
      test: near(mid, settings.showcase.hotspotRadius),
      label: () => t('showcase.openStars'),
      open: () => ctx.openStation(stars.station),
    })
  }

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s = new THREE.Vector3()
  function writeStars(time) {
    starBase.forEach((star, i) => {
      e.set(0, time * 0.6 + star.phase, 0)
      q.setFromEuler(e)
      s.setScalar(star.size)
      starMesh.setMatrixAt(i, m.compose(star.position, q, s))
    })
    starMesh.instanceMatrix.needsUpdate = true
  }

  const up = new THREE.Vector3(0, 1, 0)
  const tilt = new THREE.Vector3()
  function checkKnocks() {
    const limit = settings.showcase.trophyKnockDistance
    for (const trophy of trophies) {
      // Sleeping ones too: a trophy can be knocked and settle (and sleep)
      // between two checks. 117 cheap reads, five times a second.
      if (trophy.knocked || !trophy.prop) continue
      const p = trophy.prop.body.translation()
      const h = trophy.prop.home.position
      const r = trophy.prop.body.rotation()
      tilt.set(0, 1, 0).applyQuaternion(q.set(r.x, r.y, r.z, r.w))
      if (Math.hypot(p.x - h.x, p.z - h.z) > limit || tilt.dot(up) < Math.cos((50 * Math.PI) / 180)) {
        trophy.knocked = true
        ctx.progress('trophies', trophy.key)
      }
    }
  }

  return {
    name: 'rnr',
    district,
    build(info) {
      const frame = ctx.frames.get(district)
      const atlas = createPackedAtlas({ width: 2048, height: 512 })
      const floorLabels = []
      const plates = []
      if (tif) buildTrophies(info, frame, atlas, floorLabels)
      if (stars) buildStars(info, frame, atlas, plates)
      const material = createAtlasMaterial(atlas.texture)
      info.staticGroup.add(createLabelQuads({ items: [...floorLabels, ...plates], material, name: 'rnr:labels' }))
    },
    update(dt) {
      clock += dt
      if (starMesh && starMesh.parent?.visible !== false) writeStars(clock)
      checkTimer += dt
      if (checkTimer > 0.2) {
        checkTimer = 0
        checkKnocks()
      }
    },
    /** For the badge test: every trophy prop. */
    get trophies() {
      return trophies
    },
  }
}

function starShape() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 === 0 ? 0.5 : 0.22
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function mergeAll(geometries) {
  let total = 0
  for (const g of geometries) total += g.attributes.position.count
  const position = new Float32Array(total * 3)
  let offset = 0
  for (const g of geometries) {
    position.set(g.attributes.position.array, offset)
    offset += g.attributes.position.array.length
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  return out
}
