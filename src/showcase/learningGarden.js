import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createBuilder } from './builder.js'
import { near } from './hotspots.js'
import { createAtlasMaterial, createLabelQuads, createPackedAtlas, drawPlate, quadMatrix, viewYaw } from './labels.js'

/**
 * L&D Campus: the learning bar garden (doc 10 §2.7). One planted bar per
 * metric in `exhibits.learningGarden.bars` (870 learning hours, 26 AI
 * learning hours, 30 hours of leadership training today): a hedge growing
 * out of a planter, its height on a log scale (`base + perDecade x
 * log10(value)`) so 870 stands tall without dwarfing 26 into nothing, with
 * flowers on top and a plate giving the real number. Enter nearby opens
 * "Metrics & Useful Links".
 */
export function createLearningGarden(ctx) {
  const data = ctx.exhibits?.learningGarden
  if (!data?.bars?.length) return null
  const L = ctx.layout.learningGarden
  const colour = ctx.colorOf(data.district)

  function build(info) {
    const frame = ctx.frames.get(data.district)
    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: 'lnd:garden' })
    const atlas = createPackedAtlas({ width: 2048, height: 256 })
    const plates = []
    const n = data.bars.length
    data.bars.forEach((bar, i) => {
      const lx = L.lx + i * L.spacing
      const p = frame.toWorld(lx, L.lz)
      const yaw = frame.yaw(0)
      const height = L.base + L.perDecade * Math.log10(Math.max(bar.value, 1))
      b.box('ivory', colour, [p.x, 0.3, p.z], [1.5, 0.6, 1.5], yaw, { collide: true })
      b.box('brand-green', null, [p.x, 0.6 + height / 2, p.z], [1.05, height, 1.05], yaw, { collide: true })
      // A few flowers on top, in the 2D family's L&D pink.
      for (const [dx, dz] of [[-0.28, -0.22], [0.3, -0.18], [0.02, 0.3], [-0.2, 0.18], [0.25, 0.25]]) {
        const q = { x: p.x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z: p.z - dx * Math.sin(yaw) + dz * Math.cos(yaw) }
        b.cylinder('ivory', '#F27BA5', [q.x, 0.6 + height + 0.1, q.z], 0.13, 0.2, { segments: 7 })
      }
      const rect = atlas.add(600, 150, (g, w, h) => drawPlate(g, w, h, {
        title: t('showcase.bar', { value: bar.value.toLocaleString('en-US'), unit: bar.unit }),
        sub: bar.label,
        bg: '#FFFFFF',
        fg: '#1A1A1A',
        accent: colour,
      }))
      // The plate leans on the planter's camera side.
      const vy = viewYaw()
      plates.push({ matrix: quadMatrix(p.x + Math.sin(vy) * 0.78, 0.62, p.z + Math.cos(vy) * 0.78, vy, 1.7, 0.42), rect })
    })
    for (const mesh of b.finish()) info.staticGroup.add(mesh)
    info.staticGroup.add(createLabelQuads({ items: plates, material: createAtlasMaterial(atlas.texture), name: 'lnd:garden:plates' }))

    const mid = frame.toWorld(L.lx + ((n - 1) / 2) * L.spacing, L.lz - 2.2)
    ctx.hotspots.add({
      test: near(mid, settings.showcase.hotspotRadius),
      label: () => t('showcase.openGarden'),
      open: () => ctx.openStation(data.station),
    })
  }

  return { name: 'learningGarden', district: data.district, build }
}
