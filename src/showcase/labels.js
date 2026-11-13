import * as THREE from 'three'

/**
 * Text and pictures for the exhibits, drawn once into canvas atlases.
 *
 * Every label in the showcase (name tiles, signpost arms, issue covers,
 * album frames, flap digits) is a cell of an atlas texture, and every quad
 * that shows one carries an `aRect` attribute (u0, v0, du, dv) -- per
 * instance on an InstancedMesh, per vertex on merged geometry -- that maps
 * its 0..1 UVs onto its cell. So a whole wall of names, or 32 signpost
 * arms, is one texture and one draw call.
 *
 * The font is the interface's own system stack (styles.css): no web fonts,
 * nothing fetched.
 */
export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export function createAtlas({ cols, rows, cellWidth, cellHeight, background = null }) {
  const canvas = document.createElement('canvas')
  canvas.width = cols * cellWidth
  canvas.height = rows * cellHeight
  const ctx = canvas.getContext('2d')
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.name = 'showcase-atlas'

  function cell(index) {
    const c = index % cols
    const r = Math.floor(index / cols)
    return {
      x: c * cellWidth,
      y: r * cellHeight,
      w: cellWidth,
      h: cellHeight,
      // CanvasTexture flips Y: canvas row 0 is the top of the texture (v = 1).
      rect: [c / cols, 1 - (r + 1) / rows, 1 / cols, 1 / rows],
    }
  }

  return {
    canvas,
    texture,
    capacity: cols * rows,
    cell,
    /** Draw cell `index` with `paint(ctx, width, height)` (clipped, local coords); returns its rect. */
    draw(index, paint) {
      const c = cell(index)
      ctx.save()
      ctx.beginPath()
      ctx.rect(c.x, c.y, c.w, c.h)
      ctx.clip()
      ctx.translate(c.x, c.y)
      ctx.clearRect(0, 0, c.w, c.h)
      paint(ctx, c.w, c.h)
      ctx.restore()
      texture.needsUpdate = true
      return c.rect
    },
    dispose() {
      texture.dispose()
    },
  }
}

/** Set a font that makes `text` fit `maxWidth`, starting at `size` px; returns the size used. */
export function fitFont(ctx, text, maxWidth, size, weight = 600, min = 8) {
  let px = size
  for (; px > min; px -= 1) {
    ctx.font = `${weight} ${px}px ${FONT}`
    if (ctx.measureText(text).width <= maxWidth) break
  }
  ctx.font = `${weight} ${px}px ${FONT}`
  return px
}

/** Greedy word wrap into at most `maxLines` lines (the last one ellipsised). */
export function wrap(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    kept[maxLines - 1] = `${last}…`
    return kept
  }
  return lines
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * A plate: rounded background, a title line and an optional smaller second
 * line, centred. Used by name tiles, signpost arms and captions.
 */
export function drawPlate(ctx, w, h, { title, sub = null, bg = '#FFFFFF', fg = '#1A1A1A', subFg = '#53565A', accent = null, radius = 10, align = 'center' }) {
  ctx.fillStyle = bg
  roundRect(ctx, 2, 2, w - 4, h - 4, radius)
  ctx.fill()
  if (accent) {
    ctx.fillStyle = accent
    ctx.fillRect(2 + radius, h - 10, w - 4 - radius * 2, 5)
  }
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const x = align === 'center' ? w / 2 : 18
  const pad = 28
  if (sub) {
    ctx.fillStyle = fg
    fitFont(ctx, title, w - pad, Math.round(h * 0.36), 700)
    ctx.fillText(title, x, h * 0.38)
    ctx.fillStyle = subFg
    fitFont(ctx, sub, w - pad, Math.round(h * 0.22), 500)
    ctx.fillText(sub, x, h * 0.72)
  } else {
    ctx.fillStyle = fg
    fitFont(ctx, title, w - pad, Math.round(h * 0.46), 700)
    ctx.fillText(title, x, h * 0.52)
  }
}

/**
 * MeshBasicMaterial whose map lookup goes through `aRect`: one atlas, many
 * labels. Unlit on purpose -- printed graphics, not shaded surfaces -- and
 * fogged like everything else. `hdr` scales the colour past the bloom
 * threshold for glowing signs.
 */
export function createAtlasMaterial(texture, { transparent = false, color = 0xffffff, hdr = 1, side = THREE.FrontSide } = {}) {
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent, side, fog: true })
  material.color.set(color).multiplyScalar(hdr)
  material.name = 'showcase:atlas'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aRect.xy + uv * aRect.zw;\n#endif')
  }
  material.customProgramCacheKey = () => 'showcase-atlas-rect'
  return material
}

/**
 * An InstancedMesh of unit quads (PlaneGeometry 1x1, facing +Z) showing
 * atlas cells. `items`: [{ matrix, rect, color? }]. Returns the mesh; its
 * `setRect(i, rect)` swaps a cell later (split-flaps, highlights).
 */
export function createLabelQuads({ items, material, name, geometry = new THREE.PlaneGeometry(1, 1) }) {
  const count = items.length
  const rects = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4)
  const geo = geometry.clone()
  geo.setAttribute('aRect', rects)
  const mesh = new THREE.InstancedMesh(geo, material, count)
  mesh.name = name
  items.forEach((item, i) => {
    mesh.setMatrixAt(i, item.matrix)
    rects.setXYZW(i, ...item.rect)
    if (item.color) mesh.setColorAt(i, item.color)
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.setRect = (i, rect) => {
    rects.setXYZW(i, ...rect)
    rects.needsUpdate = true
  }
  return mesh
}

/** A matrix for a quad of size (w, h) at (x, y, z) turned `yaw` about +Y (front = +Z). */
export function quadMatrix(x, y, z, yaw, w, h, out = new THREE.Matrix4()) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw)
  return out.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, 1))
}

const UP = new THREE.Vector3(0, 1, 0)
