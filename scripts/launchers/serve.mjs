// Pursuit Arena's offline server (Node.js, no packages needed).
//
// Serves this folder on 127.0.0.1 -- this computer only, nothing is exposed
// to the network -- on a free port, then opens the default browser. Started
// by the "Start Pursuit Arena" launchers when Python isn't available; close
// the window to stop it. The same job as serve.py, with the same fixed MIME
// types (JavaScript modules refuse to load if served as text/plain).
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Ends with a separator, so a request that climbs out with .. never matches.
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://local').pathname)
  let file = normalize(join(ROOT, path))
  // Never serve anything outside this folder.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end()
    return
  }
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html')
    const size = statSync(file).size
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': size })
    createReadStream(file).pipe(res)
  } catch {
    res.writeHead(404).end('Not found')
  }
})

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`
  console.log(`Pursuit Arena is running at ${url}`)
  console.log('Your browser should open in a moment. Close this window to stop.')
  if (process.argv.includes('--no-open')) return
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
})
