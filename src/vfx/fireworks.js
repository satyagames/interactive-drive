import * as THREE from 'three'

/**
 * Decade Fireworks (doc 05 §2): GPU particles. A shell writes its points once
 * -- origin, velocity, start time, colour -- and the vertex shader flies them
 * from there (drag plus gravity, closed form), so a sky full of fireworks
 * costs no CPU at all between launches.
 *
 * Shells burst as a "10" (facing the camera at launch, so it reads) or as a
 * round "dot" burst. Each shell is a rocket trail followed by its burst.
 * Under reduced motion there is no twinkle and the burst eases in instead of
 * flashing (doc 03 §5).
 */
const vertexShader = /* glsl */ `
  attribute vec3 aVelocity;
  attribute vec4 aTiming; // start, life, size, twinkle seed
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uDrag;
  uniform float uGravity;
  uniform float uScale;
  uniform float uTwinkle;
  uniform float uFlash;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = uTime - aTiming.x;
    float life = aTiming.y;
    if (t < 0.0 || t > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
      gl_PointSize = 0.0;
      return;
    }
    // x(t) = x0 + v (1 - e^-kt) / k, then gravity on top.
    float k = uDrag;
    vec3 p = position + aVelocity * (1.0 - exp(-k * t)) / k;
    p.y -= 0.5 * uGravity * t * t;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float u = t / life;
    float twinkle = 1.0 - uTwinkle * step(0.55, u) * step(0.5, fract(sin(aTiming.w * 91.7 + t * 23.0) * 43758.5));
    float rise = mix(smoothstep(0.0, 0.25, u), 1.0, uFlash);
    vAlpha = rise * (1.0 - u * u) * twinkle;
    vColor = aColor;
    gl_PointSize = aTiming.z * uScale / -mvPosition.z;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float core = smoothstep(1.0, 0.0, r);
    float alpha = core * core * vAlpha;
    if (alpha < 0.004) discard;
    // Coloured body below the bloom threshold, a small white-hot core above it:
    // pushing the colour itself into HDR bleached every shell to white.
    float hot = pow(max(1.0 - r, 0.0), 4.0);
    gl_FragColor = vec4(vColor * (0.85 + 0.3 * (1.0 - r)) + vec3(1.8) * hot, alpha);
  }
`

const ROCKET_POINTS = 14
const SHAPE_POINTS = 180

