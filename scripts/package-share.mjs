#!/usr/bin/env node
/**
 * Packages the built prototype into a folder (and a zip of that folder) that
 * someone else can run on their own machine with one double-click -- no
 * hosting, no internet access, no terminal knowledge required.
 *
 *   npm run package:share
 *
 * `dist/` alone isn't enough to hand someone: `index.html` loads its JS as
 * ES modules and fetches the GLTF models/textures, and browsers refuse both
 * of those from a bare `file://` page. So the recipient still needs *a*
 * local static server -- just not a hosted one -- and this is what adds it:
 * a fresh `npm run build`, copied into `share/` alongside two launcher
 * scripts (`scripts/launchers/`) that start a local-only server on a free
 * port and open the browser for them, one per OS. The whole `share/` folder
 * is then zipped to `portfolio-share.zip` for handing off as one file.
 *
 * Safe to re-run: `share/` and the zip are removed and rebuilt from scratch
 * each time, so nothing about a previous run can leak into the next one.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, statSync, rmSync, mkdirSync, cpSync, copyFileSync, chmodSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIST_DIR = join(ROOT, 'dist')
const SHARE_DIR = join(ROOT, 'share')
const LAUNCHERS_DIR = join(ROOT, 'scripts', 'launchers')
const ZIP_PATH = join(ROOT, 'portfolio-share.zip')

const MAC_LAUNCHER = 'Start Portfolio.command'
const WIN_LAUNCHER = 'Start Portfolio.bat'

function log(message) {
  console.log(`[package:share] ${message}`)
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', cwd: ROOT, ...options })
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

function dirSize(path) {
  let total = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name)
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size
  }
  return total
}

// ---- 1. Fresh build -------------------------------------------------------
// "Fresh" matters: this is meant to be what a recipient actually gets, so it
// has to be today's build, not whatever happened to be left in dist/ from an
// earlier `npm run dev` session.

log('building...')
run('npm', ['run', 'build'])

if (!existsSync(DIST_DIR)) {
  throw new Error(`Expected ${DIST_DIR} after \`npm run build\`, but it doesn't exist.`)
}

// ---- 2. Assemble share/ ----------------------------------------------------

log('assembling share/...')
rmSync(SHARE_DIR, { recursive: true, force: true })
mkdirSync(SHARE_DIR, { recursive: true })
cpSync(DIST_DIR, SHARE_DIR, { recursive: true })

// macOS can leave Finder metadata behind in dist/ (e.g. from Quick Look);
// it means nothing to the recipient and just adds clutter to the zip.
rmSync(join(SHARE_DIR, '.DS_Store'), { force: true })

copyFileSync(join(LAUNCHERS_DIR, MAC_LAUNCHER), join(SHARE_DIR, MAC_LAUNCHER))
copyFileSync(join(LAUNCHERS_DIR, WIN_LAUNCHER), join(SHARE_DIR, WIN_LAUNCHER))

// The executable bit is what lets Finder run this as a double-clickable app
// instead of opening it in a text editor. `cpSync`/`copyFileSync` preserve
// source permissions on most platforms, but this is cheap enough to just
// force explicitly rather than trust that in a script meant to run anywhere.
chmodSync(join(SHARE_DIR, MAC_LAUNCHER), 0o755)

// ---- 3. Zip it --------------------------------------------------------------
// -X drops the extra per-file metadata (extended attributes, resource forks)
// that macOS's zip likes to add -- Windows recipients in particular have no
// use for it, and it only bloats the file. It does *not* affect the actual
// Unix permission bits (stored separately, in the central directory's
// external-attributes field), so the launcher's chmod above survives.

log('zipping...')
rmSync(ZIP_PATH, { force: true })
run('zip', ['-r', '-X', '-q', ZIP_PATH, '.'], { cwd: SHARE_DIR })

// ---- 4. Report --------------------------------------------------------------

const shareBytes = dirSize(SHARE_DIR)
const zipBytes = statSync(ZIP_PATH).size

console.log()
log('done.')
console.log(`  share/               ${formatSize(shareBytes)}`)
console.log(`  portfolio-share.zip  ${formatSize(zipBytes)}`)
console.log()
console.log('  Hand the recipient portfolio-share.zip. After unzipping:')
console.log('    macOS:   double-click "Start Portfolio.command"')
console.log('    Windows: double-click "Start Portfolio.bat"')
