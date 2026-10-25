import RAPIER from '@dimforge/rapier3d-compat'

import { rebuild } from '../config.js'
import { arcadeGravity } from '../vehicle/arcadePhysics.js'

/**
 * Boots Rapier's wasm module and creates the world.
 *
 * The `-compat` build inlines the wasm as base64, so there is no extra fetch
 * and nothing to copy into `dist/` -- Vite bundles it like any other module.
 */
export async function createPhysics() {
  await RAPIER.init()

  const { timestep } = rebuild.physics
  // The arcade preset brings the reference's stronger gravity with it.
  const gravity = rebuild.vehicle.preset === 'sim' ? rebuild.physics.gravity : arcadeGravity()
  const world = new RAPIER.World(gravity)
  world.timestep = timestep

  return { RAPIER, world }
}

/**
 * Fixed-timestep accumulator. Keeps the simulation deterministic and decoupled
 * from the display refresh rate; `onStep` is where per-step forces belong.
 * With an `eventQueue`, `afterStep` runs after each `world.step` to drain it
 * (the queue auto-drains before the next step, so once a frame would miss events).
 */
export function createStepper(world, eventQueue) {
  const { timestep, maxSubSteps } = rebuild.physics
  let accumulator = 0

  return function step(frameDelta, onStep, afterStep) {
    // Clamp so an alt-tab or a slow first frame cannot queue up 300 steps.
    accumulator = Math.min(accumulator + frameDelta, timestep * maxSubSteps)

    let steps = 0
    while (accumulator >= timestep && steps < maxSubSteps) {
      onStep(timestep)
      world.step(eventQueue)
      afterStep?.(timestep)
      accumulator -= timestep
      steps += 1
    }
    return steps
  }
}
