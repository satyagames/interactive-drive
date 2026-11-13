import * as THREE from 'three'

import { CELL, CELLS } from './atlas.js'

/**
 * The passport stamp (doc 05 §2): a big rubber stamp slams onto the floor
 * in front of the car, leaves a green ink splash, and a light pillar stands
 * on the spot for 2 s. One instance, replayed for each stamp.
 *
 * Timeline (s): 0-0.28 fall, 0.28 impact (`onImpact`), 0.28-0.45 squash,
 * hold to 1.2, then lift away by 1.7. The ink fades over 5 s, the pillar
 * over 2 s. Under reduced motion the stamp appears in place instead of
 * falling.
 */
const FALL = 0.28
const HOLD = 1.2
const LIFT = 1.7
const INK = 5
const PILLAR = 2

const decalVertex = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const decalFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uCell;
  uniform float uCells;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    float mask = texture2D(uAtlas, (uCell + vUv) / uCells).a;
    float alpha = mask * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`
const pillarVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = 1.0 - abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
  }
`
const pillarFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    float height = pow(1.0 - vUv.y, 1.6);
    float bands = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 9.0);
    float alpha = height * (0.35 + 0.65 * vRim) * bands * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`

export function createStamp({ atlas, renderAssets, color = '#86BC25', emissive = 2.6 }) {
  const green = new THREE.Color(color)
  const group = new THREE.Group()
  group.name = 'vfx:stamp'
  group.visible = false

  // The stamp itself: a dark handle on an ivory block with a green rubber pad.
  const matcap = (name, tint) =>
    renderAssets?.matcaps.get(name)
      ? new THREE.MeshMatcapMaterial({ matcap: renderAssets.matcaps.get(name), color: tint ?? 0xffffff, fog: true })
      : new THREE.MeshBasicMaterial({ color: tint ?? 0xffffff })
  const stamp = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.5, 16), matcap('dark'))
  handle.position.y = 1.55
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), matcap('dark'))
  knob.position.y = 2.5
  const block = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.62, 2.6), matcap('ivory'))
  block.position.y = 0.5
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2.4), matcap('ivory', green))
  pad.position.y = 0.1
  stamp.add(handle, knob, block, pad)
  group.add(stamp)

  const ink = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      name: 'vfx:ink',
      vertexShader: decalVertex,
      fragmentShader: decalFragment,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uCell: { value: new THREE.Vector2(CELL.splat % CELLS, CELLS - 1 - Math.floor(CELL.splat / CELLS)) },
        uCells: { value: CELLS },
        uColor: { value: green.clone() },
        uOpacity: { value: 0 },
      }]),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      fog: true,
    }),
  )
  ink.material.uniforms.uAtlas = { value: atlas }
  ink.position.y = 0.03
  ink.renderOrder = 3
  group.add(ink)

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 16, 28, 1, true).translate(0, 8, 0),
    new THREE.ShaderMaterial({
      name: 'vfx:pillar',
      vertexShader: pillarVertex,
      fragmentShader: pillarFragment,
      uniforms: {
        uColor: { value: green.clone().multiplyScalar(emissive) },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  pillar.renderOrder = 15
  group.add(pillar)

  let time = Infinity
  let impacted = true
  let onImpact = null

  /** Slam a stamp at (x, y, z) facing `yaw`; `impact()` runs as it lands. `instant`: no fall (reduced motion). */
  function play(x, y, z, yaw, instant, impact) {
    group.position.set(x, y, z)
    group.rotation.set(0, yaw, 0)
    group.visible = true
    time = instant ? FALL : 0
    impacted = false
    onImpact = impact
  }

  function update(dt) {
    if (!group.visible) return
    time += dt
    pillar.material.uniforms.uTime.value = time

    if (time < FALL) {
      const t = time / FALL
      stamp.position.y = 9 * (1 - t * t)
      stamp.scale.set(1, 1, 1)
      stamp.visible = true
    } else {
      if (!impacted) {
        impacted = true
        onImpact?.()
      }
      const since = time - FALL
      // Squash on impact, then settle.
      const squash = since < 0.17 ? 1 - 0.22 * Math.sin((since / 0.17) * Math.PI) : 1
      if (time < HOLD) {
        stamp.position.y = 0
        stamp.scale.set(2 - squash, squash, 2 - squash)
      } else if (time < LIFT) {
        const t = (time - HOLD) / (LIFT - HOLD)
        stamp.position.y = 6 * t * t
        stamp.scale.setScalar(Math.max(1 - t, 0.001))
      } else {
        stamp.visible = false
      }
    }

    const since = Math.max(time - FALL, 0)
    const inkGrow = Math.min(since / 0.12, 1)
    ink.scale.setScalar(impacted ? 0.6 + 0.4 * inkGrow : 0.001)
    ink.material.uniforms.uOpacity.value = impacted ? 0.9 * Math.min(1, (INK - since) / 1.5) : 0
    pillar.material.uniforms.uOpacity.value = impacted ? Math.max(0, Math.sin(Math.min(since / PILLAR, 1) * Math.PI)) * 0.9 : 0
    pillar.visible = impacted && since < PILLAR
    if (since > INK) group.visible = false
  }

  return {
    group,
    play,
    update,
    get playing() {
      return group.visible
    },
  }
}
