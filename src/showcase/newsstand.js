import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createBuilder } from './builder.js'
import { createBoardReveal } from './boardReveal.js'
import { createAtlas, createAtlasMaterial, createLabelQuads, fitFont, FONT, viewYaw, wrap } from './labels.js'

/**
 * Innovation Lab: The Intelligence Update newsstand (doc 10 §2.4). A
 * carousel kiosk with one cover per issue in `exhibits.newsstand.issues`
 * (newest first; 13 today), the newest facing the default camera. Drive
 * round the kiosk: the cover facing you lights up, and Enter opens that
 * issue's card with its PDF (read three for "Gen AI Insider"). The newest
 * issue pulses with a NEW ribbon until you've opened it, so a new file
 * dropped into the content announces itself.
 *
 * Covers are designed title cards (masthead + issue), not page renders:
 * nothing here reads the PDFs. Draw calls: the kiosk (merged), the covers.
 */
export function createNewsstand(ctx) {
  const data = ctx.exhibits?.newsstand
  if (!data?.issues?.length) return null
  const L = ctx.layout.newsstand
  const issues = data.issues
  const colour = ctx.colorOf(data.district)
  const white = new THREE.Color(1, 1, 1)
  const lit = new THREE.Color(1.9, 1.9, 1.9)
  let covers = null
  let centre = null
  let baseYaw = 0
  let active = null
  let clock = 0
  let reveal = null

  const read = () => ctx.game.store.state.exhibits?.issues ?? {}

  function paintCover(atlas, i) {
    const issue = issues[i]
    atlas.draw(i, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#0F1A1F')
      grad.addColorStop(1, colour)
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#FFFFFF'
      g.textAlign = 'left'
      g.textBaseline = 'top'
      g.font = `800 34px ${FONT}`
      wrap(g, data.title, w - 36, 3).forEach((line, k) => g.fillText(line, 18, 20 + k * 38))
      g.fillStyle = '#86BC25'
      g.fillRect(18, 150, 64, 6)
      g.fillStyle = '#FFFFFF'
      g.textBaseline = 'bottom'
      fitFont(g, issue.label, w - 36, 64, 800)
      g.fillText(issue.label, 18, h - 22)
      if (i === 0) {
        // The NEW ribbon across the corner.
        g.save()
        g.translate(w - 58, 50)
        g.rotate(Math.PI / 4)
        g.fillStyle = '#ED8B00'
        g.fillRect(-90, -18, 180, 36)
        g.fillStyle = '#1A1A1A'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.font = `800 24px ${FONT}`
        g.fillText(t('showcase.issueNew'), 0, 1)
        g.restore()
      }
    })
  }

  function build(info) {
    const frame = ctx.frames.get(data.district)
    const p = frame.toWorld(L.lx, L.lz)
    centre = new THREE.Vector3(p.x, 0, p.z)
    const n = issues.length
    const atlas = createAtlas({ cols: Math.min(n, 7), rows: Math.ceil(n / 7), cellWidth: 256, cellHeight: 352 })
    issues.forEach((_, i) => paintCover(atlas, i))

    const r = L.radius
    const H = L.height
    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: 'innovation:newsstand' })
    b.cylinder('ivory', '#FFFFFF', [p.x, 0.12, p.z], r + 0.35, 0.24, { segments: 26 })
    b.cylinder('dark', null, [p.x, H * 0.4, p.z], r, H * 0.8, { segments: n * 2, collide: true })
    b.cylinder('ivory', colour, [p.x, H * 0.8 + 0.06, p.z], r + 0.25, 0.12, { segments: 26 })
    b.cylinder('ivory', colour, [p.x, H * 0.8 + 0.5, p.z], r + 0.55, 0.9, { segments: 26, top: 0.05 })
    b.cylinder('brand-green', null, [p.x, H + 0.15, p.z], 0.18, 0.3, { segments: 10 })
    for (const mesh of b.finish()) info.staticGroup.add(mesh)

    // Cover 0 (the newest) faces the camera; the rest go round.
    baseYaw = viewYaw()
    const w = Math.min(((2 * Math.PI * r) / n) * 0.88, 0.95)
    const h = w * (352 / 256)
    const items = issues.map((_, i) => {
      const yaw = baseYaw + (i * Math.PI * 2) / n
      const out = r + 0.03
      return {
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(p.x + Math.sin(yaw) * out, H * 0.42, p.z + Math.cos(yaw) * out),
          new THREE.Quaternion().setFromAxisAngle(UP, yaw),
          new THREE.Vector3(w, h, 1),
        ),
        rect: atlas.cell(i).rect,
        color: white,
      }
    })
    // The covers fade in from dark blanks as the car approaches the kiosk.
    const material = createAtlasMaterial(atlas.texture, { blank: '#1B242A' })
    covers = createLabelQuads({ items, material, name: 'innovation:newsstand:covers' })
    info.staticGroup.add(covers)
    reveal = createBoardReveal(material, centre)

    ctx.hotspots.add({
      test(car) {
        const dx = car.position.x - centre.x
        const dz = car.position.z - centre.z
        const d = Math.hypot(dx, dz)
        if (d > r + settings.showcase.hotspotRadius) return null
        const step = (Math.PI * 2) / n
        const i = ((Math.round((Math.atan2(dx, dz) - baseYaw) / step) % n) + n) % n
        return { score: d, item: i }
      },
      label: (i) => t('showcase.issueOpen', { label: issues[i].label }),
      anchor: () => ({ x: centre.x, z: centre.z, size: (r + 1) * 2, color: colour }),
      highlight(i) {
        active = i
        paint()
      },
      open(i) {
        const issue = issues[i]
        ctx.openCard({
          id: `issue-${i}`,
          district: data.district,
          kicker: data.title,
          title: issue.label,
          body: t('showcase.issueBody', { label: issue.label }),
          links: [{ label: t('showcase.issueLink', { label: issue.label }), url: issue.url }],
          counter: 'issues',
          key: issue.url,
        })
      },
    })
  }

  const pulse = new THREE.Color()
  function paint() {
    if (!covers) return
    const unread = !read()[issues[0].url]
    issues.forEach((_, i) => {
      if (i === active) covers.setColorAt(i, lit)
      else if (i === 0 && unread) covers.setColorAt(i, pulse.setScalar(1.15 + 0.35 * (0.5 + 0.5 * Math.sin(clock * 3))))
      else covers.setColorAt(i, white)
    })
    covers.instanceColor.needsUpdate = true
  }

  return {
    name: 'newsstand',
    district: data.district,
    build,
    get reveal() {
      return reveal
    },
    update(dt, car) {
      reveal?.update(dt, car)
      clock += dt
      // Only the newest cover animates (its NEW pulse), and only while unread.
      if (covers && active !== 0 && !read()[issues[0].url]) paint()
    },
  }
}

const UP = new THREE.Vector3(0, 1, 0)
