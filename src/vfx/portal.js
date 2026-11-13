import * as THREE from 'three'

/**
 * The Submission Portal's energy (doc 05 §2): a disc inside the turning
 * `anim_hq_portal` ring with a scrolling-UV swirl, drawn above the bloom
 * threshold so it is the arena's one bright landmark. It rides on the ring,
 * so it turns, reveals and scales with it; `pulse()` flares it (Dash finish).
 */
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uColor;
  uniform vec3 uCore;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    // Polar UVs scrolling inwards with a twist: an energy vortex.
    float swirl = sin(a * 5.0 + r * 9.0 - uTime * 3.2) * 0.5 + 0.5;
    float rings = sin(r * 22.0 - uTime * 5.0) * 0.5 + 0.5;
    float energy = mix(swirl, rings, 0.35);
    float edge = smoothstep(1.0, 0.82, r);
    float core = smoothstep(0.55, 0.0, r);
    vec3 colour = mix(uColor, uCore, core * 0.6) * (0.55 + 0.75 * energy) * (1.0 + uPulse * 1.5);
    float alpha = edge * (0.35 + 0.45 * energy + uPulse * 0.2);
    gl_FragColor = vec4(colour, alpha);
  }
`

export function createPortal({ ring, color = '#86BC25', emissive = 2.6 }) {
  // The ring is 3.4 m in radius with a 0.6 m tube; the disc fills the inside.
  const geometry = new THREE.CircleGeometry(2.85, 48)
  const material = new THREE.ShaderMaterial({
    name: 'vfx:portal',
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColor: { value: new THREE.Color(color).multiplyScalar(emissive * 0.7) },
      uCore: { value: new THREE.Color('#C4E86B').multiplyScalar(emissive * 0.6) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Alpha, not additive: added onto the white HQ plaza it washed out to white.
  })
  const disc = new THREE.Mesh(geometry, material)
  disc.name = 'vfx:portal'
  disc.renderOrder = 12
  ring?.add(disc)

  let pulse = 0
  return {
    disc,
    pulse() {
      pulse = 1
    },
    update(dt, time) {
      pulse = Math.max(pulse - dt * 0.8, 0)
      material.uniforms.uTime.value = time
      material.uniforms.uPulse.value = pulse
    },
  }
}
