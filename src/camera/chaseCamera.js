import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Chase camera.
 *
 * Rather than parenting to the car (which feels rigid and makes every bump a
 * camera shake), it computes a desired position/aim each frame and eases the
 * real camera towards them with a frame-rate independent exponential lerp.
 *
 * The follow direction blends the chassis heading with the flattened velocity
 * direction, so during a drift the camera drifts with you instead of snapping
 * to wherever the nose happens to point.
 */
/** Aspect ratio the camera defaults were tuned against (16:9 desktop). */
const REFERENCE_ASPECT = 16 / 9
/** Cap on how far the portrait correction may push the camera back. */
const MAX_FRAMING_SCALE = 1.9

export function createChaseCamera(camera) {
  const heading = new THREE.Vector3(0, 0, -1)
  const forward = new THREE.Vector3()
  const velocityDir = new THREE.Vector3()
  const desiredPosition = new THREE.Vector3()
  const desiredLook = new THREE.Vector3()
  const currentPosition = new THREE.Vector3()
  const currentLook = new THREE.Vector3()

  let initialised = false

  function update(dt, vehicle) {
    const c = settings.camera

    forward.set(0, 0, -1).applyQuaternion(vehicle.quaternion)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()

    velocityDir.copy(vehicle.velocity)
    velocityDir.y = 0
    const planarSpeed = velocityDir.length()

    if (planarSpeed > 1) {
      velocityDir.divideScalar(planarSpeed)
      // Reversing points velocity backwards; flip it so the camera stays
      // behind the nose rather than whipping around the car.
      if (velocityDir.dot(forward) < 0) velocityDir.negate()
      const blend = c.velocityBlend * Math.min(planarSpeed / 8, 1)
      heading.copy(forward).lerp(velocityDir, blend).normalize()
    } else {
      heading.copy(forward)
    }

    // Tall viewports (portrait phones) need the camera further back to show
    // the same amount of road as a 16:9 desktop window.
    // camera.aspect is normally guarded upstream (see renderer.js), but a
    // stray NaN here would otherwise poison this lerp permanently -- once
    // `currentPosition`/`camera.fov` go NaN, NaN+anything stays NaN forever.
    const rawFraming = REFERENCE_ASPECT / Math.max(camera.aspect, 0.35)
    const framing = c.portraitFraming
      ? Math.min(Math.max(Number.isFinite(rawFraming) ? rawFraming : 1, 1), MAX_FRAMING_SCALE)
      : 1

    desiredPosition
      .copy(vehicle.position)
      .addScaledVector(heading, -c.distance * framing)
    desiredPosition.y += c.height * framing
    // Cheap guard against dipping under the ground plane on a slope.
    desiredPosition.y = Math.max(desiredPosition.y, 1.2)

    desiredLook.copy(vehicle.position).addScaledVector(heading, c.lookAhead)
    desiredLook.y += c.lookHeight

    if (!initialised) {
      currentPosition.copy(desiredPosition)
      currentLook.copy(desiredLook)
      initialised = true
    }

    currentPosition.lerp(desiredPosition, 1 - Math.exp(-c.positionSmoothing * dt))
    currentLook.lerp(desiredLook, 1 - Math.exp(-c.lookSmoothing * dt))

    camera.position.copy(currentPosition)
    camera.lookAt(currentLook)

    const speedRatio = Math.min(vehicle.state.speed / Math.max(vehicle.topSpeed, 1e-3), 1)
    const targetFov = c.fov + c.speedFovBoost * speedRatio + (framing - 1) * 14
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-3 * dt))
    camera.updateProjectionMatrix()
  }

  /** Snap on the next update (used after a respawn). */
  function reset() {
    initialised = false
  }

  return { update, reset }
}
