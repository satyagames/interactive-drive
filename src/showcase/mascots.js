import * as THREE from 'three'

import { settings } from '../config.js'
import { t } from '../content/ui.js'
import { loadGLTF } from '../core/gltf.js'
import { applyMatcapMaterials } from '../render/materials.js'

/**
 * Percy and the blob family (doc 10 §2.1): the 2D community's own mascots as
 * 3D guides, from `public/models/mascots.glb` (`npm run art:mascots`).
 *
 *   - Percy greets you at the RFP Gate; a buddy stands at each pillar's
 *     gateway, holding its section prop, and tells you where your next
 *     passport stamp is (the nearest district you haven't stamped).
 *   - Each one idles with a soft squash-and-stretch, turns to watch the car
 *     inside `mascotLookRadius`, waves inside `mascotWaveRadius`, and speaks
 *     inside `mascotTalkRadius` -- a speech bubble overlay (HTML, a polite
 *     live region, so screen readers hear it once per approach).
 *   - The Konami code: everyone does a celebration hop. The Decade Finale:
 *     they all leap to HQ and stay there round the tower.
 *
 * Each has a kinematic capsule so the car bumps into it rather than through
 * it, and a blob shadow. Reduced motion: no squash, no hops, the finale
 * gathering is a cut.
 */
