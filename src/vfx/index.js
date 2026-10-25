import * as THREE from 'three'

import { rebuild, settings } from '../config.js'
import { t } from '../content/ui.js'
import { morseTimeline } from '../game/morse.js'
import { CELL, createAtlasTexture } from './atlas.js'
import { createFireworks } from './fireworks.js'
import { createFloaters } from './floaters.js'
import { createParticles } from './particles.js'
import { createPortal } from './portal.js'
import { createRibbons } from './ribbon.js'
import { createSpeedLines } from './speedLines.js'
import { createStamp } from './stamp.js'

/**
 * Every effect in doc 05 §2, as pooled systems driven by the game's event
 * bus (and by the car's state for the continuous ones). Draw calls: two
 * particle pools (matte + emissive), the floor ribbons, speed lines,
 * fireworks, the portal, and the stamp while it plays.
 *
 *   tyre dust ............ sliding rear wheels, hard landings
 *   boost ................ green exhaust glow, speed lines, FOV kick
 *   skid marks / paint ... ribbons; paint inside the Studio
 *   impacts .............. \`impact\` events: metal sparks, paper sheets, brick/wood chips, dust
 *   pickups .............. sparkle burst + ring + "+N XP" floater; idle twinkles nearby
 *   stamp ................ slam, ink splash, light pillar
 *   confetti ............. Strike a Win, Dash finish, birthdays, the finale
 *   fireworks ............ the finale and the Konami code (low, in shot of the iso camera)
 *   portal ............... always; flares on a Dash finish
 *   bulbs / beacon ....... Idea Spark bulbs glow once lit; the beacon blinks "10" in Morse
 *   golden skin .......... a trail of tiny 10s
 *
 * Reduced motion (prefers-reduced-motion, or \`settings.vfx.reducedMotion\`):
 * no camera FX, no speed lines, a third of the confetti, fireworks without
 * flashes, the stamp appears instead of falling.
 */
const c = (hex) => new THREE.Color(hex)
const GREEN = c('#86BC25')
const GREEN_LIGHT = c('#C4E86B')
const GOLD = c('#E3B505')
const WHITE = c('#F4F2EC')
const CONFETTI_COLOURS = ['#86BC25', '#F4F2EC', '#0D8390', '#00A3E0', '#ED8B00', '#E3B505', '#62B5E5', '#26890D'].map(c)
const FIREWORK_COLOURS = { green: [0x86bc25, 0xc4e86b, 0xf4f2ec], gold: [0xe3b505, 0xfff1c4, 0x86bc25], mixed: [0x86bc25, 0x00a3e0, 0xe3b505, 0xf4f2ec] }

/** Presets (see particles.js for the fields). Colours and HDR intensity are filled in at boot. */
const P = {
  dust: { cat: 'dust', cell: CELL.puff, life: [0.6, 1.1], size: [0.8, 1.25], grow: 2.4, alpha: 0.5, gravity: -0.5, drag: 2.6, spin: [0.2, 0.8], fadeStart: 0.15 },
  landing: { cat: 'dust', cell: CELL.puff, life: [0.7, 1.2], size: [1.0, 1.5], grow: 2.2, alpha: 0.55, gravity: -0.3, drag: 3.2, spin: [0.2, 0.6], fadeStart: 0.2 },
  exhaust: { cat: 'exhaust', cell: CELL.glow, life: [0.1, 0.2], size: [0.5, 0.75], grow: 0.35, alpha: 0.85, drag: 5 },
  spark: { cat: 'spark', cell: CELL.spark, life: [0.25, 0.55], size: [0.22, 0.34], grow: 0.4, gravity: 14, drag: 1.2, bounce: 0.35 },
  paper: { cat: 'debris', cell: CELL.paper, life: [1.6, 2.6], size: [0.42, 0.6], gravity: 2.4, drag: 2.4, spin: [2, 5], tumble: true, fadeStart: 0.7 },
  chip: { cat: 'debris', cell: CELL.chip, life: [0.9, 1.5], size: [0.2, 0.34], gravity: 16, drag: 0.5, spin: [6, 12], bounce: 0.3, fadeStart: 0.7 },
  puff: { cat: 'dust', cell: CELL.puff, life: [0.4, 0.7], size: [0.5, 0.8], grow: 2, alpha: 0.45, gravity: -0.4, drag: 3, fadeStart: 0.2 },
  sparkle: { cat: 'sparkle', cell: CELL.star, life: [0.35, 0.7], size: [0.4, 0.7], grow: 0.2, drag: 3, spin: [1, 3] },
  ring: { cat: 'sparkle', cell: CELL.ring, life: 0.4, size: 0.8, grow: 5, alpha: 0.9, rotation: 0 },
  twinkle: { cat: 'sparkle', cell: CELL.star, life: [0.5, 0.9], size: [0.3, 0.5], grow: 0.15, gravity: -0.5, spin: [0.5, 1.5], fadeStart: 0.3 },
  confetti: { cat: 'confetti', cell: CELL.confetti, life: [2.8, 4.2], size: [0.26, 0.4], gravity: 5.5, drag: 1.5, spin: [3, 8], tumble: true, fadeStart: 0.75 },
  ten: { cat: 'ten', cell: CELL.ten, life: [0.9, 1.3], size: [0.5, 0.7], grow: 0.8, gravity: -0.7, drag: 1.2, rotation: 0, fadeStart: 0.4 },
  ink: { cat: 'debris', cell: CELL.dot, life: [0.5, 0.8], size: [0.22, 0.38], gravity: 18, drag: 0.4, bounce: 0, fadeStart: 0.6 },
  glow: { cat: 'glow', cell: CELL.glow, life: 1e-4, size: 1, alpha: 1 },
}

