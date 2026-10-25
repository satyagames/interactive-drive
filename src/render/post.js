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

  return { composer, render, setSize, dispose, passes: { renderPass, bloomPass, vignettePass } }
}
