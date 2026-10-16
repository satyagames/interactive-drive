import * as THREE from 'three'

/**
 * Watches the vehicle's position against the world's `trigger_` volumes and
 * fires `onEnter`/`onExit` on the frame each one's state actually changes
 * (never every frame while inside/outside). `onEnter` also always logs to
 * the console, which is what this started as before the content layer
 * (`src/content/`) gave it something to drive.
 */
export function createTriggerWatcher(triggers, { onEnter, onExit } = {}) {
  const inside = new Map(triggers.map((trigger) => [trigger.name, false]))
  const invQuat = new THREE.Quaternion()
  const local = new THREE.Vector3()

  return function update(position) {
    for (const trigger of triggers) {
      invQuat.copy(trigger.quaternion).invert()
      local.copy(position).sub(trigger.position).applyQuaternion(invQuat)

      const isInside =
        Math.abs(local.x) <= trigger.halfExtents.x &&
        Math.abs(local.y) <= trigger.halfExtents.y &&
        Math.abs(local.z) <= trigger.halfExtents.z

      const was = inside.get(trigger.name)
      if (isInside && !was) {
        console.log(`[trigger] entered ${trigger.name}`)
        onEnter?.(trigger)
      } else if (!isInside && was) {
        onExit?.(trigger)
      }
      inside.set(trigger.name, isInside)
    }
  }
}
