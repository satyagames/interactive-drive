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
 * Dev-only frame-cost benchmark for the post-processing chain.
 *
 * For each (resolution, AA mode) pair it builds a disposable composer
 * mirroring the real one in `render/post.js` -- same bloom/vignette config,
 * same pass ordering -- then wraps a batch of render calls in a single
 * `EXT_disjoint_timer_query_webgl2` query and divides by the batch size.
 *
 * That extension, not wall-clock `performance.now()`, is the reason this is
 * trustworthy: Chromium's GPU process model means `gl.finish()` and a
 * `readPixels` sync point do not reliably block until the actual GPU
 * hardware work is done (confirmed by trying that approach first here --
 * it produced frame costs that *fell* as resolution rose, which is not
 * physical). A timer query is answered by the GPU itself, in GPU time, so it
 * can't be fooled by CPU/GPU queue depth or IPC batching the way a CPU-side
 * stopwatch around `finish()` can.
 *
 * Deliberately renders to an offscreen target rather than the canvas, at an
 * explicit pixel size independent of the page's current window size or
 * `devicePixelRatio` -- so results are comparable across machines and across
 * a resize of the actual app, and so the benchmark never visibly disturbs
 * the live app it borrows `renderer`/`scene`/`camera` from.
 *
 * Usage from the devtools console (dev server only):
 *
 *   await __proto.benchmark.run()
 *   await __proto.benchmark.run({ resolutions: [{ label: '1080p', width: 1920, height: 1080 }] })
 */
export async function runPostBenchmark({ renderer, scene, camera }, options = {}) {
  const {
    resolutions = [
      { label: '0.79 Mpx', width: 1024, height: 771 },
      { label: '4096x3072', width: 4096, height: 3072 },
    ],
    modes = ['none', 'msaa', 'smaa', 'fxaa'],
    framesPerCase = 60,
    warmupFrames = 10,
    msaaSamples = settings.post.aa.msaaSamples,
  } = options

  const gl = renderer.getContext()
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!timerExt) {
    console.warn('EXT_disjoint_timer_query_webgl2 unavailable -- cannot get a trustworthy GPU timing on this browser/GPU.')
  }

  // Benchmarking reuses the live camera (so the scene renders identically to
  // the real app), so its aspect/projection have to be restored afterwards.
  const savedAspect = camera.aspect
  const savedProjection = camera.projectionMatrix.clone()
  const savedRenderTarget = renderer.getRenderTarget()

  const rows = []
  try {
    for (const { label, width, height } of resolutions) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()

      rows.push({
        resolution: label,
        mpx: +((width * height) / 1e6).toFixed(2),
        mode: 'no-post',
        msPerFrame: round(await benchmarkNoPost({ renderer, gl, timerExt, scene, camera, width, height, framesPerCase, warmupFrames })),
      })

      for (const mode of modes) {
        const ms = await benchmarkComposer({
          renderer, gl, timerExt, scene, camera, width, height, mode, framesPerCase, warmupFrames, msaaSamples,
        })
        rows.push({ resolution: label, mpx: +((width * height) / 1e6).toFixed(2), mode, msPerFrame: round(ms) })
      }
    }
  } finally {
    camera.aspect = savedAspect
    camera.projectionMatrix.copy(savedProjection)
    renderer.setRenderTarget(savedRenderTarget)
  }

  if (typeof console.table === 'function') console.table(rows)
  return rows
}

function round(ms) {
  return ms === null ? null : +ms.toFixed(3)
}

/**
 * Times `renderN()` with a single GPU timer query spanning `count` calls,
 * returning ms/call. Retries once on a disjoint GPU event (a driver/OS
 * interruption invalidating the query, e.g. a display mode change) before
 * giving up and returning `null`.
 */
async function timeGpu(gl, ext, count, renderN) {
  if (!ext) {
    renderN()
    return null
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const query = gl.createQuery()
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
    renderN()
    gl.endQuery(ext.TIME_ELAPSED_EXT)
    gl.flush()

    let available = false
    let disjoint = false
    while (!available) {
      // A timer, not requestAnimationFrame: rAF stops in a hidden tab and the
      // query is answered without it.
      await new Promise((resolve) => setTimeout(resolve, 10))
      available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
      disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    }

    const ns = disjoint ? null : gl.getQueryParameter(query, gl.QUERY_RESULT)
    gl.deleteQuery(query)
    if (ns !== null) return ns / 1e6 / count
  }
  return null
}

