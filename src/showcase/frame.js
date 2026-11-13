/**
 * A district's local layout frame, the runtime twin of
 * blender/scripts/_common.py `Frame.facing_centre`: origin at the district
 * centre, local -Z pointing at the arena centre (the gateway side). Exhibit
 * positions in `rebuild.showcase` are written in it, so they sit in the same
 * place relative to the generated buildings wherever the district is.
 *
 *   toWorld(lx, lz) -> { x, z }      game-space floor position
 *   yaw(localDeg)   -> radians       world yaw for an object whose front is +Z
 */
export function districtFrame(x, z) {
  const yaw = Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6 ? 0 : Math.atan2(x, z)
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return {
    x,
    z,
    yawRad: yaw,
    toWorld(lx, lz) {
      return { x: x + lx * c + lz * s, z: z - lx * s + lz * c }
    },
    /** Local yaw in degrees -> world yaw in radians (three's rotation.y). */
    yaw(localDeg = 0) {
      return yaw + (localDeg * Math.PI) / 180
    },
  }
}

/** District id -> its frame, from the content seed (HQ and the RFP Gate included). */
export function districtFrames(seed) {
  const frames = new Map()
  frames.set('hq', districtFrame(seed.hq.position[0], seed.hq.position[2]))
  frames.set('rfp_gate', districtFrame(seed.rfpGate.position[0], seed.rfpGate.position[2]))
  for (const d of [...seed.territories, ...seed.pillars]) frames.set(d.id, districtFrame(d.position[0], d.position[2]))
  return frames
}
