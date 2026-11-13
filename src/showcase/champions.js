import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createMatcapMaterial } from '../render/materials.js'
import { createAtlasMaterial, createLabelQuads, createPackedAtlas, drawPlate } from './labels.js'

/**
 * The Chronicles champion hunt (doc 10 §3): one name plate per Deloitte
 * Chronicles champion in `exhibits.champions.names` (20 today), standing
 * on the verges round the arena's rings -- between the spokes, so they're
 * found by exploring rather than by visiting stations. Drive through one
 * to collect it: the plate flies off with the golden pickup's sparkle and
 * bell (a `collect` event, kind "champion"), a toast counts you up, and all
 * of them earn "Chronicles Collector". Found plates stay found.
 *
 * Positions come from `rebuild.showcase.champions.rings` (radius, first
 * bearing, step, count; bearings clockwise from north like doc 02). The
 * last ring takes any names beyond the rings' counts, so a longer list in
 * the content still gets a plate for everyone.
 *
 * Not district-bound (they live between districts): built once at start.
 * Draw calls: posts + plates (2), turning gently.
 */
export function createChampions(ctx) {
  const data = ctx.exhibits?.champions
  const rings = ctx.layout.champions?.rings
  if (!data?.names?.length || !rings?.length) return null

  const plates = []
  let postMesh = null
  let plateMesh = null
  let clock = 0
  const found = () => ctx.game.store.state.exhibits?.champions ?? {}

  function positions(count) {
    const out = []
    rings.forEach((ring, k) => {
      const last = k === rings.length - 1
      const n = last ? count - out.length : Math.min(ring.count, count - out.length)
      const step = last && n > ring.count ? 360 / n : ring.step
      for (let i = 0; i < n; i++) {
        const a = ((ring.from + step * i) * Math.PI) / 180
        out.push(new THREE.Vector3(ring.radius * Math.sin(a), 0, -ring.radius * Math.cos(a)))
      }
    })
    return out
  }

  function init() {
    const names = data.names
    const spots = positions(names.length)
    const atlas = createPackedAtlas({ width: 2048, height: 1024 })
    const items = []
    names.forEach((name, i) => {
      const rect = atlas.add(400, 140, (g, w, h) => drawPlate(g, w, h, {
        title: name,
        sub: t('showcase.championPlate'),
        bg: '#FFFFFF',
        fg: '#1A1A1A',
        subFg: '#7F5BA6',
        accent: '#E3B505',
      }))
      plates.push({ name, position: spots[i], index: i, taken: Boolean(found()[name]), flight: 0 })
      items.push({ matrix: new THREE.Matrix4(), rect })
      items.push({ matrix: new THREE.Matrix4(), rect })
    })
    plateMesh = createLabelQuads({ items, material: createAtlasMaterial(atlas.texture), name: 'champions:plates' })
    plateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    plateMesh.frustumCulled = false
    postMesh = new THREE.InstancedMesh(POST, createMatcapMaterial(ctx.renderAssets, 'gold'), names.length)
    postMesh.name = 'champions:posts'
    postMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    postMesh.frustumCulled = false
    ctx.group.add(postMesh, plateMesh)
    write()
  }

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  const centre = new THREE.Vector3()
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  const up = new THREE.Vector3(0, 1, 0)

  function write(car = null) {
    for (const plate of plates) {
      if (plate.taken && plate.flight <= 0) {
        postMesh.setMatrixAt(plate.index, zero)
        plateMesh.setMatrixAt(plate.index * 2, zero)
        plateMesh.setMatrixAt(plate.index * 2 + 1, zero)
        continue
      }
      const yaw = clock * 0.8 + plate.index
      p.copy(plate.position)
      let shrink = 1
      if (plate.flight > 0 && car) {
        // Taken: it flies into the car and shrinks away.
        const u = 1 - plate.flight
        p.lerp(car.position, u)
        shrink = 1 - u
      }
      p.y = 0
      q.setFromAxisAngle(up, yaw)
      postMesh.setMatrixAt(plate.index, m.compose(p, q, s.set(shrink, shrink, shrink)))
      for (const face of [0, 1]) {
        q.setFromAxisAngle(up, yaw + face * Math.PI)
        const out = 0.06 * shrink
        centre.set(p.x + Math.sin(yaw + face * Math.PI) * out, (1.25 + Math.sin(clock * 2 + plate.index) * 0.06) * shrink, p.z + Math.cos(yaw + face * Math.PI) * out)
        plateMesh.setMatrixAt(plate.index * 2 + face, m.compose(centre, q, s.set(1.3 * shrink, 0.455 * shrink, 1)))
      }
    }
    postMesh.instanceMatrix.needsUpdate = true
    plateMesh.instanceMatrix.needsUpdate = true
  }

  function take(plate) {
    plate.taken = true
    plate.flight = 1
    ctx.game.events.emit('collect', { kind: 'champion', id: `champion:${plate.name}`, combo: 0, position: plate.position.clone().setY(1.2) })
    ctx.progress('champions', plate.name)
  }

  return {
    name: 'champions',
    districts: [],
    init,
    build() {},
    update(dt, car) {
      if (!plateMesh) return
      clock += dt
      const reach = settings.showcase.championPickup
      for (const plate of plates) {
        if (plate.flight > 0) plate.flight = Math.max(plate.flight - dt / 0.35, 0)
        if (plate.taken) continue
        if (Math.hypot(car.position.x - plate.position.x, car.position.z - plate.position.z) < reach) take(plate)
      }
      write(car)
    },
    /** Debug / the badge test: where every plate stands. */
    get plates() {
      return plates
    },
  }
}

/** A short gold post the plate sits on (1.0 m, origin on the floor). */
const POST = new THREE.CylinderGeometry(0.05, 0.08, 1.0, 8).translate(0, 0.5, 0)
