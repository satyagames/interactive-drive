import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { createBuilder } from './builder.js'
import { near } from './hotspots.js'
import { createBoardReveal } from './boardReveal.js'
import { createAtlasMaterial, createLabelQuads, createPackedAtlas, fitFont, FONT, quadMatrix } from './labels.js'

/**
 * HQ: Pursuit Wins as a split-flap scoreboard on the tower plaza (doc 10
 * §2.2). It flips between the sets in `exhibits.winsBoard.sets` (FY26, FY25
 * ...) every `settings.showcase.winsFlipInterval` s: the title strip and the
 * labels swap, and every value cell clatters through random glyphs before
 * landing, column by column. The footer says what the numbers are -- site
 * snapshots, not decade totals -- and Enter nearby opens "Our COE at a glance".
 *
 * Everything on the board is one atlas: two draw calls for the labels and
 * flaps, plus the merged frame.
 */
export function createWinsBoard(ctx) {
  const data = ctx.exhibits?.winsBoard
  if (!data?.sets?.length) return null
  const L = ctx.layout.winsBoard

  const cols = Math.max(...data.sets.flatMap((s) => s.rows.map((r) => r.value.length)))
  const rowCount = Math.max(...data.sets.map((s) => s.rows.length))
  const glyphs = [...new Set([' ', ...data.sets.flatMap((s) => s.rows.flatMap((r) => [...r.value]))])]
  const DARK = '#15171C'

  let board = null
  let reveal = null
  let cells = []
  let current = 0
  let timer = 0
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const calm = () => (settings.vfx.reducedMotion === 'auto' ? Boolean(motionQuery?.matches) : Boolean(settings.vfx.reducedMotion))

  function build(info) {
    const frame = ctx.frames.get(data.district)
    const at = frame.toWorld(L.lx, L.lz)
    const yaw = frame.yaw(L.yaw)
    const W = L.width
    const H = L.height
    const D = 0.32
    const lift = L.lift
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const world = (x, y, z) => [at.x + x * c + z * s, y, at.z - x * s + z * c]

    // --- the frame: two legs, the box, a green trim and a little roof ---
    const b = createBuilder({ world: ctx.world, RAPIER: ctx.RAPIER, renderAssets: ctx.renderAssets, name: 'hq:wins' })
    for (const side of [-1, 1]) {
      b.box('ivory', '#FFFFFF', world(side * (W / 2 - 0.5), lift / 2, 0), [0.45, lift, 0.45], yaw, { collide: true })
    }
    b.box('dark', null, world(0, lift + H / 2, 0), [W, H, D], yaw, { collide: true })
    b.box('brand-green', null, world(0, lift + H + 0.06, 0), [W + 0.2, 0.12, D + 0.12], yaw)
    b.box('brand-green', null, world(0, lift - 0.06, 0), [W + 0.2, 0.12, D + 0.12], yaw)
    for (const mesh of b.finish()) info.staticGroup.add(mesh)

    // --- the atlas: title strips, row labels, flap glyphs, the footer ---
    const atlas = createPackedAtlas({ width: 1024, height: 1024 })
    const strip = (title, caption) => atlas.add(1000, 104, (g, w, h) => {
      g.fillStyle = DARK
      g.fillRect(0, 0, w, h)
      g.textBaseline = 'middle'
      g.textAlign = 'left'
      g.fillStyle = '#86BC25'
      const size = fitFont(g, `${data.heading} · ${title}`, w * 0.62, 64, 800)
      g.fillText(`${data.heading} · ${title}`, 16, h / 2)
      g.textAlign = 'right'
      g.fillStyle = '#C9CDD3'
      fitFont(g, caption, w * 0.34, Math.min(size * 0.55, 34), 500)
      g.fillText(caption, w - 16, h / 2)
    })
    const label = (text) => atlas.add(500, 80, (g, w, h) => {
      g.fillStyle = DARK
      g.fillRect(0, 0, w, h)
      g.textBaseline = 'middle'
      g.fillStyle = '#FFFFFF'
      fitFont(g, text, w - 24, 46, 600)
      g.fillText(text, 12, h / 2)
    })
    const glyphRect = new Map(glyphs.map((ch) => [ch, atlas.add(64, 96, (g, w, h) => {
      g.fillStyle = '#23262D'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#FFFFFF'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `800 72px ${FONT}`
      g.fillText(ch, w / 2, h / 2 + 4)
      // The split between the two flaps.
      g.fillStyle = '#0A0B0D'
      g.fillRect(0, h / 2 - 1.5, w, 3)
    })]))
    const strips = data.sets.map((set) => strip(set.title, set.caption))
    const labels = data.sets.map((set) => set.rows.map((r) => label(r.label)))
    const footer = atlas.add(1000, 56, (g, w, h) => {
      g.fillStyle = DARK
      g.fillRect(0, 0, w, h)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = '#9AA0A8'
      fitFont(g, t('showcase.winsSnapshot'), w - 32, 34, 500)
      g.fillText(t('showcase.winsSnapshot'), w / 2, h / 2)
    })

    // --- quads, in board space (front = +Z) -----------------------------
    const z = D / 2 + 0.01
    const pad = 0.22
    const top = lift + H - pad
    const stripH = 0.62
    const footerH = 0.32
    const rowH = (H - pad * 2 - stripH - footerH - 0.1) / rowCount
    const cellW = Math.min(0.5, (W * 0.48) / cols)
    const cellH = rowH * 0.86
    const items = []
    items.push({ matrix: quadMatrix(0, top - stripH / 2, z, 0, W - pad * 2, stripH), rect: strips[0] })
    items.push({ matrix: quadMatrix(0, lift + pad + footerH / 2, z, 0, W - pad * 2, footerH), rect: footer })
    const labelIndex = []
    const flapItems = []
    for (let r = 0; r < rowCount; r++) {
      const y = top - stripH - 0.05 - rowH * (r + 0.5)
      labelIndex.push(items.length)
      items.push({ matrix: quadMatrix(-W / 2 + pad + (W * 0.46) / 2, y, z, 0, W * 0.46, rowH * 0.8), rect: labels[0][r] ?? glyphRect.get(' ') })
      for (let col = 0; col < cols; col++) {
        const x = W / 2 - pad - cellW * (cols - col - 0.5) - 0.04 * (cols - col - 1)
        flapItems.push({ row: r, col, matrix: quadMatrix(x, y, z, 0, cellW, cellH), rect: glyphRect.get(' ') })
      }
    }
    const group = new THREE.Group()
    group.name = 'hq:wins-board'
    group.position.set(at.x, 0, at.z)
    group.rotation.y = yaw
    // The figures fade in from a dark board as the car approaches.
    const material = createAtlasMaterial(atlas.texture, { blank: DARK })
    reveal = createBoardReveal(material, at)
    const labelMesh = createLabelQuads({ items, material, name: 'hq:wins:labels' })
    const flapMesh = createLabelQuads({ items: flapItems, material, name: 'hq:wins:flaps' })
    flapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    group.add(labelMesh, flapMesh)
    info.staticGroup.add(group)

    cells = flapItems.map((item, i) => ({ ...item, index: i, char: ' ', target: ' ', spinUntil: 0, start: 0, next: 0, base: item.matrix.clone() }))
    board = { strips, labels, labelIndex, labelMesh, flapMesh, glyphRect, group, clock: 0 }
    show(0, { instant: true })

    ctx.hotspots.add({
      // The board is up on legs: you can park right under it.
      test: near({ x: at.x, z: at.z }, settings.showcase.hotspotRadius + 2),
      label: () => t('showcase.openWins'),
      open: () => ctx.openStation(data.station),
    })
  }

  /** Flip to set `index`: titles swap now, values clatter in column by column. */
  function show(index, { instant = false } = {}) {
    current = index
    const set = data.sets[index]
    board.labelMesh.setRect(0, board.strips[index])
    board.labelIndex.forEach((i, r) => board.labelMesh.setRect(i, board.labels[index][r] ?? board.glyphRect.get(' ')))
    for (const cell of cells) {
      const value = set.rows[cell.row]?.value ?? ''
      const padded = value.padStart(cols, ' ')
      cell.target = padded[cell.col]
      if (instant || calm()) {
        setChar(cell, cell.target)
        cell.spinUntil = 0
      } else {
        cell.start = board.clock + cell.col * 0.07 + cell.row * 0.16
        cell.spinUntil = cell.start + 0.45
      }
    }
  }

  function setChar(cell, ch) {
    cell.char = ch
    board.flapMesh.setRect(cell.index, board.glyphRect.get(ch) ?? board.glyphRect.get(' '))
  }

  const m = new THREE.Matrix4()
  const squash = new THREE.Matrix4()
  return {
    name: 'winsBoard',
    district: data.district,
    build,
    get reveal() {
      return reveal
    },
    update(dt, car) {
      reveal?.update(dt, car)
      if (!board) return
      board.clock += dt
      // Only worth flipping when someone could see it.
      const near = Math.hypot(car.position.x - board.group.position.x, car.position.z - board.group.position.z) < 90
      timer += dt
      if (near && timer >= settings.showcase.winsFlipInterval && data.sets.length > 1) {
        timer = 0
        show((current + 1) % data.sets.length)
      }
      let moved = false
      for (const cell of cells) {
        if (!cell.spinUntil) continue
        if (board.clock < cell.start) continue
        if (board.clock >= cell.spinUntil) {
          cell.spinUntil = 0
          setChar(cell, cell.target)
          board.flapMesh.setMatrixAt(cell.index, cell.base)
          moved = true
          continue
        }
        if (board.clock >= cell.next) {
          cell.next = board.clock + 0.05
          setChar(cell, glyphs[Math.floor(Math.random() * glyphs.length)])
        }
        // The falling flap: the cell squashes towards its split line and back.
        const u = ((board.clock - cell.start) / 0.05) % 1
        squash.makeScale(1, 0.35 + 0.65 * Math.abs(Math.cos(u * Math.PI)), 1)
        board.flapMesh.setMatrixAt(cell.index, m.multiplyMatrices(cell.base, squash))
        moved = true
      }
      if (moved) board.flapMesh.instanceMatrix.needsUpdate = true
    },
  }
}
