#!/usr/bin/env node
/**
 * Packages Pursuit Arena into a folder (and a zip of it) that someone can run
 * on their own computer with one double-click: no hosting, no internet, no
 * terminal.
 *
 *   npm run package:share   ->  share/  and  pursuit-arena-share.zip
 *
 * `dist/` alone isn't enough: the page loads ES modules and fetches its 3D
 * files, and browsers refuse both from a bare `file://` page, so the
 * recipient still needs a *local* server. This adds one: a fresh build,
 * plus two launchers ("Start Pursuit Arena" .bat / .command) and two tiny
 * servers (serve.py, serve.mjs; no packages) that serve the folder on
 * 127.0.0.1 and open the browser (scripts/launchers/).
 *
 * The zip is written here in plain Node rather than with a system `zip`
 * (Windows has none), and records the macOS launcher as executable so Finder
 * will run it on a double-click.
 *
 * Safe to re-run: share/ and the zip are rebuilt from scratch each time.
 */

import { execSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIST_DIR = join(ROOT, 'dist')
const SHARE_DIR = join(ROOT, 'share')
const LAUNCHERS_DIR = join(ROOT, 'scripts', 'launchers')
const ZIP_PATH = join(ROOT, 'pursuit-arena-share.zip')

const MAC_LAUNCHER = 'Start Pursuit Arena.command'
const WIN_LAUNCHER = 'Start Pursuit Arena.bat'
const SERVERS = ['serve.py', 'serve.mjs']
/** CRC-32 lookup for the zip writer (defined up here: the script runs top to bottom). */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function log(message) {
  console.log(`[package:share] ${message}`)
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

// ---- 1. Fresh build: what the recipient gets has to be today's. -----------
log('building...')
// Through the shell: npm is npm.cmd on Windows, which Node won't spawn directly.
execSync('npm run build', { stdio: 'inherit', cwd: ROOT })
if (!existsSync(DIST_DIR)) throw new Error(`Expected ${DIST_DIR} after the build, but it doesn't exist.`)

// ---- 2. Assemble share/ -----------------------------------------------------
log('assembling share/...')
rmSync(SHARE_DIR, { recursive: true, force: true })
mkdirSync(SHARE_DIR, { recursive: true })
cpSync(DIST_DIR, SHARE_DIR, { recursive: true })
rmSync(join(SHARE_DIR, '.DS_Store'), { force: true })
// Unix line endings for the Mac launcher and the servers whatever the checkout
// did (a CRLF .command won't run on macOS).
for (const name of [MAC_LAUNCHER, ...SERVERS]) {
  writeFileSync(join(SHARE_DIR, name), readFileSync(join(LAUNCHERS_DIR, name), 'utf8').replace(/\r\n/g, '\n'))
}
// Batch files want CRLF: with bare LF, cmd.exe can mis-read goto labels.
const bat = readFileSync(join(LAUNCHERS_DIR, WIN_LAUNCHER), 'utf8').replace(/\r?\n/g, '\r\n')
writeFileSync(join(SHARE_DIR, WIN_LAUNCHER), bat)
chmodSync(join(SHARE_DIR, MAC_LAUNCHER), 0o755)

// ---- 3. Zip it ----------------------------------------------------------------
log('zipping...')
rmSync(ZIP_PATH, { force: true })
writeFileSync(ZIP_PATH, zip(files(SHARE_DIR).map((full) => ({
  name: relative(SHARE_DIR, full).split(sep).join('/'),
  data: readFileSync(full),
  executable: full.endsWith('.command'),
}))))

// ---- 4. Report ------------------------------------------------------------------
const shareBytes = files(SHARE_DIR).reduce((sum, f) => sum + statSync(f).size, 0)
console.log()
log('done.')
console.log(`  share/                    ${formatSize(shareBytes)}`)
console.log(`  pursuit-arena-share.zip   ${formatSize(statSync(ZIP_PATH).size)}`)
console.log()
console.log('  Hand over pursuit-arena-share.zip. After unzipping:')
console.log(`    Windows: double-click "${WIN_LAUNCHER}"`)
console.log(`    macOS:   double-click "${MAC_LAUNCHER}"`)

/**
 * A minimal ZIP writer (deflate, no encryption, no zip64 -- the package is a
 * few MB). Each entry records Unix permissions in its external attributes
 * ("made by" Unix), which is how the macOS launcher keeps its executable bit.
 */
function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  const time = dosTime(new Date())
  for (const { name, data, executable } of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0x0800, 6)      // UTF-8 names
    local.writeUInt16LE(8, 8)           // deflate
    local.writeUInt16LE(time.time, 10)
    local.writeUInt16LE(time.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE((3 << 8) | 20, 4)   // made by: Unix, spec 2.0
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time.time, 12)
    central.writeUInt16LE(time.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(((executable ? 0o100755 : 0o100644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + compressed.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
