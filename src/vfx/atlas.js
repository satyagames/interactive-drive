import * as THREE from 'three'

/**
 * The VFX sprite atlas: a 4x4 grid of white-on-transparent shapes drawn on a
 * canvas at boot (no image files, nothing fetched). Particles pick a cell and
 * tint it, so one texture and one material serve every effect.
 */
export const CELLS = 4
export const CELL = {
  puff: 0,
  spark: 1,
  paper: 2,
  chip: 3,
  star: 4,
  confetti: 5,
  ten: 6,
  ring: 7,
  splat: 9,
  glow: 10,
  dot: 11,
}

const SIZE = 128

export function createAtlasTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE * CELLS
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'

  const draw = (cell, paint) => {
    ctx.save()
    ctx.translate((cell % CELLS) * SIZE + SIZE / 2, Math.floor(cell / CELLS) * SIZE + SIZE / 2)
    paint(ctx)
    ctx.restore()
  }
  const radial = (r, stops) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
  }

  // Dust puff: three overlapping soft blobs, so it doesn't read as a disc.
  draw(CELL.puff, () => {
    for (const [x, y, r] of [[-14, 6, 40], [12, 8, 36], [0, -12, 38]]) {
      ctx.save()
      ctx.translate(x, y)
      radial(r, [[0, 0.55], [0.6, 0.3], [1, 0]])
      ctx.restore()
    }
  })
  draw(CELL.spark, () => radial(30, [[0, 1], [0.25, 0.9], [1, 0]]))
  // Paper sheet with a fold line (the line is cut out of the alpha).
  draw(CELL.paper, (c) => {
    c.fillRect(-34, -44, 68, 88)
    c.globalCompositeOperation = 'destination-out'
    c.fillRect(-34, -2, 68, 3)
    c.globalCompositeOperation = 'source-over'
  })
  draw(CELL.chip, (c) => {
    c.beginPath()
    c.moveTo(-30, -20)
    c.lineTo(18, -34)
    c.lineTo(34, 10)
    c.lineTo(-6, 32)
    c.lineTo(-34, 12)
    c.closePath()
    c.fill()
  })
  // Four-point sparkle.
  draw(CELL.star, (c) => {
    radial(22, [[0, 1], [1, 0]])
    c.beginPath()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 60 : 9
      const a = (i / 8) * Math.PI * 2
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    c.closePath()
    c.fill()
  })
  draw(CELL.confetti, (c) => c.fillRect(-22, -40, 44, 80))
  // A tiny "10", drawn as shapes so it needs no font.
  draw(CELL.ten, (c) => {
    c.lineWidth = 16
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(-40, -22)
    c.lineTo(-26, -38)
    c.lineTo(-26, 40)
    c.stroke()
    c.beginPath()
    c.ellipse(20, 1, 22, 37, 0, 0, Math.PI * 2)
    c.stroke()
  })
  draw(CELL.ring, (c) => {
    c.lineWidth = 10
    c.beginPath()
    c.arc(0, 0, 50, 0, Math.PI * 2)
    c.stroke()
  })
  // Ink splat: a blob and a scatter of droplets (fixed, so it's the same every boot).
  draw(CELL.splat, (c) => {
    c.beginPath()
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const r = 34 + 8 * Math.sin(a * 5) + 5 * Math.cos(a * 3)
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    c.fill()
    for (const [x, y, r] of [[48, -10, 7], [-46, 22, 6], [10, 52, 5], [-20, -50, 6], [40, 38, 4], [-52, -24, 4]]) {
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()
    }
  })
  draw(CELL.glow, () => radial(62, [[0, 1], [0.2, 0.6], [0.5, 0.18], [1, 0]]))
  draw(CELL.dot, (c) => {
    c.beginPath()
    c.arc(0, 0, 40, 0, Math.PI * 2)
    c.fill()
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace // white masks, not colours
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}
