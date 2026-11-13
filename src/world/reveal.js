import { settings } from '../config.js'

/**
 * District reveals and the opening (doc 02 §3.0, doc 05 §2 "District reveal").
 *
 * Every district except the base starts hidden. When the car -- or the
 * Explore camera -- comes within its radius + `reveal.distance`, its
 * buildings, trees and collectibles scale in from the centre with a little
 * overshoot, and its props drop in from above as a wave from the centre out.
 * Props arrive on a kinematic path (`dynamicProps.dropIn`), so the Red Tape
 * Wall, the Jenga stack and the bowling pins land standing.
 *
 * The opening is the RFP Gate's reveal played at boot with the letters
 * falling from higher, one after another in reading order, while the car
 * drops in and the camera dollies out.
 *
 * Under prefers-reduced-motion nothing is hidden and nothing animates.
 */
export function createReveal({ gameWorld, focusPoint, centres }) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const states = new Map()
  const tweens = []

  function prepare(info) {
    if (reducedMotion || info.id === 'base' || states.has(info.id) || !centres[info.id]) return
    info.staticGroup.visible = false
    for (const mesh of info.propMeshes) mesh.visible = false
    gameWorld.props.hideDistrict(info.id)
    states.set(info.id, { info, revealed: false })
  }

  function revealDistrict(id, { intro = false } = {}) {
    const state = states.get(id)
    if (!state || state.revealed) return
    state.revealed = true
    const r = settings.reveal
    const centre = centres[id]
    const group = state.info.staticGroup
    group.visible = true
    tweens.push({ group, centre, time: 0, duration: r.scaleTime })
    applyScale(group, centre, 0.01)
    for (const mesh of state.info.propMeshes) mesh.visible = true

    const props = gameWorld.props.props.filter((p) => p.district === id)
    if (intro) {
      // Letters by row -- PURSUIT is the southern row, nearer the camera --
      // then left to right as you face them (west to east); the rest after.
      const letters = props.filter((p) => p.type.startsWith('letter')).sort((a, b) => (
        Math.abs(a.home.position.z - b.home.position.z) > 1
          ? b.home.position.z - a.home.position.z
          : a.home.position.x - b.home.position.x
      ))
      letters.forEach((prop, i) => gameWorld.props.dropIn(prop, {
        height: r.introHeight, delay: 0.25 + i * r.introStagger, duration: r.dropTime * 1.6,
      }))
      const others = props.filter((p) => !letters.includes(p))
      for (const prop of others) gameWorld.props.dropIn(prop, { height: r.dropHeight, delay: 0.25 + letters.length * r.introStagger, duration: r.dropTime })
      return
    }
    for (const prop of props) {
      const d = Math.hypot(prop.home.position.x - centre.x, prop.home.position.z - centre.z) / centre.radius
      gameWorld.props.dropIn(prop, {
        // Lower props first so stacks build up from the bottom.
        height: r.dropHeight, delay: Math.min(d, 1.2) * r.stagger + prop.home.position.y * 0.05, duration: r.dropTime,
      })
    }
  }

  function applyScale(group, centre, s) {
    // Scale about the district centre on the floor: p' = s p + c (1 - s).
    group.scale.setScalar(s)
    group.position.set(centre.x * (1 - s), 0, centre.z * (1 - s))
  }

  /** Per frame: start reveals that are now in range and advance the scale tweens. */
  function update(dt, carPosition) {
    const r = settings.reveal
    const focus = focusPoint()
    for (const [id, state] of states) {
      if (state.revealed) continue
      const c = centres[id]
      const reach = c.radius + r.distance
      const near = (p) => p && Math.hypot(p.x - c.x, p.z - c.z) < reach
      if (near(carPosition) || near(focus)) revealDistrict(id)
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tween = tweens[i]
      tween.time += dt
      const t = Math.min(tween.time / tween.duration, 1)
      applyScale(tween.group, tween.centre, Math.max(easeOutBack(t), 0.01))
      if (t >= 1) {
        applyScale(tween.group, tween.centre, 1)
        tweens.splice(i, 1)
      }
    }
  }

  for (const info of gameWorld.districts) prepare(info)
  gameWorld.onDistrictLoaded(prepare)

  return {
    update,
    revealDistrict,
    /** The opening: the RFP Gate's letters fall in while the car drops. */
    playIntro(id = 'rfp_gate') {
      revealDistrict(id, { intro: true })
    },
    get pending() {
      return [...states.values()].filter((s) => !s.revealed).map((s) => s.info.id)
    },
  }
}

function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