export async function createMascots(ctx) {
  const { layout, exhibits, frames, world, RAPIER, renderAssets, game, overlayRoot, camera, blobs, seed } = ctx
  const data = exhibits?.mascots
  if (!data) return null
  let gltf
  try {
    gltf = await loadGLTF(layout.mascotsUrl)
  } catch (error) {
    console.warn('[showcase] mascots.glb failed to load; no mascots this visit', error)
    return null
  }
  applyMatcapMaterials(gltf.scene, renderAssets)
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  // Same rule as the VFX: 'auto' follows the OS setting, true/false override it.
  const reducedMotion = () => (settings.vfx.reducedMotion === 'auto' ? Boolean(motionQuery?.matches) : Boolean(settings.vfx.reducedMotion))

  const specs = [
    { ...data.percy, id: 'percy', role: 'percy' },
    ...data.buddies.map((b) => ({ ...b, role: 'buddy' })),
  ].filter((spec) => layout.mascots[spec.id])
  const characters = []
  const quat = new THREE.Quaternion()
  const v = new THREE.Vector3()
  let clock = 0

  function make(spec, info) {
    const place = layout.mascots[spec.id]
    const source = gltf.scene.getObjectByName(`blob_${spec.id}`)
    const frame = frames.get(place.district)
    if (!source || !frame) return
    const root = source.clone(true)
    root.name = `mascot:${spec.id}`
    const p = frame.toWorld(place.lx, place.lz)
    const yaw = frame.yaw(place.yaw)
    root.position.set(p.x, 0, p.z)
    root.rotation.set(0, yaw, 0)
    info.staticGroup.add(root)
    const scale = source.scale.x
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, 0, p.z))
    world.createCollider(RAPIER.ColliderDesc.capsule(0.4 * scale, 0.5 * scale).setTranslation(0, 0.9 * scale, 0), rb)
    const shadow = blobs.add({ sizeX: 1.9 * scale, sizeZ: 1.9 * scale, alpha: 0.75 })
    blobs.set(shadow, root.position, quat.identity())
    characters.push({
      spec,
      info,
      root,
      body: root.getObjectByName(`blob_${spec.id}_body`),
      armL: root.getObjectByName(`blob_${spec.id}_arm_L`),
      armR: root.getObjectByName(`blob_${spec.id}_arm_R`),
      scale,
      yaw,
      homeYaw: yaw,
      home: root.position.clone(),
      rb,
      shadow,
      phase: characters.length * 1.7,
      wave: 0,
      hop: null,
      travel: null,
    })
  }

  // --- the Decade Finale: everyone gathers round the HQ tower -------------
  function hqSpot(index) {
    const a = ((30 + index * 60) * Math.PI) / 180
    return new THREE.Vector3(Math.sin(a) * layout.finaleRing, 0, Math.cos(a) * layout.finaleRing)
  }
  function gather({ animate }) {
    characters.forEach((c, i) => {
      const to = hqSpot(i)
      ctx.group.attach(c.root)
      const faceOut = Math.atan2(to.x, to.z)
      if (animate && !reducedMotion()) {
        c.travel = { from: c.root.position.clone(), to, time: -i * 0.18, duration: 1.8, height: 22 }
      } else {
        c.root.position.copy(to)
        c.rb.setNextKinematicTranslation(to)
      }
      c.home.copy(to)
      c.homeYaw = faceOut
    })
  }
  game.events.on('finale', () => gather({ animate: true }))

  function hop(c, delay = 0) {
    if (reducedMotion()) return
    c.hop = { time: -delay, count: 3, duration: 0.42, height: 0.9 * c.scale }
  }
  game.events.on('easter-egg', ({ id }) => {
    if (id === 'konami') characters.forEach((c, i) => hop(c, i * 0.08))
  })

  // --- the speech bubble ----------------------------------------------------
  let speaking = null
  let spoken = ''
  const nameEl = document.createElement('strong')
  const textEl = document.createElement('span')
  if (overlayRoot) overlayRoot.replaceChildren(nameEl, textEl)

  function lineFor(c, car) {
    if (c.spec.role === 'percy') return c.spec.greeting
    let best = null
    let bestD = Infinity
    for (const s of game.progression.stamps) {
      if (s.stamped) continue
      const d = Math.hypot(s.district.position[0] - car.position.x, s.district.position[2] - car.position.z)
      if (d < bestD) {
        bestD = d
        best = s.district
      }
    }
    return best ? t('showcase.buddyHint', { place: best.name }) : t('showcase.buddyDone')
  }

  function bubble(c, car) {
    if (!overlayRoot) return
    if (!c) {
      if (speaking) {
        overlayRoot.hidden = true
        speaking = null
        spoken = ''
      }
      return
    }
    const line = lineFor(c, car)
    if (c !== speaking || line !== spoken) {
      speaking = c
      spoken = line
      nameEl.textContent = c.spec.name ?? ''
      nameEl.hidden = !c.spec.name
      textEl.textContent = line
      overlayRoot.style.setProperty('--speaker', c.spec.role === 'percy' ? seed.hq.color : ctx.colorOf(c.spec.district))
      overlayRoot.hidden = false
    }
    v.set(c.root.position.x, c.root.position.y + 2.35 * c.scale, c.root.position.z).project(camera)
    if (v.z > 1) {
      overlayRoot.style.visibility = 'hidden'
      return
    }
    overlayRoot.style.visibility = ''
    const x = (v.x * 0.5 + 0.5) * window.innerWidth
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight
    overlayRoot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
  }

  return {
    name: 'mascots',
    districts: [...new Set(specs.map((s) => layout.mascots[s.id].district))],
    build(info) {
      for (const spec of specs) if (layout.mascots[spec.id].district === info.id) make(spec, info)
      // After a finished passport the family lives at HQ.
      if (game.store.state.finale) gather({ animate: false })
    },
    update(dt, car) {
      clock += dt
      const s = settings.showcase
      const calm = reducedMotion()
      let speaker = null
      let speakerD = Infinity
      for (const c of characters) {
        let y = 0
        let squash = calm ? 0 : Math.sin(clock * 2.4 + c.phase) * s.mascotSquash
        if (c.travel) {
          const tr = c.travel
          tr.time += dt
          const u = Math.min(Math.max(tr.time / tr.duration, 0), 1)
          c.root.position.lerpVectors(tr.from, tr.to, u)
          y = tr.height * 4 * u * (1 - u)
          if (u >= 1) c.travel = null
        } else if (c.hop) {
          const h = c.hop
          h.time += dt
          if (h.time >= 0) {
            const n = Math.floor(h.time / h.duration)
            if (n >= h.count) c.hop = null
            else {
              const u = (h.time % h.duration) / h.duration
              y = h.height * 4 * u * (1 - u)
              // Stretch in the air, squash on the landing.
              squash = u < 0.15 || u > 0.85 ? -0.12 : 0.1
            }
          }
        }
        c.root.position.y = y
        if (c.travel || c.hop || y > 0) c.rb.setNextKinematicTranslation(c.root.position)
        const visible = c.root.parent === ctx.group || c.info.staticGroup.visible
        if (visible) blobs.set(c.shadow, c.root.position, quat.identity())
        else blobs.hide(c.shadow)

        const dx = car.position.x - c.root.position.x
        const dz = car.position.z - c.root.position.z
        const d = Math.hypot(dx, dz)
        const target = d < s.mascotLookRadius ? Math.atan2(dx, dz) : c.homeYaw
        c.yaw = dampAngle(c.yaw, target, s.mascotTurnRate, dt)
        c.root.rotation.y = c.yaw
        if (c.body) c.body.scale.set(1 - squash / 2, 1 + squash, 1 - squash / 2)
        const waving = d < s.mascotWaveRadius ? 1 : 0
        c.wave += (waving - c.wave) * (1 - Math.exp(-6 * dt))
        if (c.armR) c.armR.rotation.z = c.wave * (1.25 + (calm ? 0 : 0.45 * Math.sin(clock * 10 + c.phase)))
        if (c.armL) c.armL.rotation.z = calm ? 0 : -0.12 * Math.sin(clock * 2.4 + c.phase)

        if (visible && d < s.mascotTalkRadius && d < speakerD) {
          speaker = c
          speakerD = d
        }
      }
      bubble(speaker, car)
    },
    get count() {
      return characters.length
    },
  }
}

function dampAngle(from, to, rate, dt) {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * (1 - Math.exp(-rate * dt))
}
