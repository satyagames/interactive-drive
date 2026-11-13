import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * The badges that come from how you drive rather than a district game
 * (doc 03 §2.6), and the easter eggs (§2.7):
 *
 *   first_drive   drive `game.firstDriveDistance` m
 *   airtime       stay airborne `game.airtimeSeconds` s in one go
 *   loop_the_0    pass through HQ's "0" (`trigger_loop_zero`)
 *
 *   Konami code (↑↑↓↓←→←→BA)        -> the golden "Decade Edition" skin
 *   honk 10 times at HQ               -> the tower beacon flashes "10" in Morse
 *   10 passes through the "0"         -> the v_final_FINAL_v10 trophy drops
 *
 * Effects the eggs trigger (beacon flash, trail of 10s, confetti) are events
 * for the VFX/SFX phases; the trophy is a real physics prop.
 */
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']
const HQ_RADIUS = 25
/** Leaving the ground faster than this (m/s, horizontal) is a launch. */
const LAUNCH_SPEED = 5

export function createAchievements({ events, progression, store, scene, world, RAPIER, renderAssets }) {
  const counters = () => store.state.counters
  let airborneFor = 0
  // The car starts the session mid-drop: treat that as already airborne.
  let wasAirborne = true
  let launched = false
  let hornsHere = 0
  let konami = 0
  const last = new THREE.Vector3()
  let hasLast = false

  const onKey = (event) => {
    konami = event.code === KONAMI[konami] ? konami + 1 : event.code === KONAMI[0] ? 1 : 0
    if (konami === KONAMI.length) {
      konami = 0
      progression.unlockSkin('golden')
      progression.setSkin('golden')
      events.emit('easter-egg', { id: 'konami' })
    }
  }
  window.addEventListener('keydown', onKey)

  function update(dt, car) {
    // First Drive: real distance only (a respawn or teleport doesn't count).
    if (hasLast) {
      const step = Math.hypot(car.position.x - last.x, car.position.z - last.z)
      if (step < 3) {
        counters().distance = (counters().distance ?? 0) + step
        if (counters().distance >= settings.game.firstDriveDistance) progression.awardBadge('first_drive')
      }
    }
    last.copy(car.position)
    hasLast = true

    // Airtime counts only a real launch: leaving the ground at speed. The
    // boot drop and respawn drops start in the air at rest, so they don't.
    if (car.state.airborne && !wasAirborne) launched = Math.hypot(car.velocity.x, car.velocity.z) > LAUNCH_SPEED
    wasAirborne = car.state.airborne
    airborneFor = car.state.airborne && launched ? airborneFor + dt : 0
    if (airborneFor >= settings.game.airtimeSeconds) progression.awardBadge('airtime')

    if (Math.hypot(car.position.x, car.position.z) > HQ_RADIUS) hornsHere = 0
  }

  /** The horn (H) sounded. */
  function horn(car) {
    if (Math.hypot(car.position.x, car.position.z) > HQ_RADIUS) return
    hornsHere += 1
    if (hornsHere === settings.game.hornsAtHq) {
      hornsHere = 0
      events.emit('easter-egg', { id: 'beacon_morse' })
    }
  }

  /** A passive trigger fired (`trigger_<id>`). */
  function trigger(name) {
    if (name !== 'trigger_loop_zero') return
    progression.awardBadge('loop_the_0')
    counters().loops = (counters().loops ?? 0) + 1
    store.save()
    if (counters().loops === settings.game.loopsForTrophy) dropTrophy()
  }

  /** The hidden trophy: a gold box with a "pptx" plate, dropped on the HQ plaza. */
  function dropTrophy() {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-6, 14, 6))
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.8, 0.6).setMass(2).setRestitution(0.3), body)
    const material = renderAssets
      ? new THREE.MeshMatcapMaterial({ matcap: renderAssets.matcaps.get('ivory'), color: '#E3B505' })
      : new THREE.MeshBasicMaterial({ color: '#E3B505' })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.2), material)
    mesh.name = 'trophy-pptx'
    scene.add(mesh)
    trophy = { body, mesh }
    events.emit('easter-egg', { id: 'pptx_trophy' })
  }
  let trophy = null

  function sync() {
    if (!trophy) return
    const t = trophy.body.translation()
    const r = trophy.body.rotation()
    trophy.mesh.position.set(t.x, t.y, t.z)
    trophy.mesh.quaternion.set(r.x, r.y, r.z, r.w)
  }

  return {
    update,
    sync,
    horn,
    trigger,
    dispose() {
      window.removeEventListener('keydown', onKey)
    },
  }
}
