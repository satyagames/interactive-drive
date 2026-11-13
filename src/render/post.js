import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js'

import { settings } from '../config.js'

/**
 * Tilt-shift: one axis of a separable 9-tap Gaussian (linear-sampling
 * offsets 1.385 and 3.231 px), blended in by how far the pixel sits from the
 * horizontal middle of the screen. Run twice (x, then y). Same idea as the
 * reference's blur pass; written for this project.
 */
const TiltShiftShader = {
  name: 'TiltShiftShader',
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uDirection: { value: new THREE.Vector2(1, 0) },
    uStrength: { value: 1 },
    uFalloff: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform vec2 uDirection;
    uniform float uStrength;
    uniform float uFalloff;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      // 0 in the middle band, 1 at the top and bottom edges.
      float amount = pow(1.0 - sin(vUv.y * 3.14159265), uFalloff);
      vec2 step1 = uDirection * uTexel * 1.3846153846 * uStrength;
      vec2 step2 = uDirection * uTexel * 3.2307692308 * uStrength;
      vec4 blurred = base * 0.2270270270;
      blurred += texture2D(tDiffuse, vUv + step1) * 0.3162162162;
      blurred += texture2D(tDiffuse, vUv - step1) * 0.3162162162;
      blurred += texture2D(tDiffuse, vUv + step2) * 0.0702702703;
      blurred += texture2D(tDiffuse, vUv - step2) * 0.0702702703;
      gl_FragColor = mix(base, blurred, clamp(amount, 0.0, 1.0));
    }`,
}

/** A soft radial wash of light colour, strongest at uPosition (screen UV). */
const GlowShader = {
  name: 'GlowShader',
  uniforms: {
    tDiffuse: { value: null },
    uPosition: { value: new THREE.Vector2(0, 0.85) },
    uRadius: { value: 0.85 },
    uColor: { value: new THREE.Color() },
    uAlpha: { value: 0.35 },
    uAspect: { value: 1 },
  },
  vertexShader: TiltShiftShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uPosition;
    uniform float uRadius;
    uniform vec3 uColor;
    uniform float uAlpha;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float glow = clamp((1.0 - distance(vUv, uPosition) / uRadius) * uAlpha, 0.0, 1.0);
      gl_FragColor = vec4(mix(base.rgb, uColor, glow), base.a);
    }`,
}

/**
 * Post-processing chain: bloom, then vignette, then anti-aliasing + output.
 *
 * Both effects are meant to be almost invisible -- enough to stop the frame
 * looking like a raw viewport, not enough to be a "look". Defaults live in
 * `settings.post` and are read every frame, so the debug panel can dial any
 * of it to nothing without a reload.
 *
 * `render()` falls back to a straight `renderer.render()` when the whole
 * chain is off. That is not just a convenience: it makes the cost of post
 * measurable against a true zero.
 *
 * Ordering note: bloom and vignette run *before* `OutputPass`, i.e. on linear
 * HDR values. Bloom has to (it thresholds on real luminance); the vignette is
 * a multiply, so linear is the more predictable place for it too. The AA pass
 * is the one thing whose position in the chain depends on which algorithm:
 * see `buildAaChain()`.
 */
