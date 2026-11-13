import { rebuild } from '../config.js'
import { createArcadeVehicle } from './arcadeVehicle.js'
import { createSimVehicle } from './simVehicle.js'

/** Vehicle presets, keyed by `rebuild.vehicle.preset`. Both expose the same API. */
export const vehiclePresets = {
  arcade2019: createArcadeVehicle,
  sim: createSimVehicle,
}

/**
 * Builds the car for the active preset. Shared API: `object3D`, `body`,
 * `state`, `update(dt, input)` (fixed step), `sync()` (per frame),
 * `respawn(point?)`, `horn()`, and `position` / `quaternion` / `velocity` /
 * `topSpeed`. `shadow` is optional (sizes the blob for that car).
 */
export function createVehicle(options) {
  const create = vehiclePresets[rebuild.vehicle.preset] ?? vehiclePresets.arcade2019
  return create(options)
}
