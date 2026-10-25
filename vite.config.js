import { defineConfig } from 'vite'

/**
 * three's DRACOLoader.js computes its own bundled-decoder URLs via
 * `new URL('../libs/draco/...', import.meta.url)` at module scope, so Vite's
 * static analysis copies those files into the build regardless of whether
 * they're ever reached at runtime. `src/core/gltf.js` always calls
 * `setDecoderPath('draco/')`, which fully overrides those defaults before
 * any decoder is loaded -- so the copies are dead weight (~1.3 MB). This
 * drops them from the emitted bundle rather than shipping unused decoder
 * duplicates alongside the real ones in `public/draco/`.
 */
function dropUnusedDracoBundleAssets() {
  return {
    name: 'drop-unused-draco-bundle-assets',
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/^assets\/draco_(decoder|wasm_wrapper)-/.test(fileName)) delete bundle[fileName]
      }
    },
  }
}

/**
 * File watching for the dev server.
 *
 * On Windows the native watcher sometimes misses an edit -- typically the
 * second of two writes in quick succession -- and Vite then keeps serving the
 * half-edited module until something else touches the file (this bit Phases
 * 2, 5 and 6: a "not defined" error for code that was plainly on disk).
 * Polling compares file stats on a timer instead, so every change is seen;
 * `awaitWriteFinish` waits until a file stops changing before reloading, so a
 * module is never picked up mid-write.
 *
 * On by default on Windows, off elsewhere; force it either way with
 * VITE_WATCH_POLL=1 / VITE_WATCH_POLL=0. Generated and binary folders are
 * ignored so polling stays cheap.
 */
const pollEnv = process.env.VITE_WATCH_POLL
const usePolling = pollEnv === undefined ? process.platform === 'win32' : pollEnv === '1'

const watch = {
  usePolling,
  interval: 100,
  binaryInterval: 500,
  awaitWriteFinish: usePolling ? { stabilityThreshold: 80, pollInterval: 20 } : false,
  ignored: ['**/dist/**', '**/share/**', '**/blender/**', '**/.git/**'],
}

export default defineConfig({
  // Relative base so the built dist/ can be served from any sub-path.
  base: './',
  plugins: [dropUnusedDracoBundleAssets()],
  server: {
    host: true,
    open: true,
    // Respect an externally-assigned port (e.g. from a preview harness)
    // instead of always falling back to 5173/5174/....
    port: Number(process.env.PORT) || 5173,
    watch,
  },
  preview: {
    host: true,
    open: true,
    port: Number(process.env.PORT) || 4173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Rapier's compat build inlines a ~2 MB base64 wasm blob; that is expected.
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
})
