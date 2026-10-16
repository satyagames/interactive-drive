import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * Renderer + scene + camera bootstrap. Owns nothing game-specific so it can be
 * reused as the prototype grows.
 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  // No background colour or fog is set here on purpose: both are the sky
  // gradient's business (`src/render/sky.js`), which owns the horizon colour
  // the fog has to match. A default set here would just be a second place for
  // that colour to go stale.
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(settings.camera.fov, 1, 0.1, 1000)
  camera.position.set(0, 6, 20)

  /**
   * Anything that keeps its own framebuffer -- the post-processing composer,
   * today -- has to be resized too, and strictly after the renderer itself.
   * Listeners are called in registration order for exactly that reason.
   */
  const listeners = []

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    // A tab that hasn't been laid out yet (e.g. still attaching to its
    // viewport) can report 0x0 here. Setting aspect to 0/0 = NaN would
    // permanently poison the chase camera's fov/position lerp downstream
    // (NaN + anything = NaN, forever) -- so wait for a real size instead.
    if (!width || !height) return
    // Read live so the debug panel's pixel-ratio cap takes effect on the
    // next resize -- call `resize()` again after changing it by hand.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.render.pixelRatioCap))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    for (const listener of listeners) listener(width, height)
  }
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)

  const onResize = (listener) => {
    listeners.push(listener)
  }

  return { renderer, scene, camera, resize, onResize }
}
