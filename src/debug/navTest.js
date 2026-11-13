import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Development only (`#debug` in a dev build): checks the navigation features
 * added on 2026-11-13 through their real paths -- synthetic key and pointer
 * events on the window and canvas, the real loop stepped by hand.
 *
 *   A  render interpolation   rendered car speed under uneven ~144 Hz frames
 *   B  drag-to-pan            grab accuracy, idle hold, return, F, Explore, limit
 *   C  zone camera angles     pitch eases in and out, never snaps
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
 * Returns `{ passed, rows, notes }`; `rows` is the pass/fail table.
 */
export async function runNavTest({
  loop, vehicle, cameraRig, camera, canvas, renderer, scene, post, world, RAPIER, gameWorld, reveal,
  isReady = () => true, sections = 'ABCD', restart = true,
}) {
  const rows = []
  const notes = []
  const row = (id, check, measured, limit, pass) => rows.push({ id, check, measured, limit, pass })
  const round = (v, d = 3) => Number(v.toFixed(d))
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0))

  if (!isReady()) {
    return { passed: false, rows, notes: ['Not run: press Start and close the menu first.'] }
  }

  const iso = settings.isoCamera
  const saved = { interpolate: settings.render.interpolate, cameraMode: settings.cameraMode, render: post.render }
  const homeSpawn = { position: vehicle.position.clone(), quaternion: vehicle.quaternion.clone() }

  loop.stop()
  settings.cameraMode = 'iso'
  cameraRig.clearFocus()
  // Nothing is judged by eye here: skip the draw so the test takes seconds.
  post.render = () => {}

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

  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
  const pointer = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
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
        const sample = (dt) => {
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
        return { worstRate, reversal, firstFrame, end: last, allowed: span * iso.zoneRate * 1.05 + 0.05 }
      }
      for (const zone of iso.zones) {
        const spot = findSpot(zone.x, zone.z, zone.radius - 4, (x, z) => inZone(x, z, -3) === zone)
        if (!spot) {
          row(`C:${zone.id}`, 'Zone pitch eases in and out', 'no clear spot in the zone', '-', false)
          continue
        }
        settleAt(base, base.yaw)
        const rest = pitchNow()
        const distanceOut = cameraRig.modes.iso.distance
        place(spot.x, spot.z)
        const enter = transition(rest, zone.pitch)
        const distanceIn = cameraRig.modes.iso.distance
        place(base.x, base.z, base.yaw)
        const leave = transition(zone.pitch, iso.pitch)
        const smooth = (r) => r.worstRate <= r.allowed && r.reversal < 0.02
        row(`C:${zone.id}:in`, `Pitch eases ${round(rest, 1)} -> ${zone.pitch} deg (worst deg/s, first frame deg, end)`,
          `${round(enter.worstRate, 1)}, ${round(enter.firstFrame, 3)}, ${round(enter.end, 2)}`,
          `<= ${round(enter.allowed, 1)} deg/s, ends within 0.3`, smooth(enter) && Math.abs(enter.end - zone.pitch) < 0.3)
        row(`C:${zone.id}:out`, `Pitch eases back to ${iso.pitch} deg (worst deg/s, first frame deg, end)`,
          `${round(leave.worstRate, 1)}, ${round(leave.firstFrame, 3)}, ${round(leave.end, 2)}`,
          `<= ${round(leave.allowed, 1)} deg/s, ends within 0.3`, smooth(leave) && Math.abs(leave.end - iso.pitch) < 0.3)
        if (zone.zoom !== undefined && Math.abs(distanceIn - distanceOut) < 0.01) {
          notes.push(`C: zone "${zone.id}" declares zoom ${zone.zoom} but the camera distance did not change (${round(distanceIn, 2)} m).`)
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
        }
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

      // Control, still zoomed out: take the depth offset off every overlay
      // material (the label fix) and sweep again. If no view shows blocks, the
      // sweep proves nothing.
      const offsets = new Set()
      scene.traverse((object) => {
        for (const material of [object.material].flat()) if (material?.polygonOffset) offsets.add(material)
      })
      for (const material of offsets) material.polygonOffset = false
      const seen = views.filter((view) => sweep(view).solid > 0).map((view) => view.id)
      for (const material of offsets) material.polygonOffset = true
      row('D:control', 'Control: views that flicker with the overlay depth offsets removed',
        `${seen.length} of ${views.length}${seen.length ? ` (${seen.join(', ')})` : ''}`, '>= 1 (test can tell)', seen.length > 0)
      wheel(-zoomSteps)
      stepFor(2, 30)

      renderer.setRenderTarget(null)
      target.dispose()
    }
  } finally {
    key('keyup', 'KeyW')
    key('keyup', 'Space')
    settings.render.interpolate = saved.interpolate
    settings.cameraMode = saved.cameraMode
    post.render = saved.render
    cameraRig.clearFocus()
    cameraRig.recenter()
    vehicle.respawn(homeSpawn)
    cameraRig.reset()
    if (restart) loop.start()
  }

  return { passed: rows.length > 0 && rows.every((r) => r.pass), rows, notes }
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
