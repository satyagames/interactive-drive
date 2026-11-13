import * as THREE from 'three'

/**
 * Boost speed lines: thin streaks rushing out from the centre of the screen.
 * Built directly in clip space (the vertex shader ignores the camera), so it
 * is one draw call with no CPU work beyond two uniforms a frame.
 */
const vertexShader = /* glsl */ `
  attribute vec2 aLine; // angle, phase seed
  uniform float uTime;
  uniform float uAspect;
  varying float vAlpha;
  void main() {
    float t = fract(uTime * 1.6 + aLine.y);
    float r = mix(0.38, 1.5, t);
    float len = mix(0.08, 0.32, t);
    vec2 dir = vec2(cos(aLine.x), sin(aLine.x));
    vec2 side = vec2(-dir.y, dir.x);
    // position.x: 0 at the inner end, 1 at the outer; position.y: -1..1 across.
    vec2 p = dir * (r + position.x * len) + side * position.y * 0.0035 * (1.0 + 2.0 * t);
    p.x /= uAspect;
    vAlpha = smoothstep(0.0, 0.25, t) * (1.0 - t);
    gl_Position = vec4(p, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uStrength;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * uStrength);
  }
`

export function createSpeedLines({ count = 56, color = '#F4F2EC' } = {}) {
  const quad = new THREE.BufferGeometry()
  quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3))
  quad.setIndex([0, 1, 2, 2, 1, 3])
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  const lines = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    lines[i * 2] = (i / count) * Math.PI * 2 + Math.random() * 0.12
    lines[i * 2 + 1] = Math.random()
  }
  geometry.setAttribute('aLine', new THREE.InstancedBufferAttribute(lines, 2))
  geometry.instanceCount = count

  const material = new THREE.ShaderMaterial({
    name: 'vfx:speed-lines',
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'vfx:speed-lines'
  mesh.frustumCulled = false
  mesh.renderOrder = 100
  mesh.visible = false

  let strength = 0
  return {
    mesh,
    /** `target` 0..1 (boost on, scaled by speed); eased so lines never pop. */
    update(dt, target, aspect, time) {
      strength += (target - strength) * (1 - Math.exp(-(target > strength ? 6 : 3) * dt))
      if (strength < 0.01) strength = target > 0 ? strength : 0
      material.uniforms.uStrength.value = strength
      material.uniforms.uAspect.value = aspect
      material.uniforms.uTime.value = time
      mesh.visible = strength > 0.01
    },
  }
}