export function createVfx({ scene, camera, cameraRig, renderer, renderAssets, vehicle, game, gameWorld, seed, floaterRoot }) {
  const cfg = settings.vfx
  // Live, like the camera rig's: the OS setting can change mid-visit.
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const reducedMotion = () => cfg.reducedMotion === 'auto' ? Boolean(motionQuery?.matches) : Boolean(cfg.reducedMotion)
  const k = cfg.emissive

  // Colours per preset; the emissive ones (intensity > 1) land above the bloom threshold.
  P.dust.color = P.landing.color = P.puff.color = c(cfg.dust.color)
  P.exhaust.color = [GREEN, GREEN_LIGHT]
  P.exhaust.intensity = k
  P.spark.color = [c('#FFE7A3'), c('#FFFFFF'), c('#FFC15C')]
  P.spark.intensity = k * 1.3
  P.paper.color = [WHITE, c('#FFFFFF'), c('#DADFE3')]
  P.chip.color = c('#C8102E')
  P.sparkle.color = P.ring.color = P.twinkle.color = GREEN
  P.sparkle.intensity = P.ring.intensity = k
  P.twinkle.intensity = k * 0.8
  P.confetti.color = CONFETTI_COLOURS
  P.ten.color = GOLD
  P.ten.intensity = 1.6
  P.ink.color = GREEN
  P.glow.color = GREEN
  P.glow.intensity = k
  const CHIP_COLOURS = { brick: [c('#C8102E'), c('#9E1B1B')], wood: [c('#B07A45'), c('#8A5A2B')] }
  const PICKUP_COLOURS = { dot: GREEN, golden: GOLD, shuriken: WHITE }

  const group = new THREE.Group()
  group.name = 'vfx'
  scene.add(group)

  const atlas = createAtlasTexture()
  const soft = createParticles({ capacity: 900, atlas, name: 'vfx:soft', renderOrder: 8, limits: { dust: 64, confetti: cfg.confetti.max, debris: 200 } })
  // Emissives are alpha-blended HDR colour, not additive: added onto the
  // white plazas and the cream sky, additive green turned white.
  const glow = createParticles({ capacity: 560, atlas, name: 'vfx:glow', renderOrder: 14, limits: { spark: 160, sparkle: 160, exhaust: 90, ten: 70, glow: 40 } })
  const ribbons = createRibbons({ capacity: 1400 })
  const speedLines = createSpeedLines()
  const fireworks = createFireworks({ intensity: 1.4 })
  const stamp = createStamp({ atlas, renderAssets, emissive: k })
  const floaters = createFloaters({ root: floaterRoot, camera })
  group.add(ribbons.mesh, soft.mesh, glow.mesh, speedLines.mesh, fireworks.points, stamp.group)

  // The portal disc rides on the turning ring, once HQ has loaded.
  let portal = null
  const findPortal = () => {
    const ring = gameWorld.animated('anim_hq_portal')
    if (ring && !portal) portal = createPortal({ ring, emissive: k })
  }
  findPortal()
  gameWorld.onDistrictLoaded(findPortal)

  const s = rebuild.worldScale
  const styles = {
    skid: { color: c(cfg.skid.color), opacity: cfg.skid.opacity, width: cfg.skid.width, fade: cfg.skid.fade },
    paint: { color: c(cfg.paint.color), opacity: cfg.paint.opacity, width: cfg.paint.width, fade: cfg.paint.fade },
  }
  const skidTracks = [ribbons.track(), ribbons.track()]
  const paintTracks = [ribbons.track(), ribbons.track()]
  const studio = seed.territories.find((d) => d.id === 'studio')?.position ?? null
  const birthdayToday = () => {
    const now = new Date()
    const today = `--${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return (seed.feeds?.birthdays ?? []).some((b) => b.date === today)
  }

  // Scratch (nothing below allocates per frame).
  const contact = new THREE.Vector3()
  const point = new THREE.Vector3()
  const back = new THREE.Vector3()
  const side = new THREE.Vector3()
  const dustAcc = [0, 0]
  let exhaustAcc = 0
  let tensAcc = 0
  let twinkleClock = 0
  let time = 0
  let groundY = 0
  let wasAirborne = false
  let fallSpeed = 0
  let wasBoosting = false
  const stats = { cpuMs: 0, peakMs: 0 }

  const density = () => cfg.density
  const amount = (n) => Math.max(1, Math.round(n * density()))
  const jitter = (r) => (Math.random() - 0.5) * 2 * r

  // ---- continuous effects -----------------------------------------------------

  function tyres(dt) {
    const st = vehicle.state
    const inStudio = studio && Math.hypot(vehicle.position.x - studio[0], vehicle.position.z - studio[2]) < cfg.paint.radius
    const painting = inStudio && st.speed > cfg.paint.minSpeed
    for (let w = 0; w < 2; w++) {
      const wheel = w + 2 // rear wheels
      const grounded = vehicle.wheelContact?.(wheel, contact) ?? false
      if (grounded) groundY = contact.y
      // Skid marks while drifting.
      if (grounded && st.sliding) ribbons.add(skidTracks[w], contact.x, contact.y, contact.z, styles.skid)
      else ribbons.lift(skidTracks[w])
      // Paint Trail in the Studio.
      if (grounded && painting) ribbons.add(paintTracks[w], contact.x, contact.y + 0.004, contact.z, styles.paint)
      else ribbons.lift(paintTracks[w])
      // Dust from a sliding wheel.
      if (grounded && st.sliding) {
        dustAcc[w] += cfg.dust.slideRate * density() * dt
        while (dustAcc[w] >= 1) {
          dustAcc[w] -= 1
          const v = vehicle.velocity
          soft.spawn(P.dust, contact.x + jitter(0.2), contact.y + 0.2, contact.z + jitter(0.2), -v.x * 0.12 + jitter(0.6), 0.6, -v.z * 0.12 + jitter(0.6))
        }
      } else {
        dustAcc[w] = 0
      }
    }

    // Landing: a ring of dust, an FOV punch and a little shake.
    if (st.airborne) fallSpeed = Math.max(fallSpeed, -vehicle.velocity.y)
    if (wasAirborne && !st.airborne) {
      if (fallSpeed > cfg.dust.landingSpeed) {
        const strength = Math.min((fallSpeed - cfg.dust.landingSpeed) / 8, 1)
        const n = amount(cfg.dust.landingPuffs * (0.5 + strength))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          const r = 0.9 * s
          soft.spawn(P.landing, vehicle.position.x + Math.cos(a) * r, groundY + 0.25, vehicle.position.z + Math.sin(a) * r,
            Math.cos(a) * (2 + 3 * strength), 0.4, Math.sin(a) * (2 + 3 * strength))
        }
        cameraRig.kick(cfg.camera.landingKick * strength)
        cameraRig.shake(cfg.camera.landingShake * strength)
      }
      fallSpeed = 0
    }
    wasAirborne = st.airborne
  }

  function boost(dt) {
    const st = vehicle.state
    if (st.boosting && !wasBoosting && st.speed > 3) cameraRig.kick(cfg.camera.boostKick)
    wasBoosting = st.boosting
    const speedRatio = Math.min(st.speed / Math.max(vehicle.topSpeed * 1.3, 1), 1)
    const aspect = camera.aspect
    speedLines.update(dt, st.boosting && !reducedMotion() ? cfg.boost.lines * speedRatio : 0, aspect, time)

    if (!st.boosting) {
      exhaustAcc = 0
      return
    }
    // Two pipes at the rear corners (+Z is back in the car's frame).
    back.set(0, 0, 1).applyQuaternion(vehicle.quaternion)
    side.set(1, 0, 0).applyQuaternion(vehicle.quaternion)
    exhaustAcc += cfg.boost.flameRate * 2 * density() * dt
    const v = vehicle.velocity
    let pipe = 0
    while (exhaustAcc >= 1) {
      exhaustAcc -= 1
      pipe = 1 - pipe
      point.copy(vehicle.position).addScaledVector(back, 1.05 * s).addScaledVector(side, (pipe ? 0.22 : -0.22) * s)
      point.y += 0.25 * s
      glow.spawn(P.exhaust, point.x, point.y, point.z,
        v.x * 0.7 + back.x * 4 + jitter(0.6), v.y * 0.5 + jitter(0.4), v.z * 0.7 + back.z * 4 + jitter(0.6))
    }
  }

  function goldenTrail(dt) {
    if (game.store.state.skin !== 'golden' || vehicle.state.speed < 2) {
      tensAcc = 0
      return
    }
    tensAcc += cfg.tensRate * density() * dt
    back.set(0, 0, 1).applyQuaternion(vehicle.quaternion)
    while (tensAcc >= 1) {
      tensAcc -= 1
      point.copy(vehicle.position).addScaledVector(back, 1.2 * s)
      glow.spawn(P.ten, point.x + jitter(0.4), point.y + 0.4 + jitter(0.2), point.z + jitter(0.4), jitter(0.4), 0.6, jitter(0.4))
    }
  }

  /** Idle twinkles on uncollected collectibles near the car. */
  function twinkles(dt) {
    twinkleClock += dt
    const interval = 0.09 / density()
    if (twinkleClock < interval) return
    twinkleClock = 0
    const list = gameWorld.collectibles
    if (!list.length) return
    const range = cfg.sparkleRange * cfg.sparkleRange
    for (let tries = 0; tries < 6; tries++) {
      const item = list[(Math.random() * list.length) | 0]
      if (game.store.state.collected[item.id] || item.mesh?.parent?.visible === false) continue
      if (item.position.distanceToSquared(vehicle.position) > range) continue
      const colour = PICKUP_COLOURS[item.kind] ?? GREEN
      glow.spawn(P.twinkle, item.position.x + jitter(0.5), item.position.y + 0.3 + jitter(0.4), item.position.z + jitter(0.5), 0, 0.3, 0, colour)
      return
    }
  }

  // ---- glows (one-frame emissive sprites, re-emitted every frame) -------------

  const litBulbs = []
  let morse = null // { start, steps, total }

  function glows() {
    for (let i = 0; i < litBulbs.length; i++) {
      const p = litBulbs[i].body.translation()
      glow.spawn(BULB, p.x, p.y, p.z)
    }
    if (morse) {
      const beacon = gameWorld.landmarks.get('landmark_hq_beacon')
      let elapsed = time - morse.start
      if (elapsed > morse.total * 2 || !beacon) {
        morse = null
        return
      }
      elapsed %= morse.total
      for (const [on, off] of morse.steps) {
        if (elapsed < on) {
          glow.spawn(BEACON, beacon.x, beacon.y, beacon.z)
          // The beacon is above the iso camera's frame from most of HQ, so
          // the flash also washes the tower's foot, where it can be seen.
          glow.spawn(BEACON_SPILL, beacon.x, groundY + 2, beacon.z + 6)
          break
        }
        elapsed -= on + off
        if (elapsed < 0) break
      }
    }
  }
  // Halos: a lit bulb (0.45 m) gets one about twice its size; the beacon's blink is big.
  const BULB = { ...P.glow, size: 1.1, color: c('#FFF1C4'), intensity: k * 0.8 }
  const BEACON = { ...P.glow, size: 9, intensity: k * 1.4 }
  const BEACON_SPILL = { ...P.glow, size: 16, alpha: 0.55, intensity: k * 0.8 }

  // ---- bursts -----------------------------------------------------------------

  function impact({ position, sfx, strength, withCar }) {
    const n = amount(4 + 18 * strength)
    const floor = Math.abs(position.y - groundY) < 3 ? groundY + 0.02 : position.y - 0.6
    switch (sfx) {
      case 'metal':
        for (let i = 0; i < n; i++) {
          const speed = 3 + 8 * strength
          glow.spawn(P.spark, position.x, position.y, position.z, jitter(speed), Math.random() * speed * 0.8 + 1, jitter(speed))
          glow.setLastFloor(floor)
        }
        break
      case 'paper':
        for (let i = 0; i < Math.ceil(n * 0.6); i++) {
          soft.spawn(P.paper, position.x + jitter(0.3), position.y + 0.3, position.z + jitter(0.3), jitter(2.4), 2.5 + Math.random() * 3.5 * (0.5 + strength), jitter(2.4))
          soft.setLastFloor(floor)
        }
        break
      case 'brick':
      case 'wood':
        for (let i = 0; i < n; i++) {
          const speed = 2 + 5 * strength
          const colours = CHIP_COLOURS[sfx]
          soft.spawn(P.chip, position.x, position.y + 0.1, position.z, jitter(speed), 2 + Math.random() * speed, jitter(speed), colours[i % colours.length])
          soft.setLastFloor(floor)
        }
        break
      default: // plastic, rubber: a scuff of dust
        for (let i = 0; i < Math.ceil(n * 0.4); i++) soft.spawn(P.puff, position.x + jitter(0.3), position.y, position.z + jitter(0.3), jitter(1.2), 0.6, jitter(1.2))
    }
    if (withCar && strength > 0.25) cameraRig.shake(cfg.camera.impactShake * strength)
  }

  function pickup({ kind, position }) {
    const colour = PICKUP_COLOURS[kind] ?? GREEN
    const n = amount(kind === 'dot' ? 12 : 26)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 3
      glow.spawn(P.sparkle, position.x, position.y + 0.3, position.z, Math.cos(a) * speed, 1 + Math.random() * 3, Math.sin(a) * speed, colour)
    }
    glow.spawn(P.ring, position.x, position.y + 0.3, position.z, 0, 0, 0, colour)
  }

  function confettiBurst(origin, count = cfg.confetti.burst, spread = 4, up = 11) {
    const n = amount(count * (reducedMotion() ? 0.3 : 1))
    for (let i = 0; i < n; i++) {
      soft.spawn(P.confetti, origin.x + jitter(0.5), origin.y, origin.z + jitter(0.5), jitter(spread), up * (0.6 + Math.random() * 0.5), jitter(spread))
      soft.setLastFloor(groundY + 0.03)
    }
  }

  function stampAt() {
    back.set(0, 0, -1).applyQuaternion(vehicle.quaternion) // ahead of the car
    back.y = 0
    back.normalize()
    point.copy(vehicle.position).addScaledVector(back, 6.5)
    const x = point.x
    const z = point.z
    const y = groundY
    const yaw = Math.atan2(back.x, back.z)
    stamp.play(x, y, z, yaw, reducedMotion(), () => {
      cameraRig.shake(cfg.camera.stampShake)
      const n = amount(30)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const speed = 3 + Math.random() * 5
        soft.spawn(P.ink, x, y + 0.2, z, Math.cos(a) * speed, 1 + Math.random() * 3, Math.sin(a) * speed)
        soft.setLastFloor(y + 0.03)
      }
      for (let i = 0; i < amount(24); i++) {
        glow.spawn(P.sparkle, x + jitter(1.2), y + Math.random() * 3, z + jitter(1.2), jitter(1), 2 + Math.random() * 4, jitter(1))
      }
    })
  }

  function fireworksShow({ around, shells, spread, shapes, palette, height }) {
    for (let i = 0; i < shells; i++) {
      fireworks.launch({
        x: around.x + (i === 0 ? 0 : jitter(spread)),
        z: around.z + (i === 0 ? 0 : jitter(spread)),
        groundY: around.y ?? 0,
        height: height + jitter(2),
        shape: shapes[i % shapes.length],
        colors: palette,
        camera,
        delay: i * 0.7 + Math.random() * 0.25,
        size: shapes[i % shapes.length] === 'ten' ? 1.4 : 1,
      })
    }
  }

  // ---- event wiring -----------------------------------------------------------

  const events = game.events
  const portalPosition = new THREE.Vector3()
  events.on('impact', impact)
  events.on('collect', pickup)
  events.on('xp', ({ amount: xp, reason }) => {
    point.copy(vehicle.position)
    point.y += 1.4 * s
    floaters.show(t('game.xpGain', { xp }), point, reason === 'collect:golden' ? 'gold' : '')
  })
  events.on('stamp', stampAt)
  events.on('minigame', ({ id, phase, prop }) => {
    if (id === 'strike_a_win' && phase === 'confetti') {
      point.copy(vehicle.position)
      back.set(0, 0, -1).applyQuaternion(vehicle.quaternion)
      point.addScaledVector(back, 6)
      point.y = groundY + 0.5
      confettiBurst(point)
    }
    if (id === 'idea_spark' && phase === 'progress' && prop) {
      const bulb = gameWorld.props.props.find((p) => p.name === prop)
      if (bulb && !litBulbs.includes(bulb)) litBulbs.push(bulb)
    }
  })
  events.on('dash', ({ phase }) => {
    if (phase !== 'finish') return
    portal?.pulse()
    if (portal) {
      portal.disc.getWorldPosition(portalPosition)
      portalPosition.y = groundY + 0.5
      confettiBurst(portalPosition, cfg.confetti.burst, 5, 12)
    }
  })
  // The iso camera looks down at 32 deg, so the top of the frame is still 12 deg
  // below the horizon: a shell bursting high over the tower is out of shot
  // from almost anywhere. Shells burst low, around wherever the camera is
  // looking, so the show is always on screen.
  events.on('finale', () => {
    const f = cameraRig.focusPoint ?? vehicle.position
    fireworksShow({ around: { x: f.x, y: groundY, z: f.z - 6 }, shells: 10, spread: 14, shapes: ['ten', 'dots', 'dots', 'ten', 'dots'], palette: FIREWORK_COLOURS.mixed, height: 10 })
    confettiBurst({ x: vehicle.position.x, y: groundY + 0.5, z: vehicle.position.z }, cfg.confetti.burst, 5, 12)
  })
  events.on('easter-egg', ({ id }) => {
    if (id === 'konami') {
      fireworksShow({ around: { x: vehicle.position.x, y: groundY, z: vehicle.position.z - 6 }, shells: 3, spread: 10, shapes: ['ten', 'dots'], palette: FIREWORK_COLOURS.gold, height: 9 })
    }
    if (id === 'beacon_morse') {
      const steps = morseTimeline()
      morse = { start: time, steps, total: steps.reduce((sum, [on, off]) => sum + on + off, 0) }
    }
  })
  events.on('station-open', ({ id }) => {
    if (id !== cfg.birthdayStation || !birthdayToday()) return
    const area = gameWorld.areas.find((a) => a.id === id)
    const at = area?.position ?? vehicle.position
    confettiBurst({ x: at.x, y: groundY + 0.5, z: at.z }, cfg.confetti.burst * 0.7, 3, 13)
  })
  events.on('reset', () => {
    litBulbs.length = 0
    soft.clear()
    glow.clear()
  })

  // ---- frame ------------------------------------------------------------------

  const bufferSize = new THREE.Vector2()

  function update(dt) {
    const start = performance.now()
    group.visible = cfg.enabled
    if (!cfg.enabled) return
    time += dt
    soft.update(dt)
    glow.update(dt)
    tyres(dt)
    boost(dt)
    goldenTrail(dt)
    twinkles(dt)
    glows()
    soft.upload()
    glow.upload()
    ribbons.update(dt)
    renderer.getDrawingBufferSize(bufferSize)
    fireworks.update(dt, camera, bufferSize.y, reducedMotion())
    stamp.update(dt)
    portal?.update(dt, time)
    floaters.update(dt)
    const ms = performance.now() - start
    stats.cpuMs += (ms - stats.cpuMs) * 0.05
    stats.peakMs = Math.max(stats.peakMs * 0.995, ms)
  }

  return {
    group,
    update,
    stats,
    get reducedMotion() {
      return reducedMotion()
    },
    /** For tests and the debug tools: fire any burst by hand. */
    debug: { impact, pickup, confettiBurst, stampAt, fireworksShow, emit: (type, detail) => events.emit(type, detail) },
    get counts() {
      return { soft: soft.count, glow: glow.count, confetti: soft.live('confetti'), dust: soft.live('dust'), fireworks: fireworks.active }
    },
  }
}
