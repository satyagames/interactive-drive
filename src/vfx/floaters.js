import * as THREE from 'three'

/**
 * "+5" floaters over pickups: a small pool of DOM labels projected from
 * world space each frame (crisp text, no glyph atlas, and no font the page
 * doesn't already have). Decorative only -- the HUD's own live regions
 * announce XP -- so the layer is aria-hidden.
 */
export function createFloaters({ root, camera, size = 8, life = 1.1, rise = 1.6 }) {
  const items = []
  for (let i = 0; i < size; i++) {
    const el = document.createElement('span')
    el.className = 'vfx-floater'
    el.hidden = true
    root.append(el)
    items.push({ el, position: new THREE.Vector3(), age: life, tone: '' })
  }
  let next = 0
  const projected = new THREE.Vector3()

  /** Show `text` at a world position; `tone` is a CSS modifier (gold, dark). */
  function show(text, position, tone = '') {
    const item = items[next]
    next = (next + 1) % items.length
    item.el.textContent = text
    if (item.tone !== tone) {
      item.el.className = tone ? `vfx-floater vfx-floater--${tone}` : 'vfx-floater'
      item.tone = tone
    }
    item.position.copy(position)
    item.age = 0
    item.el.hidden = false
  }

  function update(dt) {
    const width = root.clientWidth
    const height = root.clientHeight
    for (const item of items) {
      if (item.age >= life) continue
      item.age += dt
      if (item.age >= life) {
        item.el.hidden = true
        continue
      }
      const t = item.age / life
      projected.copy(item.position)
      projected.y += rise * (1 - (1 - t) * (1 - t))
      projected.project(camera)
      if (projected.z > 1) {
        item.el.hidden = true
        continue
      }
      const x = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      item.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1 + 0.25 * Math.min(t * 6, 1)).toFixed(3)})`
      item.el.style.opacity = (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3).toFixed(3)
    }
  }

  return { show, update }
}
