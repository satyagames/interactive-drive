import { settings } from '../config.js'

/**
 * Boards with pictures on them fade the pictures in as the car approaches
 * (doc 11 R3; the reference's project boards do the same): inside
 * `settings.showcase.boardRevealRadius` of `centre` the material's reveal
 * runs 0 -> 1 over `boardRevealTime` seconds with a power4 in/out curve, and
 * back to 0 when the car has gone. `material` comes from
 * `createAtlasMaterial(texture, { blank })`: at 0 it shows the blank colour.
 *
 * Under reduced motion it switches instead of fading.
 */
export function createBoardReveal(material, centre) {
  const reveal = material.userData.reveal
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const calm = () => (settings.vfx.reducedMotion === 'auto' ? Boolean(motionQuery?.matches) : Boolean(settings.vfx.reducedMotion))
  let t = 0
  reveal.value = 0

  return {
    /** Per frame; `car` has a `position`. */
    update(dt, car) {
      const s = settings.showcase
      const near = Math.hypot(car.position.x - centre.x, car.position.z - centre.z) < s.boardRevealRadius
      if (calm() || s.boardRevealTime <= 0) t = near ? 1 : 0
      else t = Math.min(Math.max(t + (near ? dt : -dt) / s.boardRevealTime, 0), 1)
      reveal.value = power4InOut(t)
    },
    /** 0..1, eased (for tests). */
    get value() {
      return reveal.value
    },
    get progress() {
      return t
    },
    centre,
  }
}

function power4InOut(t) {
  return t < 0.5 ? 8 * t ** 4 : 1 - 8 * (1 - t) ** 4
}
