import * as THREE from 'three'

import { rendering } from '../config.js'

/**
 * The scene's background: a vertical gradient on an inside-out sphere that
 * rides along with the camera.
 *
 * Why a dome rather than a CSS gradient behind the canvas or a screen-space
 * quad: both of those are fixed to the *screen*, so the horizon band stays
 * pinned in place while the camera pitches. That is invisible when the camera
 * is level and obvious the moment the car launches off a ramp -- the sky
 * slides with the car instead of staying put, which reads as the whole world
 * tilting. Sampling the gradient by world-space direction costs one cheap
 * fragment shader over a 32x16 sphere and is simply correct.
 *
 * It is drawn first (`renderOrder = -1`) with depth writes off, so every
 * opaque surface in the scene paints straight over it, and it is never
 * frustum-culled -- its origin follows the camera, which would otherwise make
 * the bounding-sphere test fight with the very thing it's tracking.
 *
 * `scene.fog` is set to the horizon colour by the caller, which is what lets
 * the ground plane's far edge dissolve into the gradient rather than ending
 * in a hard line.
 */

const VERTEX = /* glsl */ `
  varying vec3 vLocal;

  void main() {
    // The dome is only ever translated, never rotated or scaled non-
    // uniformly, so its local position already points the right way in world
    // space -- no normal matrix needed.
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uNadir;
  uniform float uFalloff;

  varying vec3 vLocal;

  void main() {
    float h = normalize( vLocal ).y;
    // Two half-gradients meeting at the horizon. Raising |h| to a power below
    // 1 widens the pale horizon band; above 1 tightens it.
    float t = pow( abs( h ), uFalloff );
    vec3 colour = mix( uHorizon, h > 0.0 ? uZenith : uNadir, t );
    gl_FragColor = vec4( colour, 1.0 );
    // Both of these compile to nothing when the composer is on, because three
    // only tone-maps and encodes in-material when it is drawing straight to
    // the canvas -- OutputPass does it for the whole buffer otherwise. They
    // are here so that settings.post.enabled = false renders the same sky
    // rather than a blown-out one.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Comfortably inside the camera's far plane (1000 m), and far past the world. */
const RADIUS = 400

export function createSky(scene) {
  const config = rendering.sky

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(config.horizon) },
      uZenith: { value: new THREE.Color(config.zenith) },
      uNadir: { value: new THREE.Color(config.nadir) },
      uFalloff: { value: config.falloff },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 32, 16), material)
  mesh.name = 'sky'
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  scene.add(mesh)

  // A flat background colour underneath would only ever show through as a
  // one-frame flash, but leaving one set is how a stale colour survives a
  // palette change unnoticed.
  scene.background = null
  scene.fog = new THREE.Fog(config.fog, config.fogNear, config.fogFar)

  return {
    mesh,
    /** Keeps the dome centred on the camera so it can never be driven out of. */
    update(camera) {
      mesh.position.copy(camera.position)
    },
  }
}
