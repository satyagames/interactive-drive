import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Development only (`#debug` in a dev build): checks the navigation features
 * added on 2026-11-13 through their real paths -- synthetic key and pointer
 * events on the window and canvas, the real loop stepped by hand.
 *
 *   A  render interpolation   rendered car speed under uneven ~144 Hz frames,
 *                             the chase camera, teleports, drop-ins, menu pause
 *   B  drag-to-pan            grab accuracy, idle hold, return, F, Explore, limit
 *   E  map-look UX (R1)       HUD / minimap / joystick guards, pinch, double-click,
 *                             the Back to car chip, minimap click, Alt + arrows,
 *                             Overview, reduced motion
 *   C  camera zones           pitch and tilt-shift ease in and out, never snap
 *   D  flicker sweep          3 renders with 4 mm camera nudges at every gateway
 *
 * Frames are stepped with `loop.step(dt)` and (outside D) nothing is drawn, so
 * it runs the same in a hidden or throttled tab and does not depend on how
 * fast the GPU is. It never waits on requestAnimationFrame.
 *
 * It moves the car through district gateways, so it can stamp your passport;
 * use Passport -> Reset progress afterwards. The game must be started and the
 * menu closed.
 *
 * Returns `{ passed, rows, notes, captures }`; `rows` is the pass/fail table.
 * With `captureFlicker: true`, `captures[viewId]` is a PNG data URL of the worst
 * flickering block in that view: the three nudged frames side by side, x4.
 */
