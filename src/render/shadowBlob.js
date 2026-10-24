import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * The car's contact shadow.
 *
 * Deliberately not a shadow map. The scene is matcap-shaded and has no lights
 * to cast from, and a real shadow map would be the single most expensive thing
 * in the frame for one object. Instead: cast one ray straight down from the
 * chassis, drop a soft quad on whatever it hits, and scale/fade it with
 * altitude. Off a ramp the blob stays on the ground below, spreading and
 * fading as the car climbs, which is what actually sells the height.
 *
 * The quad is oriented to the surface normal *and* to the car's heading, so it
 * lies flat on a ramp and its long axis stays along the car rather than
 * spinning with the world.
 */

/** Resolution of the generated falloff texture. It is a blurry blob; 64 is plenty. */
const TEXTURE_SIZE = 64

export function createShadowBlob({ scene, world, RAPIER, vehicle }) {
  const texture = createFalloffTexture()

  const material = new THREE.MeshBasicMaterial({
    color: settings.shadow.tint,
    alphaMap: texture,
    transparent: true,
    // Written into the depth buffer it would punch a hole in anything drawn
    // after it, and it sits only centimetres off the ground.
    depthWrite: false,
    fog: true,
  })

  // PlaneGeometry lies in its own XY plane with +Z as its normal, which makes
  // it straightforward to orient from a basis: +Z to the ground normal, +Y
  // along the car.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.name = 'vehicle-shadow'
  mesh.matrixAutoUpdate = false
  mesh.frustumCulled = false
  scene.add(mesh)

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  // Scratch; nothing below allocates.
  const origin = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const xAxis = new THREE.Vector3()
  const yAxis = new THREE.Vector3()
  const zAxis = new THREE.Vector3()
  const contact = new THREE.Vector3()

  function update() {
    const s = settings.shadow
    if (!s.enabled) {
      mesh.visible = false
      return
    }

    origin.copy(vehicle.position)
    ray.origin = origin

    // Excluding the car's own body is what stops the ray stopping on the
    // chassis collider it starts inside.
    const hit = world.castRayAndGetNormal(
      ray, s.maxDrop, true, undefined, undefined, undefined, vehicle.body,
    )
    if (!hit) {
      mesh.visible = false
      return
    }

    normal.set(hit.normal.x, hit.normal.y, hit.normal.z)
    if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0)
    normal.normalize()

    // Height is measured from where the chassis sits when parked, so a car on
    // its wheels reads as zero rather than as one ride height in the air.
    // A vehicle preset can supply its own ride height and footprint scale.
    const groundClearance = vehicle.shadow?.groundClearance ?? s.groundClearance
    const footprint = vehicle.shadow?.scale ?? 1
    const height = Math.max(hit.timeOfImpact - groundClearance, 0)
    const fade = 1 - Math.min(height / Math.max(s.fadeHeight, 1e-3), 1)
    if (fade <= 0) {
      mesh.visible = false
      return
    }

    // Biased towards staying visible. A linear (or worse, squared) fade is
    // almost gone by the top of a ramp jump, which reads as the shadow being
    // broken rather than as the car being high up.
    material.opacity = s.maxOpacity * Math.pow(fade, 0.75)
    if (material.color.getHex() !== s.tint) material.color.setHex(s.tint)

    const spread = (1 + height * s.growth) * footprint

    // The ray points straight down, so the hit is simply that far below.
    contact.set(origin.x, origin.y - hit.timeOfImpact, origin.z)
    contact.addScaledVector(normal, s.offset)

    // Basis: +Z is the ground normal, +Y is the car's heading flattened onto
    // the surface, +X follows from those two.
    zAxis.copy(normal)
    forward.set(0, 0, -1).applyQuaternion(vehicle.quaternion)
    yAxis.copy(forward).addScaledVector(zAxis, -forward.dot(zAxis))
    if (yAxis.lengthSq() < 1e-6) {
      // Nose-down or nose-up past vertical: any tangent will do.
      yAxis.set(1, 0, 0).addScaledVector(zAxis, -zAxis.x)
    }
    yAxis.normalize()
    xAxis.copy(yAxis).cross(zAxis).normalize()

    mesh.matrix.makeBasis(
      xAxis.multiplyScalar(s.radiusX * 2 * spread),
      yAxis.multiplyScalar(s.radiusZ * 2 * spread),
      zAxis,
    )
    mesh.matrix.setPosition(contact)
    mesh.matrixWorldNeedsUpdate = true
    mesh.visible = true
  }

  function dispose() {
    scene.remove(mesh)
    mesh.geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { mesh, update, dispose }
}

/**
 * Radial falloff written straight into a `DataTexture`.
 *
 * Generated rather than authored: it is two lines of maths, and keeping it in
 * code means the softness can be tuned without a round trip through an image
 * editor. `MeshBasicMaterial` reads `alphaMap` from the green channel.
 */
function createFalloffTexture() {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4)

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = ((x + 0.5) / TEXTURE_SIZE) * 2 - 1
      const v = ((y + 0.5) / TEXTURE_SIZE) * 2 - 1
      const r = Math.hypot(u, v)
      // Solid-ish core, long soft edge -- an even gradient all the way to the
      // centre reads as a smudge rather than as contact.
      const alpha = smoothstep(1, 0.45, r)
      // `alphaMap` is sampled from the green channel, not the alpha channel.
      const i = (y * TEXTURE_SIZE + x) * 4
      const value = Math.round(alpha * 255)
      data[i] = data[i + 1] = data[i + 2] = value
      data[i + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat)
  // The falloff is a raw mask, not colour, so it must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}
