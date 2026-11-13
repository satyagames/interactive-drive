import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createBuilder } from './builder.js'
import { createAtlasMaterial, createLabelQuads, createPackedAtlas, drawPlate, fitFont, quadMatrix, viewYaw } from './labels.js'

/**
 * Toolkit Depot: the signpost forest (doc 10 §2.7). One fingerpost per
 * quick-link group in `exhibits.signposts.groups` (Find it fast, Function,
 * Others), with one arm per link (32 today) pointing out all round it, in
 * two tiers, and the group's name on a cap sign. Drive round a post: the
 * arm pointing at you lights up and Enter opens its card with the link.
 * Opening a link never earns anything (doc 10 §3).
 *
 * Every arm is two quads (one arrow drawn each way, so both faces read
 * normally) in one atlas: the poles merged, the arms one instanced mesh.
 */
export function createSignposts(ctx) {
  const data = ctx.exhibits?.signposts
  if (!data?.groups?.length) return null
  const posts = ctx.layout.signposts
  const colour = ctx.colorOf(data.district)
  const white = new THREE.Color(1, 1, 1)
  const lit = new THREE.Color(2.0, 2.0, 2.0)
  let arms = null
  const poles = []

  function arrow(g, w, h, text, pointRight) {
    g.fillStyle = '#FFFFFF'
    g.beginPath()
    const tip = 36
    if (pointRight) {
      g.moveTo(4, 6); g.lineTo(w - tip, 6); g.lineTo(w - 4, h / 2); g.lineTo(w - tip, h - 6); g.lineTo(4, h - 6)
    } else {
      g.moveTo(w - 4, 6); g.lineTo(tip, 6); g.lineTo(4, h / 2); g.lineTo(tip, h - 6); g.lineTo(w - 4, h - 6)
    }
    g.closePath()
    g.fill()
    g.fillStyle = colour
    g.fillRect(pointRight ? 4 : w - 12, 6, 8, h - 12)
    g.fillStyle = '#1A1A1A'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    fitFont(g, text, w - tip - 40, 44, 700)
    g.fillText(text, pointRight ? (w - tip) / 2 + 6 : (w + tip) / 2 - 6, h / 2 + 1)
  }

  function build(info) {
    const frame = ctx.frames.get(data.district)
    const atlas = createPackedAtlas({ width: 2048, height: 2048 })
    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: 'toolkit:signposts' })
    const items = []
    const ARM = 1.5
    const ARM_H = 0.3
    data.groups.slice(0, posts.length).forEach((group, gi) => {
      const p = frame.toWorld(posts[gi].lx, posts[gi].lz)
      const n = group.links.length
      const tiers = 2
      const height = 2.0 + tiers * 0.42 + 0.9
      b.cylinder('ivory', '#FFFFFF', [p.x, height / 2, p.z], 0.11, height, { segments: 10, collide: true })
      b.cylinder('ivory', colour, [p.x, 0.1, p.z], 0.5, 0.2, { segments: 14 })
      // The cap sign: the group's name, facing the camera, both faces.
      const cap = atlas.add(700, 120, (g, w, h) => drawPlate(g, w, h, { title: group.title, bg: '#1A1A1A', fg: '#FFFFFF', accent: '#86BC25' }))
      for (const face of [0, 1]) {
        const yaw = viewYaw() + face * Math.PI
        items.push({ matrix: quadMatrix(p.x + Math.sin(yaw) * 0.02, height + 0.28, p.z + Math.cos(yaw) * 0.02, yaw, 1.6, 0.28), rect: cap, color: white })
      }
      const base = viewYaw() + Math.PI / 2
      const entries = []
      group.links.forEach((link, i) => {
        const right = atlas.add(500, 96, (g, w, h) => arrow(g, w, h, link.label, true))
        const left = atlas.add(500, 96, (g, w, h) => arrow(g, w, h, link.label, false))
        const dir = base + (i * Math.PI * 2) / n
        const y = 2.0 + (i % tiers) * 0.42
        // The arm runs from the pole out along `dir`; its board faces dir ± 90°.
        const cx = p.x + Math.sin(dir) * (ARM / 2 + 0.1)
        const cz = p.z + Math.cos(dir) * (ARM / 2 + 0.1)
        const first = items.length
        for (const face of [0, 1]) {
          // Face 0 looks along dir - 90° (its viewer's right is `dir`), face 1 along dir + 90°.
          const yaw = dir - Math.PI / 2 + face * Math.PI
          items.push({
            matrix: quadMatrix(cx + Math.sin(yaw) * 0.02, y, cz + Math.cos(yaw) * 0.02, yaw, ARM, ARM_H),
            rect: face === 0 ? right : left,
            color: white,
          })
        }
        entries.push({ link, dir, first })
      })
      poles.push({ centre: new THREE.Vector3(p.x, 0, p.z), group, entries })
    })
    for (const mesh of b.finish()) info.staticGroup.add(mesh)
    arms = createLabelQuads({ items, material: createAtlasMaterial(atlas.texture, { side: THREE.FrontSide }), name: 'toolkit:signposts:arms' })
    info.staticGroup.add(arms)

    ctx.hotspots.add({
      test(car) {
        let best = null
        for (const pole of poles) {
          const dx = car.position.x - pole.centre.x
          const dz = car.position.z - pole.centre.z
          const d = Math.hypot(dx, dz)
          if (d > settings.showcase.hotspotRadius || (best && d >= best.score)) continue
          const a = Math.atan2(dx, dz)
          let pick = null
          let gap = Infinity
          for (const entry of pole.entries) {
            const delta = Math.abs(Math.atan2(Math.sin(a - entry.dir), Math.cos(a - entry.dir)))
            if (delta < gap) {
              gap = delta
              pick = entry
            }
          }
          if (pick) best = { score: d, item: { pole, entry: pick } }
        }
        return best
      },
      label: ({ entry }) => t('showcase.signpostOpen', { label: entry.link.label }),
      highlight(item) {
        for (const pole of poles) {
          for (const entry of pole.entries) {
            const c = item && item.entry === entry ? lit : white
            arms.setColorAt(entry.first, c)
            arms.setColorAt(entry.first + 1, c)
          }
        }
        arms.instanceColor.needsUpdate = true
      },
      open({ pole, entry }) {
        ctx.openCard({
          id: `link-${slug(pole.group.title)}-${pole.entries.indexOf(entry)}`,
          district: data.district,
          kicker: t('showcase.signpostKicker', { group: pole.group.title }),
          title: entry.link.label,
          body: t('showcase.signpostBody'),
          links: [entry.link],
        })
      },
    })
  }

  return { name: 'signposts', district: data.district, build }
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