export async function runNavTest({
  loop, vehicle, cameraRig, camera, canvas, renderer, scene, post, world, RAPIER, gameWorld, reveal,
  menu = null, panChip = null, announcer = null,
  isReady = () => true, sections = 'ABECD', restart = true, captureFlicker = false,
}) {
  const rows = []
  const notes = []
  const captures = {}
  const row = (id, check, measured, limit, pass) => rows.push({ id, check, measured, limit, pass })
  const round = (v, d = 3) => Number(v.toFixed(d))
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0))

  if (!isReady()) {
    return { passed: false, rows, notes: ['Not run: press Start and close the menu first.'] }
  }

  const iso = settings.isoCamera
  const saved = {
    interpolate: settings.render.interpolate, cameraMode: settings.cameraMode, render: post.render,
    reducedMotion: settings.vfx.reducedMotion, forceTouch: settings.debug.forceTouchControls,
  }
  // Ground level: taken mid-drop (a run straight after another) it would stack the respawn height.
  const homeSpawn = { position: vehicle.position.clone().setY(0.6), quaternion: vehicle.quaternion.clone() }

  loop.stop()
  // Every district in place first: the clear spots and straights found below
  // must not be where an outer district is about to stream in.
  await gameWorld.streamRest()
  settings.cameraMode = 'iso'
  cameraRig.clearFocus()
  // Nothing is judged by eye here: skip the draw so the test takes seconds.
  post.render = () => {}
  // A few physics steps so shape queries see colliders that have only just streamed in.
  for (let i = 0; i < 6; i++) loop.step(1 / 60)

  // ---- helpers ------------------------------------------------------------

  /** Deterministic uneven frame times around `hz` (+-`jitter`), mulberry32. */
  function frameTimes(hz, jitter = 0.35, seed = 20261113) {
    let a = seed
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return () => (1 / hz) * (1 + (rand() * 2 - 1) * jitter)
  }

  function stepFor(seconds, hz = 30, each = null) {
    const frames = Math.max(1, Math.round(seconds * hz))
    for (let i = 0; i < frames; i++) {
      loop.step(1 / hz)
      each?.(1 / hz)
    }
  }

  /** Dispatches a key event on the window; returns the event (for `defaultPrevented`). */
  const key = (type, code, init = {}) => {
    const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init })
    window.dispatchEvent(event)
    return event
  }
  const pointer = (type, x, y, { id = 1, kind = 'mouse', target = canvas } = {}) => target.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: kind, isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true,
  }))

  const shape = new RAPIER.Cuboid(1.3, 0.5, 1.9)
  const identity = { x: 0, y: 0, z: 0, w: 1 }
  /** No collider (static or prop) where the car would sit, and no area or trigger nearby. */
  function clearAt(x, z, margin = 5) {
    const hit = world.intersectionWithShape(
      { x, y: 0.9, z }, identity, shape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, vehicle.body,
    )
    if (hit) return false
    const near = (list) => list.some((e) => Math.hypot(e.position.x - x, e.position.z - z) <
      Math.hypot(e.halfExtents.x, e.halfExtents.z) + margin)
    return !near(gameWorld.areas) && !near(gameWorld.triggers)
  }
  const inZone = (x, z, pad = 0) => iso.zones.find((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + pad)

  /** Put the car at rest (or moving at `speed`) at x, z facing `yaw`; not a respawn, so no drop. */
  function place(x, z, yaw = 0, speed = 0) {
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    vehicle.body.setTranslation({ x, y: 0.5, z }, true)
    vehicle.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
    vehicle.body.setLinvel({ x: fx * speed, y: 0, z: fz * speed }, true)
    vehicle.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  /** A straight of `length` m clear of everything and of the camera zones. */
  function findStraight(length) {
    for (const radius of [100, 110, 85, 70, 55, 120, 40]) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2
        const sx = Math.sin(a) * radius
        const sz = Math.cos(a) * radius
        for (const yaw of [a + Math.PI / 2, a - Math.PI / 2, a, a + Math.PI]) {
          const fx = -Math.sin(yaw)
          const fz = -Math.cos(yaw)
          let ok = true
          for (let d = 0; d <= length && ok; d += 1.5) {
            const x = sx + fx * d
            const z = sz + fz * d
            ok = Math.hypot(x, z) < 135 && !inZone(x, z, 6) && clearAt(x, z)
          }
          if (ok) return { x: sx, z: sz, yaw }
        }
      }
    }
    return null
  }

  /** A clear spot within `reach` m of x, z (optionally one that must stay inside a zone). */
  function findSpot(x, z, reach, accept = () => true) {
    for (let r = 0; r <= reach; r += 2) {
      for (let k = 0; k < (r === 0 ? 1 : 12); k++) {
        const a = (k / 12) * Math.PI * 2
        const px = x + Math.sin(a) * r
        const pz = z + Math.cos(a) * r
        if (accept(px, pz) && clearAt(px, pz, 3)) return { x: px, z: pz }
      }
    }
    return null
  }

  const raycaster = new THREE.Raycaster()
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ndc = new THREE.Vector2()
  /** Floor point under a client-space pixel, with the camera as it is now. */
  function floorAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    camera.updateMatrixWorld()
    raycaster.setFromCamera(ndc, camera)
    return raycaster.ray.intersectPlane(floor, new THREE.Vector3())
  }
  const rect = canvas.getBoundingClientRect()
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const viewCentre = () => floorAt(centre.x, centre.y)
  /** How far the middle of the view is from the car, on the floor, m. */
  const viewOffset = () => {
    const v = viewCentre()
    return Math.hypot(v.x - vehicle.position.x, v.z - vehicle.position.z)
  }
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

  /** Drag from the canvas centre by (dx, dy) pixels in `moves` steps; returns the end pixel. */
  function dragBy(dx, dy, { moves = 8, release = true } = {}) {
    pointer('pointerdown', centre.x, centre.y)
    for (let i = 1; i <= moves; i++) {
      pointer('pointermove', centre.x + (dx * i) / moves, centre.y + (dy * i) / moves)
      loop.step(1 / 60)
    }
    if (release) pointer('pointerup', centre.x + dx, centre.y + dy)
    return { x: centre.x + dx, y: centre.y + dy }
  }

  function settleAt(spot, yaw = 0) {
    place(spot.x, spot.z, yaw)
    cameraRig.recenter()
    cameraRig.reset()
    stepFor(2, 20)
  }

  const straight = findStraight(48)
  if (!straight) notes.push('No clear 48 m straight found: section A skipped, B and C use the current position.')
  const base = straight ?? { x: vehicle.position.x, z: vehicle.position.z, yaw: 0 }

  try {
    // ---- A: interpolation ---------------------------------------------------
    if (sections.includes('A') && straight) {
      const measure = (interpolate) => {
        settings.render.interpolate = interpolate
        place(straight.x, straight.z, straight.yaw, vehicle.topSpeed * 0.98)
        cameraRig.reset()
        const next = frameTimes(144)
        key('keydown', 'KeyW')
        const car = []
        const cam = []
        const lastCar = new THREE.Vector3()
        const lastCam = new THREE.Vector3()
        let t = 0
        while (t < 2.2) {
          const dt = next()
          loop.step(dt)
          t += dt
          // The first 0.7 s lets the launch and the camera lag settle.
          if (t > 0.7) {
            car.push(vehicle.position.distanceTo(lastCar) / dt)
            cam.push(camera.position.distanceTo(lastCam) / dt)
          }
          lastCar.copy(vehicle.position)
          lastCam.copy(camera.position)
        }
        key('keyup', 'KeyW')
        // Drop the first sample (its "last" position predates the window).
        return { car: variation(car.slice(1)), cam: jitter(cam.slice(1)), mean: mean(car.slice(1)) }
      }
      const off = measure(false)
      const on = measure(true)
      row('A1', 'Car speed variation, uneven 144 Hz, interpolation on (CV)', round(on.car, 4), '< 0.01', on.car < 0.01)
      row('A2', 'Camera frame-to-frame speed jitter, same run (relative)', round(on.cam, 4), '< 0.01', on.cam < 0.01)
      row('A3', 'Control: the same run with interpolation off (CV)', round(off.car, 4), '> 0.1 (test can tell)', off.car > 0.1)
      notes.push(`A: mean rendered speed ${round(on.mean, 2)} m/s on a straight from (${round(straight.x, 1)}, ${round(straight.z, 1)}).`)
      settings.render.interpolate = saved.interpolate

      // A4: the chase camera under the same uneven frames.
      settings.cameraMode = 'chase'
      const chase = measure(true)
      settings.cameraMode = 'iso'
      row('A4', 'Chase camera frame-to-frame speed jitter, uneven 144 Hz (relative)', round(chase.cam, 4), '< 0.01', chase.cam < 0.01)

      // A5: a teleport that bypasses vehicle.respawn is never blended. Frames
      // far shorter than a physics step, so at least one draws between steps.
      place(straight.x, straight.z, straight.yaw)
      stepFor(0.5, 60)
      const jump = { x: straight.x * 0.5, z: straight.z * 0.5 }
      place(jump.x, jump.z, straight.yaw)
      let smear = 0
      for (let i = 0; i < 3; i++) {
        loop.step(0.0004)
        smear = Math.max(smear, Math.hypot(vehicle.position.x - jump.x, vehicle.position.z - jump.z))
      }
      row('A5', 'Teleport without respawn(): rendered car is at the new place (worst miss over 3 sub-step frames, m)',
        round(smear, 3), '< 0.05', smear < 0.05)

      // A6: a prop that was awake, then drops in from 2 m (under the distance
      // guard): its instance is drawn at the top of the drop, not smeared.
      const prop = gameWorld.props.props.find((p) => !p.buoyancy && !p.body.isKinematic() && p.batch)
      if (prop) {
        const m = new THREE.Matrix4()
        const at = new THREE.Vector3()
        const instanceY = () => {
          prop.batch.mesh.getMatrixAt(prop.index, m)
          return at.setFromMatrixPosition(m).y
        }
        const restY = instanceY()
        prop.body.wakeUp()
        stepFor(0.1, 60)
        gameWorld.props.dropIn(prop, { height: 2, delay: 0.2, duration: 0.3 })
        let worst = 0
        for (let i = 0; i < 3; i++) {
          loop.step(0.0004)
          worst = Math.max(worst, Math.abs(instanceY() - (restY + 2)))
        }
        stepFor(1, 60)
        const landed = Math.abs(instanceY() - restY)
        row('A6', 'Prop drop-in start: drawn at the top of the drop (worst miss, m), then lands at rest (m)',
          `${round(worst, 3)}, ${round(landed, 3)}`, '< 0.05, < 0.05', worst < 0.05 && landed < 0.05)
      }

      // A7: menu pause and resume. Paused frames move nothing; the first
      // frame after resuming moves the car one frame, not the length of the pause.
      if (menu) {
        place(straight.x, straight.z, straight.yaw, vehicle.topSpeed * 0.9)
        key('keydown', 'KeyW')
        stepFor(0.5, 144)
        const before = vehicle.position.clone()
        menu.show()
        for (let i = 0; i < 30; i++) loop.step(0.1)
        const frozen = vehicle.position.distanceTo(before)
        menu.hide()
        loop.step(1 / 144)
        const resumed = vehicle.position.distanceTo(before)
        key('keyup', 'KeyW')
        const allowed = vehicle.topSpeed * (1 / 144) * 1.5
        row('A7', 'Menu pause: car still while paused (m); first frame after resume moves one frame (m)',
          `${round(frozen, 4)}, ${round(resumed, 3)}`, `0, <= ${round(allowed, 3)}`, frozen === 0 && resumed <= allowed)
      }
      await pause()
    }

    // ---- B: drag-to-pan -----------------------------------------------------
    if (sections.includes('B')) {
      settleAt(base, base.yaw)
      const dx = -rect.width * 0.25
      const dy = rect.height * 0.15

      // B1: the grabbed floor point stays under the pointer.
      const before = viewCentre()
      const grabbed = floorAt(centre.x, centre.y)
      const end = dragBy(dx, dy, { release: false })
      stepFor(0.2, 60)
      const slip = flat(floorAt(end.x, end.y), grabbed)
      const moved = flat(viewCentre(), before)
      pointer('pointerup', end.x, end.y)
      row('B1', 'Drag moves the view (m)', round(moved, 2), '> 1', moved > 1)
      row('B2', 'Grabbed point stays under the pointer (m)', round(slip, 3), '< 0.2', slip < 0.2)

      // B3: idle keeps the pan.
      const held = viewCentre()
      stepFor(3, 30)
      const drift = flat(viewCentre(), held)
      row('B3', 'Idle for 3 s keeps the pan (drift, m)', round(drift, 3), '< 0.05', drift < 0.05)

      // B4: a driving input brings it back. The brake is held so the car stays put
      // and the offset is the pan alone (throttle would add the follow lag).
      const timeHome = (limit = 4) => {
        const next = frameTimes(144)
        let t = 0
        while (t < limit) {
          const dt = next()
          loop.step(dt)
          t += dt
          if (viewOffset() < 0.25) return t
        }
        return Infinity
      }
      const startOffset = viewOffset()
      key('keydown', 'Space')
      const back = timeHome()
      key('keyup', 'Space')
      row('B4', `Driving input returns a ${round(startOffset, 0)} m pan (s)`, round(back, 2), '< 1.5', back < 1.5)

      // B5: the same from a long pan (several drags, as after zooming out).
      stepFor(0.5)
      for (let i = 0; i < 6; i++) dragBy(dx * 1.6, dy * 1.6)
      const farOffset = viewOffset()
      key('keydown', 'Space')
      const farBack = timeHome()
      key('keyup', 'Space')
      row('B5', `Driving input returns a ${round(farOffset, 0)} m pan (s)`, round(farBack, 2), '< 1.5', farBack < 1.5)

      // B6: F re-centres (through the keyboard, as a visitor would).
      stepFor(0.5)
      dragBy(dx, dy)
      const pannedBy = viewOffset()
      key('keydown', 'KeyF')
      key('keyup', 'KeyF')
      stepFor(1, 60)
      const afterF = viewOffset()
      row('B6', `F re-centres a ${round(pannedBy, 0)} m pan within 1 s (offset left, m)`, round(afterF, 2), '< 0.25', afterF < 0.25)
      cameraRig.recenter()
      stepFor(1)

      // B7: Explore focus clears the pan and lands on its point; closing returns to the car.
      dragBy(dx, dy)
      const target = { x: base.x * 0.6, z: base.z * 0.6 }
      cameraRig.focusOn([target.x, 0, target.z])
      stepFor(iso.flyDuration + 1, 60)
      const focusMiss = flat(viewCentre(), target)
      cameraRig.clearFocus()
      stepFor(iso.flyDuration + 1.5, 60)
      const homeMiss = viewOffset()
      row('B7', 'Explore focus lands on its point despite a pan (miss, m)', round(focusMiss, 2), '< 0.3', focusMiss < 0.3)
      row('B8', 'Leaving Explore returns to the car with no pan left (m)', round(homeMiss, 2), '< 0.3', homeMiss < 0.3)

      // B9: the arena limit. Drag the same way until the view stops moving.
      let reach = 0
      for (let i = 0; i < 20; i++) {
        dragBy(0, -rect.height * 0.35, { moves: 4 })
        loop.step(1 / 60)
        const v = viewCentre()
        reach = Math.max(reach, Math.hypot(v.x, v.z))
      }
      const limit = iso.pan.maxRadius
      const reached = reach > limit - 1
      row('B9', `Arena limit ${limit} m holds (furthest view centre, m)`, round(reach, 2),
        `> ${limit - 1} and <= ${limit + 0.2}`, reached && reach <= limit + 0.2)
      if (!reached) notes.push('B9: 20 drags did not reach the limit, so it was not exercised.')
      cameraRig.recenter()
      cameraRig.reset()
      await pause()
    }

    // ---- E: map-look UX (doc 11 R1) ------------------------------------------
    if (sections.includes('E')) {
      settleAt(base, base.yaw)
      const dx = -rect.width * 0.25
      const dy = rect.height * 0.15
      const isoCam = cameraRig.modes.iso
      const home = () => {
        cameraRig.recenter()
        cameraRig.reset()
        stepFor(0.5, 30)
      }
      /** A press and drag on the canvas starting at a client point; returns how far the view moved, m. */
      const dragFrom = (x, y, options) => {
        const before = viewCentre()
        pointer('pointerdown', x, y, options)
        for (let i = 1; i <= 6; i++) {
          pointer('pointermove', x + i * 20, y - i * 12, options)
          loop.step(1 / 60)
        }
        pointer('pointerup', x + 120, y - 72, options)
        loop.step(1 / 60)
        return flat(viewCentre(), before)
      }
      const middle = (el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }
      }

      // E1 / E2: presses that land on the HUD or the minimap never pan (those
      // blocks let pointer events through to the canvas, so the camera must refuse them).
      for (const [id, selector] of [['E1', '#game-hud'], ['E2', '#minimap figcaption']]) {
        const el = document.querySelector(selector)
        const m = el && middle(el)
        if (!m || !m.r.width) {
          row(id, `A drag starting on ${selector} does not pan`, 'element not on screen', '-', false)
          continue
        }
        const moved = dragFrom(m.x, m.y)
        row(id, `A drag starting on ${selector} does not pan (view moved, m)`, round(moved, 3), '< 0.01', moved < 0.01)
        home()
      }

      // E3 and E4 need the touch pad on screen.
      settings.debug.forceTouchControls = true
      loop.step(1 / 60)
      const stick = document.querySelector('#touch [data-joystick]')
      if (stick && stick.getBoundingClientRect().width) {
        const j = middle(stick)
        // E3: just outside the ring, inside the guard margin.
        const moved = dragFrom(j.r.right + iso.pan.joystickMargin * 0.5, j.y, { id: 31, kind: 'touch' })
        row('E3', 'A touch just outside the joystick ring does not pan (view moved, m)', round(moved, 3), '< 0.01', moved < 0.01)
        home()

        // E4: a thumb on the joystick is not the "second finger": one finger on
        // the floor still pans and the zoom does not change.
        const zoomBefore = isoCam.zoom
        pointer('pointerdown', j.x, j.y, { id: 41, kind: 'touch', target: stick })
        const panned = dragFrom(centre.x, centre.y, { id: 42, kind: 'touch' })
        pointer('pointerup', j.x, j.y, { id: 41, kind: 'touch', target: stick })
        stepFor(0.5, 60)
        const zoomDrift = Math.abs(isoCam.zoom - zoomBefore)
        row('E4', 'Thumb on the joystick + one finger on the floor: pans (m), zoom unchanged', `${round(panned, 2)}, ${round(zoomDrift, 4)}`,
          '> 1, < 0.001', panned > 1 && zoomDrift < 0.001)
        home()
      } else {
        row('E3', 'Touch pad guards', 'touch pad not on screen', '-', false)
      }
      settings.debug.forceTouchControls = saved.forceTouch
      loop.step(1 / 60)

      // E5: two fingers on the floor pinch-zoom and do not pan.
      {
        const zoomBefore = isoCam.zoom
        const before = viewCentre()
        const a = { id: 51, kind: 'touch' }
        const b = { id: 52, kind: 'touch' }
        pointer('pointerdown', centre.x - 60, centre.y, a)
        pointer('pointerdown', centre.x + 60, centre.y, b)
        for (let i = 1; i <= 6; i++) {
          pointer('pointermove', centre.x - 60 - i * 10, centre.y, a)
          pointer('pointermove', centre.x + 60 + i * 10, centre.y, b)
          loop.step(1 / 60)
        }
        pointer('pointerup', centre.x - 120, centre.y, a)
        // The finger still down must not turn into a pan.
        for (let i = 1; i <= 6; i++) {
          pointer('pointermove', centre.x + 120 + i * 20, centre.y + i * 10, b)
          loop.step(1 / 60)
        }
        pointer('pointerup', centre.x + 240, centre.y + 60, b)
        stepFor(1, 60)
        const zoomed = zoomBefore - isoCam.zoom
        const slid = flat(viewCentre(), before)
        row('E5', 'Two fingers pinch out: zooms in (zoom change), view centre stays (m)', `${round(zoomed, 3)}, ${round(slid, 3)}`,
          '> 0.2, < 0.05', zoomed > 0.2 && slid < 0.05)
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: zoomed / iso.wheelSensitivity, bubbles: true }))
        stepFor(1.5, 60)
      }

      // E6: double-click on the floor re-centres.
      dragBy(dx, dy)
      {
        const pannedBy = viewOffset()
        for (let i = 0; i < 2; i++) {
          pointer('pointerdown', centre.x, centre.y)
          pointer('pointerup', centre.x, centre.y)
        }
        stepFor(1.2, 60)
        const left = viewOffset()
        row('E6', `Double-click re-centres a ${round(pannedBy, 0)} m pan within 1.2 s (offset left, m)`, round(left, 2), '< 0.25', left < 0.25)
        home()
      }

      // E7: the Back to car chip.
      if (panChip) {
        const button = document.getElementById('pan-home')
        const hiddenAtRest = button.hidden
        if (announcer) announcer.textContent = ''
        dragBy(dx, dy)
        loop.step(1 / 60)
        const shown = !button.hidden && button.getBoundingClientRect().width > 0
        const announced = announcer ? announcer.textContent.length > 0 : true
        button.focus()
        const focusable = document.activeElement === button
        // Enter on the focused button must be left to the button (not eaten as "interact").
        const enter = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true })
        button.dispatchEvent(enter)
        const enterFree = !enter.defaultPrevented
        button.click() // what Enter does on a native button
        stepFor(1.2, 60)
        const left = viewOffset()
        const gone = button.hidden
        const focusBack = document.activeElement === canvas
        row('E7', 'Back to car chip: hidden at rest, shown + announced when panned, focusable, Enter not swallowed, returns (m), hides, focus to canvas',
          `${hiddenAtRest}, ${shown}, ${announced}, ${focusable}, ${enterFree}, ${round(left, 2)}, ${gone}, ${focusBack}`, 'all true, < 0.25',
          hiddenAtRest && shown && announced && focusable && enterFree && left < 0.25 && gone && focusBack)
        home()
      }

      // E8: click a district on the minimap: the view pans there, the car stays.
      {
        const marker = document.querySelectorAll('#minimap .map__district')[1]
        const svg = document.querySelector('#minimap svg')
        if (marker && svg?.getBoundingClientRect().width) {
          const scale = 54 / 118 // minimap.js RADIUS / WORLD_RADIUS
          const goal = { x: Number(marker.getAttribute('cx')) / scale, z: Number(marker.getAttribute('cy')) / scale }
          const m = middle(marker)
          const carBefore = vehicle.position.clone()
          svg.dispatchEvent(new MouseEvent('click', { clientX: m.x, clientY: m.y, bubbles: true, cancelable: true }))
          stepFor(2, 60)
          const miss = flat(viewCentre(), goal)
          const carMoved = vehicle.position.distanceTo(carBefore)
          const markerOn = document.querySelector('#minimap .map__view')?.style.display !== 'none'
          // A driving key releases the pin and brings the view back.
          key('keydown', 'Space')
          stepFor(1.6, 60)
          key('keyup', 'Space')
          const back = viewOffset()
          row('E8', 'Minimap click pans to that point (miss, m); car does not move (m); view marker shown; driving returns (m)',
            `${round(miss, 2)}, ${round(carMoved, 3)}, ${markerOn}, ${round(back, 2)}`, '< 3.5, < 0.05, true, < 0.25',
            // A synthetic click lands on whole pixels, and one map pixel is 2.2 m.
            miss < 3.5 && carMoved < 0.05 && markerOn && back < 0.25)
        } else {
          row('E8', 'Minimap click pans', 'minimap not on screen', '-', false)
        }
        home()
      }

      // E9: Alt + arrow keys pan and never drive; the browser default is cancelled.
      {
        const carBefore = vehicle.position.clone()
        const before = viewCentre()
        const down = key('keydown', 'ArrowUp', { altKey: true })
        stepFor(0.5, 60)
        key('keyup', 'ArrowUp', { altKey: true })
        key('keyup', 'AltLeft')
        const moved = flat(viewCentre(), before)
        stepFor(1, 60)
        const carMoved = vehicle.position.distanceTo(carBefore)
        const held = flat(viewCentre(), before)
        row('E9', 'Alt + Up pans the view (m), default cancelled, car does not move (m), pan holds after release (m)',
          `${round(moved, 2)}, ${down.defaultPrevented}, ${round(carMoved, 3)}, ${round(held, 2)}`, '> 2, true, < 0.05, > 2',
          moved > 2 && down.defaultPrevented && carMoved < 0.05 && held > 2)
        home()
      }

      // E10: Overview (O) and back.
      {
        const zoomBefore = isoCam.zoom
        key('keydown', 'KeyO')
        key('keyup', 'KeyO')
        stepFor(3, 60)
        const v = viewCentre()
        const centreMiss = Math.hypot(v.x, v.z)
        const zoomAt = isoCam.zoom
        key('keydown', 'KeyO')
        key('keyup', 'KeyO')
        stepFor(3, 60)
        const zoomBack = Math.abs(isoCam.zoom - zoomBefore)
        const left = viewOffset()
        row('E10', 'O: zoom reaches the maximum, view over the arena centre (m); O again: zoom restored (diff), back on the car (m)',
          `${round(zoomAt, 3)}, ${round(centreMiss, 2)}, ${round(zoomBack, 3)}, ${round(left, 2)}`,
          `>= ${round(iso.maxZoom - 0.01, 2)}, < 0.5, < 0.01, < 0.25`,
          zoomAt >= iso.maxZoom - 0.01 && centreMiss < 0.5 && zoomBack < 0.01 && left < 0.25)
        home()
      }

      // E11: reduced motion: every pan and zoom transition lands in one frame.
      {
        settings.vfx.reducedMotion = true
        const zoomBefore = isoCam.zoom
        dragBy(dx, dy)
        key('keydown', 'KeyF')
        key('keyup', 'KeyF')
        loop.step(1 / 60)
        const afterF = viewOffset()
        key('keydown', 'KeyO')
        key('keyup', 'KeyO')
        loop.step(1 / 60)
        const v = viewCentre()
        const overviewMiss = Math.hypot(v.x, v.z)
        const overviewZoom = isoCam.zoom
        key('keydown', 'KeyO')
        key('keyup', 'KeyO')
        loop.step(1 / 60)
        const backMiss = viewOffset()
        const zoomBack = Math.abs(isoCam.zoom - zoomBefore)
        settings.vfx.reducedMotion = saved.reducedMotion
        row('E11', 'Reduced motion, one frame each: F (m), O to the overview (m, zoom), O back (m, zoom diff)',
          `${round(afterF, 2)}, ${round(overviewMiss, 2)}, ${round(overviewZoom, 3)}, ${round(backMiss, 2)}, ${round(zoomBack, 3)}`,
          `< 0.25, < 0.5, ${iso.maxZoom}, < 0.25, < 0.001`,
          afterF < 0.25 && overviewMiss < 0.5 && Math.abs(overviewZoom - iso.maxZoom) < 1e-6 && backMiss < 0.25 && zoomBack < 0.001)
        home()
      }
      await pause()
    }

    // ---- C: zone camera angles ----------------------------------------------
    if (sections.includes('C')) {
      const forward = new THREE.Vector3()
      const pitchNow = () => THREE.MathUtils.radToDeg(Math.asin(-camera.getWorldDirection(forward).y))
      /** Step a transition and return its worst per-frame rate, reversals and end pitch. */
      const transition = (from, to) => {
        const next = frameTimes(144)
        const span = Math.abs(to - from)
        let last = pitchNow()
        let worstRate = 0
        let reversal = 0
        let firstFrame = null
        let t = 0
        let tiltLast = cameraRig.tiltShift
        let tiltStep = 0
        const tiltStart = tiltLast
        const sample = (dt) => {
          // Tilt-shift scale: the largest change in one frame, as a rate (1/s).
          tiltStep = Math.max(tiltStep, Math.abs(cameraRig.tiltShift - tiltLast) / dt)
          tiltLast = cameraRig.tiltShift
          const p = pitchNow()
          const change = p - last
          if (firstFrame === null) firstFrame = Math.abs(change)
          worstRate = Math.max(worstRate, Math.abs(change) / dt)
          if (Math.sign(change) === -Math.sign(to - from)) reversal = Math.max(reversal, Math.abs(change))
          last = p
        }
        while (t < 1.5) {
          const dt = next()
          loop.step(dt)
          t += dt
          sample(dt)
        }
        stepFor(3, 20, sample)
        return {
          worstRate, reversal, firstFrame, end: last, allowed: span * iso.zoneRate * 1.05 + 0.05,
          tiltStart, tiltEnd: tiltLast, tiltRate: tiltStep,
        }
      }
      for (const zone of iso.zones) {
        const spot = findSpot(zone.x, zone.z, zone.radius - 4, (x, z) => inZone(x, z, -3) === zone)
        if (!spot) {
          row(`C:${zone.id}`, 'Zone pitch eases in and out', 'no clear spot in the zone', '-', false)
          continue
        }
        settleAt(base, base.yaw)
        const rest = pitchNow()
        const zonePitch = zone.pitch ?? iso.pitch
        place(spot.x, spot.z)
        const enter = transition(rest, zonePitch)
        place(base.x, base.z, base.yaw)
        const leave = transition(zonePitch, iso.pitch)
        const smooth = (r) => r.worstRate <= r.allowed && r.reversal < 0.02
        row(`C:${zone.id}:in`, `Pitch eases ${round(rest, 1)} -> ${zonePitch} deg (worst deg/s, first frame deg, end)`,
          `${round(enter.worstRate, 1)}, ${round(enter.firstFrame, 3)}, ${round(enter.end, 2)}`,
          `<= ${round(enter.allowed, 1)} deg/s, ends within 0.3`, smooth(enter) && Math.abs(enter.end - zonePitch) < 0.3)
        row(`C:${zone.id}:out`, `Pitch eases back to ${iso.pitch} deg (worst deg/s, first frame deg, end)`,
          `${round(leave.worstRate, 1)}, ${round(leave.firstFrame, 3)}, ${round(leave.end, 2)}`,
          `<= ${round(leave.allowed, 1)} deg/s, ends within 0.3`, smooth(leave) && Math.abs(leave.end - iso.pitch) < 0.3)
        if (zone.tiltShift !== undefined) {
          // The blur scale eases with the pitch: never faster than zoneRate, and it arrives.
          const maxRate = iso.zoneRate * 1.05 + 0.01
          const ok = enter.tiltStart > 0.98 && Math.abs(enter.tiltEnd - zone.tiltShift) < 0.02 && leave.tiltEnd > 0.98 &&
            enter.tiltRate <= maxRate && leave.tiltRate <= maxRate
          row(`C:${zone.id}:blur`, `Tilt-shift scale 1 -> ${zone.tiltShift} -> 1 (in, out; worst rate in / out, 1/s)`,
            `${round(enter.tiltEnd, 3)}, ${round(leave.tiltEnd, 3)}; ${round(enter.tiltRate, 2)} / ${round(leave.tiltRate, 2)}`,
            `${zone.tiltShift}, 1; <= ${round(maxRate, 2)}`, ok)
        }
      }
      await pause()
    }

    // ---- D: flicker sweep ---------------------------------------------------
    if (sections.includes('D')) {
      await gameWorld.streamRest()
      for (const id of reveal.pending) reveal.revealDistrict(id)
      stepFor(5, 30) // reveals scale in, props drop and settle

      const width = 960
      const height = Math.max(2, Math.round(width / camera.aspect))
      const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true })
      const frames = [0, 1, 2].map(() => new Uint8Array(width * height * 4))
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      const home = new THREE.Vector3()
      const CELL = 8
      const cols = Math.floor(width / CELL)
      const cellRows = Math.floor(height / CELL)
      const counts = new Uint16Array(cols * cellRows)

      const shoot = (into) => {
        camera.updateMatrixWorld()
        renderer.setRenderTarget(target)
        renderer.clear()
        renderer.render(scene, camera)
        renderer.readRenderTargetPixels(target, 0, 0, width, height, into)
      }

      // Every district gateway, plus the views the camera zones tilt over and the start.
      const views = [
        ...gameWorld.triggers.filter((t) => t.name.startsWith('trigger_stamp_'))
          .map((t) => ({ id: t.name.slice('trigger_stamp_'.length), x: t.position.x, z: t.position.z })),
        ...iso.zones.map((zone) => ({ id: `zone_${zone.id}`, x: zone.x, z: zone.z })),
        { id: 'start', x: homeSpawn.position.x, z: homeSpawn.position.z },
      ]

      /** The three frames around block `index`, 64 px square each, magnified x4, as a PNG data URL. */
      const cropOf = (index) => {
        const SIZE = 64
        const cx = (index % cols) * CELL + CELL / 2
        const cy = Math.floor(index / cols) * CELL + CELL / 2
        const x0 = Math.min(Math.max(Math.round(cx - SIZE / 2), 0), width - SIZE)
        const y0 = Math.min(Math.max(Math.round(cy - SIZE / 2), 0), height - SIZE)
        const small = document.createElement('canvas')
        small.width = SIZE * 3
        small.height = SIZE
        const g = small.getContext('2d')
        frames.forEach((frame, k) => {
          const image = g.createImageData(SIZE, SIZE)
          for (let y = 0; y < SIZE; y++) {
            // Render-target rows run bottom-up.
            const from = ((y0 + SIZE - 1 - y) * width + x0) * 4
            image.data.set(frame.subarray(from, from + SIZE * 4), y * SIZE * 4)
          }
          for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255
          g.putImageData(image, k * SIZE, 0)
        })
        const big = document.createElement('canvas')
        big.width = small.width * 4
        big.height = small.height * 4
        const bg = big.getContext('2d')
        bg.imageSmoothingEnabled = false
        bg.drawImage(small, 0, 0, big.width, big.height)
        return big.toDataURL('image/png')
      }

      /** Blocks that flicker in the view from x, z: { solid, percent, where }. */
      const sweep = (view) => {
        const spot = findSpot(view.x, view.z, 12) ?? view
        place(spot.x, spot.z)
        cameraRig.recenter()
        cameraRig.reset()
        stepFor(1.5, 30)

        home.copy(camera.position)
        right.setFromMatrixColumn(camera.matrixWorld, 0)
        up.setFromMatrixColumn(camera.matrixWorld, 1)
        shoot(frames[0])
        camera.position.addScaledVector(right, 0.004)
        shoot(frames[1])
        camera.position.addScaledVector(up, 0.004)
        shoot(frames[2])
        camera.position.copy(home)
        camera.updateMatrixWorld()

        counts.fill(0)
        let changed = 0
        const [a, b, c] = frames
        for (let y = 0; y < cellRows * CELL; y++) {
          for (let x = 0; x < cols * CELL; x++) {
            const i = (y * width + x) * 4
            let d = 0
            for (let ch = 0; ch < 3; ch++) {
              d = Math.max(d, Math.abs(a[i + ch] - b[i + ch]), Math.abs(b[i + ch] - c[i + ch]), Math.abs(a[i + ch] - c[i + ch]))
            }
            if (d > 20) {
              changed += 1
              counts[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] += 1
            }
          }
        }
        let solid = 0
        let worst = -1
        for (let i = 0; i < counts.length; i++) {
          if (counts[i] >= CELL * CELL * 0.5) {
            solid += 1
            if (worst < 0 || counts[i] > counts[worst]) worst = i
          }
        }
        let where = ''
        if (worst >= 0) {
          // Render-target rows start at the bottom; client pixels at the top.
          const u = ((worst % cols) + 0.5) / cols
          const v = (Math.floor(worst / cols) + 0.5) / cellRows
          const p = floorAt(rect.left + u * rect.width, rect.top + (1 - v) * rect.height)
          if (p) where = `, worst near floor (${round(p.x, 1)}, ${round(p.z, 1)})`
          // Name what is drawn there: the first visible surface under that pixel,
          // and any other surface within 6 cm behind it (the pair that is fighting).
          ndc.set(u * 2 - 1, v * 2 - 1)
          raycaster.setFromCamera(ndc, camera)
          const hits = raycaster.intersectObjects(scene.children, true).filter((h) => {
            for (let o = h.object; o; o = o.parent) if (!o.visible) return false
            return true
          })
          const label = (h) => `"${h.object.name || h.object.parent?.name || h.object.type}" at (${round(h.point.x, 1)}, ${round(h.point.y, 3)}, ${round(h.point.z, 1)})`
          if (hits.length) {
            where += `, on ${label(hits[0])}`
            const close = hits.slice(1).filter((h) => h.distance - hits[0].distance < 0.06 && h.object !== hits[0].object)
            if (close.length) where += `, with ${close.slice(0, 2).map(label).join(' and ')} right behind`
          }
        }
        if (captureFlicker && worst >= 0) captures[`${view.id}@${round(cameraRig.modes.iso.zoom, 2)}`] = cropOf(worst)
        return { solid, percent: round((changed / (width * height)) * 100, 3), where }
      }

      // At the default zoom, then zoomed out fully: depth precision falls with
      // distance, so the overview is where coplanar surfaces start to fight.
      const wheel = (deltaY) => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true }))
      const zoomSteps = (iso.maxZoom - iso.defaultZoom) / iso.wheelSensitivity
      const near = views.map(sweep)
      wheel(zoomSteps)
      stepFor(2, 30)
      const far = views.map(sweep)
      views.forEach((view, i) => {
        const worst = far[i].solid >= near[i].solid ? far[i] : near[i]
        row(`D:${view.id}`, 'Flicker: 8x8 blocks at least half changed by 4 mm nudges (default zoom / zoomed out)',
          `${near[i].solid} / ${far[i].solid} blocks, ${near[i].percent}% / ${far[i].percent}% pixels${worst.where}`,
          '0 blocks', near[i].solid === 0 && far[i].solid === 0)
      })

      // Control 1, still zoomed out: plant two coplanar slabs of different
      // colours (the second turned 30 degrees, so its depth values round
      // differently) beside the car and sweep that view. If the sweep does not
      // see them fight, it proves nothing.
      const planted = new THREE.Group()
      for (const [colour, turn] of [[0x111111, 0], [0xf4f2ec, Math.PI / 6]]) {
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: colour }))
        slab.rotation.set(-Math.PI / 2, 0, turn)
        planted.add(slab)
      }
      const startView = views[views.length - 1]
      const plantSpot = findSpot(startView.x, startView.z, 12) ?? startView
      planted.position.set(plantSpot.x - 9, 1.2, plantSpot.z - 9)
      scene.add(planted)
      const plantedResult = sweep(startView)
      scene.remove(planted)
      for (const slab of planted.children) {
        slab.geometry.dispose()
        slab.material.dispose()
      }
      row('D:control', 'Control: two coplanar slabs planted in the start view are seen fighting (blocks)',
        `${plantedResult.solid} blocks`, '>= 1 (test can tell)', plantedResult.solid > 0)

      // Control 2 (a note, not a check): the depth offsets off every overlay
      // material (labels, shadows) and the near plane back at 0.1 m, the depth
      // precision before R1. Views that flicker then are what those two fixes hold back.
      const offsets = new Set()
      scene.traverse((object) => {
        for (const material of [object.material].flat()) if (material?.polygonOffset) offsets.add(material)
      })
      for (const material of offsets) material.polygonOffset = false
      const nearNow = iso.near
      iso.near = 0.1
      const seen = views.filter((view) => sweep(view).solid > 0).map((view) => view.id)
      iso.near = nearNow
      for (const material of offsets) material.polygonOffset = true
      notes.push(`D: with the overlay depth offsets off and the near plane at 0.1 m, ${seen.length} of ${views.length} views flicker${seen.length ? ` (${seen.join(', ')})` : ''}.`)
      wheel(-zoomSteps)
      stepFor(2, 30)

      renderer.setRenderTarget(null)
      target.dispose()
    }
  } finally {
    key('keyup', 'KeyW')
    key('keyup', 'Space')
    key('keyup', 'AltLeft')
    if (menu?.isOpen) menu.hide()
    settings.render.interpolate = saved.interpolate
    settings.cameraMode = saved.cameraMode
    settings.vfx.reducedMotion = saved.reducedMotion
    settings.debug.forceTouchControls = saved.forceTouch
    post.render = saved.render
    cameraRig.clearFocus()
    cameraRig.recenter()
    vehicle.respawn(homeSpawn)
    cameraRig.reset()
    if (restart) loop.start()
  }

  return { passed: rows.length > 0 && rows.every((r) => r.pass), rows, notes, captures }
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1)
}

/**
 * Frame-to-frame variation relative to the mean: like `variation`, but on
 * successive differences, so a slow trend (the look-ahead still settling)
 * does not count as judder.
 */
function jitter(values) {
  const m = mean(values)
  if (!m || values.length < 2) return Infinity
  const steps = values.slice(1).map((v, i) => v - values[i])
  return Math.sqrt(mean(steps.map((v) => v * v)) / 2) / m
}

/** Coefficient of variation: standard deviation over mean. */
function variation(values) {
  const m = mean(values)
  if (!m) return Infinity
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2))) / m
}
