import RAPIER from '@dimforge/rapier3d-compat'

import { rebuild } from '../config.js'

/**
 * Boots Rapier's wasm module and creates the world.
 *
 * The `-compat` build inlines the wasm as base64, so there is no extra fetch
 * and nothing to copy into `dist/` -- Vite bundles it like any other module.
 */
export async function createPhysics() {
  await RAPIER.init()

  const { gravity, timestep } = rebuild.physics
  const world = new RAPIER.World(gravity)
  world.timestep = timestep

  return { RAPIER, world }
}

/**
 * Fixed-timestep accumulator. Keeps the simulation deterministic and decoupled
 * from the display refresh rate; `onStep` is where per-step forces belong.
 */
export function createStepper(world) {
  const { timestep, maxSubSteps } = rebuild.physics
  let accumulator = 0

  return function step(frameDelta, onStep) {
    // Clamp so an alt-tab or a slow first frame cannot queue up 300 steps.
    accumulator = Math.min(accumulator + frameDelta, timestep * maxSubSteps)

    let steps = 0
    while (accumulator >= timestep && steps < maxSubSteps) {
      onStep(timestep)
      world.step()
      accumulator -= timestep
      steps += 1
    }
    return steps
  }
}
