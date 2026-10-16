import './styles.css'

import projects from '../content/projects.json'

import { createChaseCamera } from './camera/chaseCamera.js'
import { rebuild, settings, world as worldConfig } from './config.js'
import { createExhibitPanel } from './content/panel.js'
import { runPostBenchmark } from './debug/benchmark.js'
import { createProgressTracker } from './content/progress.js'
import { createLoop } from './core/loop.js'
import { createPhysics, createStepper } from './core/physics.js'
import { createRenderer } from './core/renderer.js'
import { createDebugGui } from './debug/gui.js'
import { createFpsMeter } from './debug/fps.js'
import { createPhysicsDebug } from './debug/physicsDebug.js'
import { createInput } from './input/index.js'
import { loadRenderAssets, syncRenderSettings, syncShaderEffects } from './render/materials.js'
import { createPostProcessing } from './render/post.js'
import { createShadowBlob } from './render/shadowBlob.js'
import { createSky } from './render/sky.js'
import { createVehicle } from './vehicle/vehicle.js'
import { createLighting } from './world/lighting.js'
import { createTriggerWatcher } from './world/triggers.js'
import { createWorld } from './world/world.js'

/** A `trigger_foo` empty's content id is `foo` -- see docs/blender-conventions.md. */
function contentIdForTrigger(trigger) {
  return trigger.name.startsWith(worldConfig.triggerPrefix)
    ? trigger.name.slice(worldConfig.triggerPrefix.length)
    : trigger.name
}

async function bootstrap() {
  const canvas = document.getElementById('app')
  const loaderEl = document.getElementById('loader')
  const hudEl = document.getElementById('hud')
  const hudSpeedEl = document.getElementById('hud-speed')
  const hudFpsEl = document.getElementById('hud-fps')

  const { renderer, scene, camera, resize, onResize } = createRenderer(canvas)
  createLighting(scene)
  const sky = createSky(scene)

  // Matcaps and the AO bakes. Fetched up front because every mesh built below
  // asks for a material the moment it is created.
  const renderAssets = await loadRenderAssets()

  // Rapier's wasm has to finish initialising before any world exists.
  const { RAPIER, world } = await createPhysics()
  const step = createStepper(world)

  const gameWorld = await createWorld({ scene, world, RAPIER, renderAssets })

  // The world's `spawn_` empty (if any) overrides the fallback in config.js;
  // `createVehicle` reads `rebuild.chassis.spawn*` when it spawns the body.
  const spawnPoint = Object.values(gameWorld.spawns)[0]
  if (spawnPoint) {
    const { position, quaternion } = spawnPoint
    rebuild.chassis.spawn = { x: position.x, y: position.y, z: position.z }
    rebuild.chassis.spawnRotation = { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
  }

  const vehicle = await createVehicle({ scene, world, RAPIER, renderAssets })
  const shadowBlob = createShadowBlob({ scene, world, RAPIER, vehicle })

  const projectsById = new Map(projects.map((entry) => [entry.id, entry]))
  const exhibitPanel = createExhibitPanel({
    root: document.getElementById('exhibit-panel'),
    closeButton: document.getElementById('exhibit-close'),
    image: document.getElementById('exhibit-image'),
    title: document.getElementById('exhibit-title'),
    pitch: document.getElementById('exhibit-pitch'),
    description: document.getElementById('exhibit-description'),
  })
  const progress = createProgressTracker(projects.length, {
    countEl: document.getElementById('progress-count'),
    totalEl: document.getElementById('progress-total'),
  })

  const triggerWatcher = createTriggerWatcher(gameWorld.triggers, {
    onEnter(trigger) {
      interactionTarget = 1
      const id = contentIdForTrigger(trigger)
      const entry = projectsById.get(id)
      if (!entry) return
      exhibitPanel.show(entry)
      progress.markFound(id)
    },
    onExit(trigger) {
      interactionTarget = 0
      const id = contentIdForTrigger(trigger)
      if (exhibitPanel.currentId === id) exhibitPanel.hide()
    },
  })

  const chaseCamera = createChaseCamera(camera)
  const physicsDebug = createPhysicsDebug({ scene, world })
  const input = createInput()
  const fps = createFpsMeter(hudFpsEl)

  const post = createPostProcessing({ renderer, scene, camera, canvas })
  onResize(post.setSize)

  createDebugGui({ vehicle, camera: chaseCamera, hud: hudEl, resize })
  hudEl.hidden = !settings.debug.showHud

  vehicle.sync()
  shadowBlob.update()
  chaseCamera.update(1 / 60, vehicle)
  sky.update(camera)

  loaderEl.classList.add('hidden')
  setTimeout(() => loaderEl.remove(), 500)

  // Handy from the devtools console while tuning:
  //   __proto.vehicle.state, __proto.settings.vehicle.engineForce = 8000
  //   await __proto.benchmark.run()  -- post-processing frame-cost table
  if (import.meta.env.DEV) {
    window.__proto = {
      vehicle, world, scene, camera, settings, input, exhibitPanel, progress, gameWorld,
      renderer, renderAssets, post, shadowBlob, sky, fps,
      benchmark: { run: (options) => runPostBenchmark({ renderer, scene, camera }, options) },
    }
  }

  let hudAccumulator = 0
  let elapsed = 0
  let interaction = 0
  let interactionTarget = 0

  createLoop((delta) => {
    elapsed += delta
    const inputState = input.update()

    if (input.consumeRespawn()) {
      vehicle.respawn()
      chaseCamera.reset()
    }

    // Vehicle forces must be applied inside the fixed step, not per frame,
    // or the feel changes with the display refresh rate.
    step(delta, (fixedDelta) => vehicle.update(fixedDelta, inputState))

    vehicle.sync()
    triggerWatcher(vehicle.position)
    interaction += (interactionTarget - interaction) * (1 - Math.exp(-8 * delta))
    chaseCamera.update(delta, vehicle)
    sky.update(camera)
    shadowBlob.update()
    physicsDebug.update()
    syncRenderSettings()
    syncShaderEffects({
      time: elapsed,
      speed: Math.min(vehicle.state.speed / Math.max(settings.vehicle.topSpeed, 1), 1),
      interaction,
    })

    hudAccumulator += delta
    if (hudAccumulator > 0.1) {
      hudAccumulator = 0
      hudSpeedEl.textContent = Math.round(vehicle.state.speed * 3.6).toString()
    }
    fps.update(delta)

    post.render(delta)
  })
}

bootstrap().catch((error) => {
  console.error(error)
  const loaderEl = document.getElementById('loader')
  if (loaderEl) loaderEl.textContent = `failed to start: ${error.message}`
})
