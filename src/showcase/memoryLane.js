import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createBuilder } from './builder.js'
import { createAtlas, createAtlasMaterial, createLabelQuads, fitFont, FONT, roundRect, wrap } from './labels.js'

/**
 * Culture Commons: Memory Lane (doc 10 §2.6). One photo frame per album in
 * `exhibits.memoryLane.albums` (27 from the 2D site), standing on a curved
 * gallery rail round the plaza, oldest... in the site's own order.
 *
 * Each frame starts as a title card (album, date, place, photo count)
 * painted on a canvas atlas; once the car comes within
 * `settings.showcase.streamRadius` of the lane, the albums that have a
 * highlight photo stream in and are painted over their cards -- nothing is
 * fetched before that. Drive along the lane: the frame nearest you lights
 * up and Enter opens its album card (title, when and where, the photo),
 * which counts towards "Memory Maker".
 *
 * Draw calls: the rail and frames (merged), the pictures (one instanced mesh).
 */
export function createMemoryLane(ctx) {
  const data = ctx.exhibits?.memoryLane
  if (!data?.albums?.length) return null
  const L = ctx.layout.memoryLane
  const albums = data.albums
  const colour = ctx.colorOf(data.district)

  let atlas = null
  let pictures = null
  let frames = []
  let streamed = false
  let lane = null
  const white = new THREE.Color(1, 1, 1)
  const glow = new THREE.Color(1.9, 1.9, 1.9)

  function card(index) {
    const album = albums[index]
    atlas.draw(index, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, colour)
      grad.addColorStop(1, '#7F5BA6')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(255,255,255,0.92)'
      roundRect(g, 14, 14, w - 28, h - 28, 14)
      g.fill()
      g.fillStyle = '#1A1A1A'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `700 30px ${FONT}`
      const lines = wrap(g, album.title, w - 56, 3)
      lines.forEach((line, i) => g.fillText(line, w / 2, h * 0.38 + (i - (lines.length - 1) / 2) * 34))
      g.fillStyle = '#53565A'
      const meta = [album.when, t('showcase.albumMeta', { photos: album.photos })].filter(Boolean).join(' · ')
      fitFont(g, meta, w - 56, 22, 500)
      g.fillText(meta, w / 2, h * 0.78)
    })
  }

  function photo(index, image) {
    const album = albums[index]
    atlas.draw(index, (g, w, h) => {
      // Cover-fit the photo, then a caption strip.
      const s = Math.max(w / image.width, h / image.height)
      const iw = image.width * s
      const ih = image.height * s
      g.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih)
      g.fillStyle = 'rgba(0,0,0,0.62)'
      g.fillRect(0, h - 52, w, 52)
      g.fillStyle = '#FFFFFF'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      fitFont(g, album.title, w - 20, 22, 700)
      g.fillText(album.title, w / 2, h - 26)
    })
  }

  /** Load the highlight photos (once, when the car first comes near). */
  function stream() {
    streamed = true
    albums.forEach((album, i) => {
      if (!album.image) return
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => photo(i, image)
      image.onerror = () => console.warn(`[showcase] Memory Lane: ${album.image} failed to load`)
      image.src = album.image
    })
  }

  function build(info) {
    const frame = ctx.frames.get(data.district)
    const count = albums.length
    atlas = createAtlas({ cols: 6, rows: Math.ceil(count / 6), cellWidth: 256, cellHeight: 256 })
    for (let i = 0; i < count; i++) card(i)

    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: 'culture:memory-lane' })
    const items = []
    const size = L.frame
    const y = L.lift + size / 2
    const step = count > 1 ? (L.to - L.from) / (count - 1) : 0
    for (let i = 0; i < count; i++) {
      const a = ((L.from + step * i) * Math.PI) / 180
      const lx = L.radius * Math.sin(a)
      const lz = -L.radius * Math.cos(a)
      const p = frame.toWorld(lx, lz)
      // Facing the plaza centre.
      const yaw = frame.yaw((-a * 180) / Math.PI)
      b.box('ivory', '#FFFFFF', [p.x, y, p.z], [size + 0.14, size + 0.14, 0.1], yaw)
      b.box('ivory', colour, [p.x, L.lift / 2, p.z], [0.12, L.lift, 0.12], yaw)
      for (const face of [0, 1]) {
        const fy = yaw + face * Math.PI
        const n = { x: Math.sin(fy), z: Math.cos(fy) }
        items.push({
          matrix: new THREE.Matrix4().compose(
            new THREE.Vector3(p.x + n.x * 0.056, y, p.z + n.z * 0.056),
            new THREE.Quaternion().setFromAxisAngle(UP, fy),
            new THREE.Vector3(size, size, 1),
          ),
          rect: atlas.cell(i).rect,
          color: white,
        })
      }
      frames.push({ position: new THREE.Vector3(p.x, 0, p.z), index: i })
    }
    // The gallery rail: a low curved kerb under the frames (one collider per segment).
    for (let i = 0; i < count - 1; i++) {
      const a0 = ((L.from + step * i) * Math.PI) / 180
      const a1 = ((L.from + step * (i + 1)) * Math.PI) / 180
      const am = (a0 + a1) / 2
      const r = L.radius
      const p = frame.toWorld(r * Math.sin(am), -r * Math.cos(am))
      const len = 2 * r * Math.sin(Math.abs(a1 - a0) / 2) + 0.02
      b.box('ivory', colour, [p.x, 0.15, p.z], [len, 0.3, 0.4], frame.yaw((-am * 180) / Math.PI), { collide: true })
    }
    for (const mesh of b.finish()) info.staticGroup.add(mesh)
    pictures = createLabelQuads({ items, material: createAtlasMaterial(atlas.texture), name: 'culture:memory-lane:pictures' })
    info.staticGroup.add(pictures)
    lane = frame.toWorld(L.radius * Math.sin((((L.from + L.to) / 2) * Math.PI) / 180), -L.radius * Math.cos((((L.from + L.to) / 2) * Math.PI) / 180))

    ctx.hotspots.add({
      test(car) {
        let best = null
        let bestD = settings.showcase.galleryReach
        for (const f of frames) {
          const d = Math.hypot(car.position.x - f.position.x, car.position.z - f.position.z)
          if (d < bestD) {
            bestD = d
            best = f.index
          }
        }
        return best === null ? null : { score: bestD, item: best }
      },
      label: (i) => t('showcase.albumOpen', { title: albums[i].title }),
      highlight(i) {
        for (let k = 0; k < count; k++) {
          const c = k === i ? glow : white
          pictures.setColorAt(k * 2, c)
          pictures.setColorAt(k * 2 + 1, c)
        }
        pictures.instanceColor.needsUpdate = true
      },
      open(i) {
        const album = albums[i]
        const meta = [album.when, album.place, t('showcase.albumMeta', { photos: album.photos })].filter(Boolean).join(' · ')
        ctx.openCard({
          id: `album-${i}`,
          district: data.district,
          kicker: t('showcase.albumKicker'),
          title: album.title,
          body: album.image ? meta : `${meta}\n\n${t('showcase.albumNoPhoto')}`,
          images: album.image ? [album.image] : [],
          counter: 'albums',
          key: album.title,
        })
      },
    })
  }

  return {
    name: 'memoryLane',
    district: data.district,
    build,
    update(dt, car) {
      if (streamed || !lane) return
      if (Math.hypot(car.position.x - lane.x, car.position.z - lane.z) < settings.showcase.streamRadius) stream()
    },
  }
}

const UP = new THREE.Vector3(0, 1, 0)
