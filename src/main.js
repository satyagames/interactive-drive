import './styles.css'

import arena from '../content/arena.seed.json'
import projects from '../content/projects.json'

import { createCameraRig } from './camera/cameraRig.js'
import { rebuild, rendering, settings, world as worldConfig } from './config.js'
import { createExploreMenu } from './content/explore.js'
import { buildContentModel } from './content/model.js'
import { createStationPanel } from './content/panel.js'
import { applyUiStrings, t } from './content/ui.js'
import { runPostBenchmark } from './debug/benchmark.js'
import { createProgressTracker } from './content/progress.js'
import { createLoop } from './core/loop.js'
import { createPhysics, createStepper } from './core/physics.js'
import { createRenderer } from './core/renderer.js'
import { createDebugGui } from './debug/gui.js'
import { createFpsMeter } from './debug/fps.js'
import { createPhysicsDebug } from './debug/physicsDebug.js'
import { createPropStress } from './debug/propStress.js'
import { createInput } from './input/index.js'
import { createBlobShadows } from './render/blobShadows.js'
import { createFloorGradient } from './render/floorGradient.js'
import { loadRenderAssets, syncRenderSettings, syncShaderEffects } from './render/materials.js'
import { createPostProcessing } from './render/post.js'
import { createShadowBlob } from './render/shadowBlob.js'
import { createSky } from './render/sky.js'
import { createScreenFade } from './ui/screenFade.js'
import { createVehicle, vehiclePresets } from './vehicle/vehicle.js'
import { createLighting } from './world/lighting.js'
import { createTriggerWatcher } from './world/triggers.js'
import { createWorld } from './world/world.js'

/** A `trigger_foo` empty's content id is `foo` -- see docs/blender-conventions.md. */
function contentIdForTrigger(trigger) {
  return trigger.name.startsWith(worldConfig.triggerPrefix)
    ? trigger.name.slice(worldConfig.triggerPrefix.length)
    : trigger.name
}

/** Closest `spawn_` point to `position`, or undefined if the world has none. */
function nearestSpawn(spawns, position) {
  let best
  let bestDistance = Infinity
  for (const spawn of Object.values(spawns)) {
    const distance = spawn.position.distanceToSquared(position)
    if (distance < bestDistance) {
      best = spawn
      bestDistance = distance
    }
  }
  return best
}