async function benchmarkNoPost({ renderer, gl, timerExt, scene, camera, width, height, framesPerCase, warmupFrames }) {
  const target = new THREE.WebGLRenderTarget(width, height)
  renderer.setRenderTarget(target)

  for (let i = 0; i < warmupFrames; i++) renderer.render(scene, camera)

  const ms = await timeGpu(gl, timerExt, framesPerCase, () => {
    for (let i = 0; i < framesPerCase; i++) renderer.render(scene, camera)
  })

  target.dispose()
  return ms
}

/** Mirrors `render/post.js`'s pass ordering for a given AA mode. */
async function benchmarkComposer({ renderer, gl, timerExt, scene, camera, width, height, mode, framesPerCase, warmupFrames, msaaSamples }) {
  const samples = mode === 'msaa' ? msaaSamples : 0
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples })

  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(1)
  // Passes write amongst the composer's own offscreen targets even for the
  // "last" one -- without this, that pass would render to the real canvas
  // at the canvas's own size instead of the resolution under test.
  composer.renderToScreen = false

  composer.addPass(new RenderPass(scene, camera))

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    settings.post.bloom.strength,
    settings.post.bloom.radius,
    settings.post.bloom.threshold,
  )
  bloomPass.enabled = settings.post.bloom.enabled
  composer.addPass(bloomPass)

  const vignettePass = new ShaderPass(VignetteShader)
  vignettePass.enabled = settings.post.vignette.enabled
  vignettePass.uniforms.offset.value = settings.post.vignette.offset
  vignettePass.uniforms.darkness.value = settings.post.vignette.darkness
  composer.addPass(vignettePass)

  if (mode === 'smaa') {
    const smaaPass = new SMAAPass()
    composer.addPass(smaaPass)
    composer.addPass(new OutputPass())
    // SMAAPass loads its area/search lookup textures asynchronously; give
    // them a moment so the timed frames aren't measuring a no-op blend.
    await new Promise((resolve) => setTimeout(resolve, 50))
  } else if (mode === 'fxaa') {
    composer.addPass(new OutputPass())
    composer.addPass(new FXAAPass())
  } else {
    composer.addPass(new OutputPass())
  }

  for (let i = 0; i < warmupFrames; i++) composer.render()

  const ms = await timeGpu(gl, timerExt, framesPerCase, () => {
    for (let i = 0; i < framesPerCase; i++) composer.render()
  })

  composer.dispose()
  return ms
}

/**
 * VFX cost (doc 06 Phase 7: under 1 ms a frame). Run it while effects are on
 * screen -- `vfx.debug` can fill the pools first. GPU: the same frame rendered
 * offscreen with the VFX group shown and hidden, timed by the same query as
 * above; the difference is what the effects cost to draw. CPU: `vfx.update`
 * itself, timed in the loop (`vfx.stats`, a moving average and a decaying peak).
 *
 *   await __proto.benchmark.vfx()
 */
export async function runVfxBenchmark({ renderer, scene, camera, vfx }, { width = 1600, height = 900, framesPerCase = 60 } = {}) {
  const gl = renderer.getContext()
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType })
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  const time = async (visible) => {
    vfx.group.visible = visible
    for (let i = 0; i < 5; i++) renderer.render(scene, camera)
    return timeGpu(gl, timerExt, framesPerCase, () => {
      for (let i = 0; i < framesPerCase; i++) renderer.render(scene, camera)
    })
  }
  const without = await time(false)
  const withVfx = await time(true)
  renderer.setRenderTarget(previous)
  target.dispose()
  const result = {
    resolution: `${width}x${height}`,
    gpuWithMs: round(withVfx),
    gpuWithoutMs: round(without),
    gpuVfxMs: withVfx === null || without === null ? null : round(withVfx - without),
    cpuMs: round(vfx.stats.cpuMs),
    cpuPeakMs: round(vfx.stats.peakMs),
    ...vfx.counts,
  }
  if (typeof console.table === 'function') console.table([result])
  return result
}
