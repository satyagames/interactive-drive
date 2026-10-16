import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * One shared GLTFLoader (+ Draco decoder) for both the world and vehicle
 * assets. Paths are relative (no leading `/`) so they resolve correctly
 * under `vite.config.js`'s `base: './'`, in dev and in the built `dist/`.
 */
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('draco/')

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)

export function loadGLTF(url) {
  return loader.loadAsync(url)
}