export function createFireworks({ shells = 10, intensity = 3 } = {}) {
  const perShell = ROCKET_POINTS + SHAPE_POINTS
  const capacity = shells * perShell
  const positions = new Float32Array(capacity * 3)
  const velocities = new Float32Array(capacity * 3)
  const timing = new Float32Array(capacity * 4).fill(-1e6)
  const colors = new Float32Array(capacity * 3)

  const geometry = new THREE.BufferGeometry()
  const attrs = {
    position: new THREE.BufferAttribute(positions, 3),
    aVelocity: new THREE.BufferAttribute(velocities, 3),
    aTiming: new THREE.BufferAttribute(timing, 4),
    aColor: new THREE.BufferAttribute(colors, 3),
  }
  for (const [name, attr] of Object.entries(attrs)) geometry.setAttribute(name, attr.setUsage(THREE.DynamicDrawUsage))

  const material = new THREE.ShaderMaterial({
    name: 'vfx:fireworks',
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uDrag: { value: 1.6 },
      uGravity: { value: 2.2 },
      uScale: { value: 600 }, // pixels per metre at 1 m: set from the camera each frame
      uTwinkle: { value: 1 },
      uFlash: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    // Alpha-blended HDR colour: additive washed out to white against the pale sky.
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'vfx:fireworks'
  points.frustumCulled = false
  points.renderOrder = 20
  points.visible = false

  let time = 0
  let next = 0
  let lastEnd = 0
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const colour = new THREE.Color()

  /** Burst directions for a "10" in the camera's plane, unit-ish radius. */
  function tenShape(i, n, out) {
    const ones = Math.round(n * 0.32)
    if (i < ones) {
      // The "1": a stem plus a short flag.
      const f = i / ones
      if (f < 0.8) out.set(-0.62, -0.9 + (f / 0.8) * 1.8)
      else out.set(-0.62 - ((f - 0.8) / 0.2) * 0.26, 0.9 - ((f - 0.8) / 0.2) * 0.26)
    } else {
      const a = ((i - ones) / (n - ones)) * Math.PI * 2
      out.set(0.32 + Math.cos(a) * 0.48, Math.sin(a) * 0.9)
    }
    return out
  }

  const flat = new THREE.Vector2()
  const dir = new THREE.Vector3()

  /**
   * Launch one shell from (x, groundY, z) bursting at `height`.
   * `shape`: 'ten' | 'dots'. `camera` orients a "10" to face the viewer.
   */
  function launch({ x, z, groundY = 0, height = 26, shape = 'dots', colors: palette, camera, delay = 0, size = 1 }) {
    const shell = next
    next = (next + 1) % shells
    const start = time + delay
    const rocketTime = 1.1
    const base = shell * perShell
    if (camera) {
      right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
      up.set(0, 1, 0)
    } else {
      right.set(1, 0, 0)
      up.set(0, 1, 0)
    }
    // Rocket: a short column of sparks rising from the ground to the burst.
    for (let i = 0; i < ROCKET_POINTS; i++) {
      const j = base + i
      const lag = (i / ROCKET_POINTS) * 0.35
      write(j, x, groundY, z, 0, height * 1.95, 0, start + lag, rocketTime - lag * 0.5, 0.22 + 0.2 * (1 - i / ROCKET_POINTS), 0xfff1c4)
    }
    // Burst at the apex.
    const burstStart = start + rocketTime * 0.95
    const speed = (shape === 'ten' ? 6 : 8) * size
    for (let i = 0; i < SHAPE_POINTS; i++) {
      const j = base + ROCKET_POINTS + i
      if (shape === 'ten') {
        tenShape(i, SHAPE_POINTS, flat)
        dir.copy(right).multiplyScalar(flat.x).addScaledVector(up, flat.y)
        dir.x += (Math.random() - 0.5) * 0.05
        dir.y += (Math.random() - 0.5) * 0.05
        dir.z += (Math.random() - 0.5) * 0.05
      } else {
        dir.randomDirection().multiplyScalar(0.75 + Math.random() * 0.25)
      }
      const c = palette[i % palette.length]
      write(j, x, groundY + height * 0.98, z, dir.x * speed, dir.y * speed, dir.z * speed,
        burstStart, 2.6 + Math.random() * 0.6, (0.38 + Math.random() * 0.2) * size, c)
    }
    for (const attr of Object.values(attrs)) {
      attr.clearUpdateRanges()
      attr.addUpdateRange(base * attr.itemSize, perShell * attr.itemSize)
      attr.needsUpdate = true
    }
    lastEnd = Math.max(lastEnd, burstStart + 3.4)
    points.visible = true
  }

  function write(j, x, y, z, vx, vy, vz, start, life, size, color) {
    positions.set([x, y, z], j * 3)
    velocities.set([vx, vy, vz], j * 3)
    timing[j * 4] = start
    timing[j * 4 + 1] = life
    timing[j * 4 + 2] = size
    timing[j * 4 + 3] = Math.random() * 100
    colour.set(color)
    colors[j * 3] = colour.r * intensity
    colors[j * 3 + 1] = colour.g * intensity
    colors[j * 3 + 2] = colour.b * intensity
  }

  return {
    points,
    launch,
    /** `bufferHeight`: the drawing buffer's height in pixels, for metric point sizes. */
    update(dt, camera, bufferHeight, reducedMotion = false) {
      time += dt
      material.uniforms.uTwinkle.value = reducedMotion ? 0 : 1
      material.uniforms.uFlash.value = reducedMotion ? 0 : 1
      material.uniforms.uTime.value = time
      material.uniforms.uScale.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
      if (points.visible && time > lastEnd) points.visible = false
    },
    get active() {
      return points.visible
    },
  }
}