async function bootstrap() {
  // `?vehicle=sim` swaps the preset for this load (it rebuilds physics, so it
  // can't be a live setting -- see `rebuild.vehicle.preset`).
  const presetParam = new URLSearchParams(window.location.search).get('vehicle')
  if (presetParam in vehiclePresets) rebuild.vehicle.preset = presetParam
  const debugMode = window.location.hash === '#debug'

  // Interface copy comes from content/ui.json; the arena tree from the seed.
  applyUiStrings()
  document.title = t('documentTitle')
  const content = buildContentModel(arena, {
    // The prototype world's trigger_exhibit_* volumes, until Phase 4.
    legacyExhibits: projects,
    labels: {
      start: t('explore.start'),
      ourTeam: t('explore.ourTeam'),
      timeline: t('explore.timeline'),
      leader: t('explore.leader'),
    },
  })
  if (import.meta.env.DEV) validateContentInDev(content)

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

  // The authored ground keeps its AO bake; its colour becomes the world-space
  // gradient, and an outer plane carries that gradient out into the fog.
  let groundMesh = null
  gameWorld.group.traverse((node) => {
    if (!groundMesh && node.isMesh && node.name.startsWith('ground')) groundMesh = node
  })
  const floor = createFloorGradient({ scene, ground: groundMesh, fogColor: rendering.sky.fog })
  const blobs = createBlobShadows({ scene })
  const propStress = debugMode ? createPropStress({ scene, world, RAPIER, renderAssets, blobs }) : null

  // The world's `spawn_` empty (if any) overrides the fallback in config.js;
  // `createVehicle` reads `rebuild.chassis.spawn*` when it spawns the body.
  const spawnPoint = Object.values(gameWorld.spawns)[0]
  if (spawnPoint) {
    const { position, quaternion } = spawnPoint
    rebuild.chassis.spawn = { x: position.x, y: position.y, z: position.z }
    rebuild.chassis.spawnRotation = { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
  }

  const vehicle = await createVehicle({ scene, world, RAPIER, renderAssets })
  // The arcade car drops in from above its spawn, as the reference's does.
  vehicle.respawn()
  const screenFade = createScreenFade(document.getElementById('fade'))
  const shadowBlob = createShadowBlob({ scene, world, RAPIER, vehicle })

  const stationPanel = createStationPanel(document.getElementById('station-panel'))
  // "N of 4 found" counts the prototype exhibits until the Phase 6 passport.
  const progress = createProgressTracker(projects.length, {
    countEl: document.getElementById('progress-count'),
    totalEl: document.getElementById('progress-total'),
  })

  const triggerWatcher = createTriggerWatcher(gameWorld.triggers, {
    onEnter(trigger) {
      interactionTarget = 1
      const id = contentIdForTrigger(trigger)
      const node = content.get(id)
      if (!node) return
      stationPanel.show(node)
      if (node.kind === 'exhibit') progress.markFound(id)
    },
    onExit(trigger) {
      interactionTarget = 0
      const id = contentIdForTrigger(trigger)
      if (stationPanel.currentId === id) stationPanel.hide()
    },
  })

  const cameraRig = createCameraRig(camera, canvas)

  // Explore mode: fly the camera to a place and open it, without driving.
  const explore = createExploreMenu({
    root: document.getElementById('explore'),
    launcher: document.getElementById('explore-open'),
    model: content,
    onPickNode(node) {
      if (node.position) cameraRig.focusOn(node.position)
      stationPanel.show(node, { focus: true, returnFocus: document.activeElement })
    },
    onPickGroup(entry) {
      if (entry.position) cameraRig.focusOn(entry.position)
    },
    onClose() {
      cameraRig.clearFocus()
    },
  })
  const physicsDebug = createPhysicsDebug({ scene, world })
  const input = createInput()
  const fps = createFpsMeter(hudFpsEl)

  const post = createPostProcessing({ renderer, scene, camera, canvas })
  onResize(post.setSize)

  /** R: fade out, drop back in at the nearest `spawn_`, fade in. */
  const respawnVehicle = () => {
    screenFade.run(() => {
      vehicle.respawn(nearestSpawn(gameWorld.spawns, vehicle.position))
      cameraRig.reset()
    })
  }

  // The tuning panel (and any tune saved from it) is a `#debug` tool, as in
  // the reference; visitors get the clean HUD.
  if (debugMode) {
    createDebugGui({
      vehicle, camera: cameraRig, hud: hudEl, resize, respawn: respawnVehicle, RAPIER, debugMode, propStress,
    })
  }
  hudEl.hidden = !settings.debug.showHud

  vehicle.sync()
  shadowBlob.update()
  cameraRig.update(1 / 60, vehicle)
  // Opening shot: start close and ease out while the car drops in.
  cameraRig.playIntro()
  sky.update(camera)

  loaderEl.classList.add('hidden')
  setTimeout(() => loaderEl.remove(), 500)

  // Handy from the devtools console while tuning:
  //   __proto.vehicle.state, __proto.settings.arcade.engineForce = 300
  //   await __proto.benchmark.run()  -- post-processing frame-cost table
  if (import.meta.env.DEV) {
    window.__proto = {
      vehicle, world, scene, camera, settings, input, stationPanel, explore, content, progress, gameWorld,
      renderer, renderAssets, post, shadowBlob, sky, fps, cameraRig, floor, blobs, propStress,
      benchmark: { run: (options) => runPostBenchmark({ renderer, scene, camera }, options) },
    }
  }

  let hudAccumulator = 0
  let elapsed = 0
  let interaction = 0
  let interactionTarget = 0

  createLoop((delta) => {
    elapsed += delta
    const inputState = input.update({ camera, vehicle })

    if (input.consume('respawn')) respawnVehicle()
    // Audio (Phase 8) will hang the horn sound off this too.
    if (input.consume('horn')) vehicle.horn()
    if (input.consume('camera')) cameraRig.toggle()
    // Esc peels back one layer at a time: station panel, then Explore, then
    // opens Explore (the Phase 9 menu will take over that last step).
    if (input.consume('menu')) {
      if (stationPanel.isOpen) stationPanel.hide()
      else explore.toggle()
    }
    // Explore's camera hold ends as soon as you drive off (driving keys only
    // reach here when focus is outside the Explore list).
    if (cameraRig.focused && (inputState.throttle !== 0 || inputState.steer !== 0)) {
      cameraRig.clearFocus()
    }
    // interact / mute / passport have no consumers until Phases 5-9;
    // unconsumed presses are dropped at the next update.

    // Vehicle forces must be applied inside the fixed step, not per frame,
    // or the feel changes with the display refresh rate.
    step(delta, (fixedDelta) => vehicle.update(fixedDelta, inputState))

    vehicle.sync()
    triggerWatcher(vehicle.position)
    interaction += (interactionTarget - interaction) * (1 - Math.exp(-8 * delta))
    cameraRig.update(delta, vehicle)
    sky.update(camera)
    shadowBlob.update()
    propStress?.update()
    blobs.update()
    floor.update()
    physicsDebug.update()
    syncRenderSettings()
    syncShaderEffects({
      time: elapsed,
      speed: Math.min(vehicle.state.speed / Math.max(vehicle.topSpeed, 1), 1),
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

/**
 * Development only: check content/*.json against their schemas and report
 * problems loudly in the console. `npm run content:check` does the same (plus
 * image paths) from the command line; neither ever runs in production.
 */
async function validateContentInDev(content) {
  const [{ validate, formatErrors }, arenaSchema, uiSchema, ui] = await Promise.all([
    import('./content/schema.js'),
    import('../content/arena.schema.json'),
    import('../content/ui.schema.json'),
    import('../content/ui.json'),
  ])
  const report = [
    formatErrors('content/arena.seed.json', validate(arenaSchema.default, arena)),
    formatErrors('content/ui.json', validate(uiSchema.default, ui.default)),
    ...content.issues.map((issue) => `content/arena.seed.json: ${issue}`),
  ].filter(Boolean)
  if (report.length) console.error(`Content problems:\n${report.join('\n')}`)
}

bootstrap().catch((error) => {
  console.error(error)
  const loaderEl = document.getElementById('loader')
  if (loaderEl) loaderEl.textContent = t('loadFailed', { message: error.message })
})