export function createPostProcessing({ renderer, scene, camera, canvas }) {
  const size = new THREE.Vector2()
  renderer.getSize(size)

  const pixelRatio = renderer.getPixelRatio()

  // EffectComposer's default target has no MSAA, so turning post on would
  // otherwise silently throw away the renderer's own `antialias: true`.
  // Half float rather than 8-bit because bloom thresholds on real luminance
  // and `OutputPass` still has to tone-map at the end of the chain. Samples
  // start at 0 here regardless of `settings.post.aa.mode` -- `syncAaChain()`
  // (called once below, and every frame after) corrects it immediately.
  const target = new THREE.WebGLRenderTarget(
    Math.max(size.x * pixelRatio, 1),
    Math.max(size.y * pixelRatio, 1),
    { type: THREE.HalfFloatType, samples: 0 },
  )
  target.texture.name = 'post.rt'

  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(pixelRatio)

  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    settings.post.bloom.strength,
    settings.post.bloom.radius,
    settings.post.bloom.threshold,
  )
  composer.addPass(bloomPass)

  // Reference depth stack: tilt-shift (x then y), then the glow.
  const tiltShiftX = new ShaderPass(TiltShiftShader)
  const tiltShiftY = new ShaderPass(TiltShiftShader)
  tiltShiftY.uniforms.uDirection.value.set(0, 1)
  composer.addPass(tiltShiftX)
  composer.addPass(tiltShiftY)
  const glowPass = new ShaderPass(GlowShader)
  composer.addPass(glowPass)
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false
  let glowHex = null

  const vignettePass = new ShaderPass(VignetteShader)
  composer.addPass(vignettePass)

  // Built lazily and reused across mode switches -- constructing SMAAPass
  // loads its area/search lookup textures asynchronously, so it should only
  // ever happen once per session, not on every toggle.
  const outputPass = new OutputPass()
  let smaaPass = null
  let fxaaPass = null

  let currentRtSamples = -1
  let currentAaMode = null

  /**
   * Rebuilds the render target when the MSAA sample count it needs changes
   * (switching in/out of 'msaa' mode, or dialling its sample count). `reset()`
   * with no argument clones the current target (carrying the new sample
   * count) and re-sizes it, so this is the whole job.
   */
  function syncRenderTarget() {
    const desired = settings.post.aa.mode === 'msaa' ? settings.post.aa.msaaSamples : 0
    if (desired === currentRtSamples) return
    currentRtSamples = desired
    composer.renderTarget1.samples = currentRtSamples
    composer.reset()
  }

  /**
   * Rebuilds the tail of the pass chain when `settings.post.aa.mode` changes.
   * Everything up to and including `vignettePass` is permanent; only what
   * comes after it is mode-dependent:
   *
   * - 'msaa': the render target itself is multisampled (see `syncRenderTarget`),
   *   so no extra pass is needed -- just `OutputPass`.
   * - 'smaa': SMAAPass operates on linear values and must run *before*
   *   `OutputPass` (its own docs are explicit about this).
   * - 'fxaa': the opposite -- FXAA's luma edge search assumes the
   *   gamma-encoded display image, so it runs *after* `OutputPass`.
   * - 'none': no MSAA and no AA pass. The raw aliased image, for comparison.
   */
  function syncAaChain() {
    const mode = settings.post.aa.mode
    if (mode === currentAaMode) return
    currentAaMode = mode

    for (const pass of [smaaPass, fxaaPass, outputPass]) {
      if (pass) composer.removePass(pass)
    }

    if (mode === 'smaa') {
      if (!smaaPass) smaaPass = new SMAAPass()
      composer.addPass(smaaPass)
      composer.addPass(outputPass)
    } else if (mode === 'fxaa') {
      composer.addPass(outputPass)
      if (!fxaaPass) fxaaPass = new FXAAPass()
      composer.addPass(fxaaPass)
    } else {
      composer.addPass(outputPass)
    }
  }

  function syncUniforms() {
    const { bloom, vignette } = settings.post

    bloomPass.enabled = bloom.enabled
    bloomPass.strength = bloom.strength
    bloomPass.radius = bloom.radius
    bloomPass.threshold = bloom.threshold
    bloomPass.highPassUniforms.smoothWidth.value = bloom.softness

    const tilt = settings.post.tiltShift
    const tiltOn = tilt.enabled && tilt.strength > 0 && (tilt.onTouch || !isTouch)
    tiltShiftX.enabled = tiltOn
    tiltShiftY.enabled = tiltOn
    if (tiltOn) {
      const target = composer.readBuffer
      const texel = tiltShiftX.uniforms.uTexel.value.set(1 / target.width, 1 / target.height)
      tiltShiftY.uniforms.uTexel.value.copy(texel)
      // Radius in CSS pixels, so the look holds at any pixel ratio.
      const k = tilt.strength * renderer.getPixelRatio()
      tiltShiftX.uniforms.uStrength.value = k
      tiltShiftY.uniforms.uStrength.value = k
      tiltShiftX.uniforms.uFalloff.value = tilt.falloff
      tiltShiftY.uniforms.uFalloff.value = tilt.falloff
    }

    const glow = settings.post.glow
    glowPass.enabled = glow.enabled && glow.alpha > 0
    if (glowPass.enabled) {
      if (glow.color !== glowHex) {
        glowHex = glow.color
        // The composer works in linear space before OutputPass.
        glowPass.uniforms.uColor.value.set(glow.color)
      }
      glowPass.uniforms.uPosition.value.set(glow.x, glow.y)
      glowPass.uniforms.uRadius.value = glow.radius
      glowPass.uniforms.uAlpha.value = glow.alpha
    }

    vignettePass.enabled = vignette.enabled
    vignettePass.uniforms.offset.value = vignette.offset
    vignettePass.uniforms.darkness.value = vignette.darkness
  }

  // Establish the initial target/chain before the first frame, rather than
  // waiting for the first `render()` to discover it needs one.
  syncRenderTarget()
  syncAaChain()

  function render(delta) {
    if (!settings.post.enabled) {
      renderer.render(scene, camera)
      return
    }
    syncRenderTarget()
    syncAaChain()
    syncUniforms()
    composer.render(delta)
  }

  function setSize() {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(width, height)
  }

  function dispose() {
    composer.dispose()
  }

  return { composer, render, setSize, dispose, passes: { renderPass, bloomPass, tiltShiftX, tiltShiftY, glowPass, vignettePass } }
}
