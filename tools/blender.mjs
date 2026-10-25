/**
 * Runs the arena art pipeline headless (docs/pursuit-arena/04 §1):
 *
 *   npm run art:gen        kit + base + every district  -> blender/{kit,districts}/*.blend
 *   npm run art:validate   validate.py on each .blend   -> blender/reports/*.json (+ cross-file checks)
 *   npm run art:export     export_arena.py on each      -> public/models/{kit,district_*}.glb + arena.manifest.json
 *   npm run art:build      all three, in that order
 *
 *   node tools/blender.mjs gen --only audit      one district
 *
 * Blender 5.x is found via BLENDER_BIN (environment or .env.local), then the
 * usual install paths. Nothing here touches the network.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const scripts = join(root, 'blender', 'scripts')
const districtsDir = join(root, 'blender', 'districts')
const kitBlend = join(root, 'blender', 'kit', 'arena_kit.blend')
const reportsDir = join(root, 'blender', 'reports')
const modelsDir = join(root, 'public', 'models')

const DISTRICTS = [
  'hq', 'rfp_gate', 'decade_drive',
  'audit', 'tax', 'consulting', 'pace', 'studio', 'catalyst',
  'innovation', 'rnr', 'lnd', 'toolkit', 'culture',
]

function findBlender() {
  if (process.env.BLENDER_BIN) return process.env.BLENDER_BIN
  const envLocal = join(root, '.env.local')
  if (existsSync(envLocal)) {
    const match = /^BLENDER_BIN=(.+)$/m.exec(readFileSync(envLocal, 'utf8'))
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }
  const candidates = [
    'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',
    '/Applications/Blender.app/Contents/MacOS/Blender',
    '/usr/bin/blender',
  ]
  return candidates.find((path) => existsSync(path)) ?? 'blender'
}

const blender = findBlender()

function run(script, { blend = null, extra = [] } = {}) {
  const argv = ['-b']
  if (blend) argv.push(blend)
  else argv.push('--factory-startup')
  argv.push('--python-exit-code', '1', '-P', join(scripts, script), '--', ...extra)
  const result = spawnSync(blender, argv, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const lines = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/)
  for (const line of lines) {
    if (/^\[(gen|validate|export)/.test(line) || /Error|Traceback|^\s+File /.test(line)) console.log(line)
  }
  if (result.status !== 0) {
    console.error(`\n${script} failed (exit ${result.status})${blend ? ` on ${blend}` : ''}`)
    process.exit(result.status || 1)
  }
}

const blendFor = (id) => join(districtsDir, `${id}.blend`)
const allFiles = () => [kitBlend, blendFor('base'), ...DISTRICTS.map(blendFor)]

function gen(only) {
  if (!only || only === 'kit') run('gen_kit.py', { extra: ['--out', kitBlend] })
  if (!only || only === 'base') run('gen_base.py', { extra: ['--out', blendFor('base')] })
  for (const id of DISTRICTS) {
    if (!only || only === id) run('gen_district.py', { extra: ['--id', id, '--out', blendFor(id)] })
  }
}

function validate() {
  mkdirSync(reportsDir, { recursive: true })
  for (const blend of allFiles()) run('validate.py', { blend, extra: ['--reports', reportsDir] })
  // Cross-file checks the per-file pass can't do: every content node has an
  // area, no area id is used twice, and the totals.
  const reports = readdirSync(reportsDir).filter((f) => f.endsWith('.json') && f !== 'summary.json').map((f) => JSON.parse(readFileSync(join(reportsDir, f), 'utf8')))
  const seed = JSON.parse(readFileSync(join(root, 'content', 'arena.seed.json'), 'utf8'))
  const contentIds = [
    ...seed.rfpGate.stations, ...seed.hq.stations, ...seed.timeline,
    ...seed.territories.flatMap((d) => d.stations), ...seed.pillars.flatMap((d) => d.stations),
  ].map((s) => s.id)
  const areaOwners = new Map()
  const problems = reports.flatMap((r) => r.errors.map((e) => `${r.file}: ${e}`))
  for (const r of reports) {
    for (const id of r.areas) {
      if (areaOwners.has(id)) problems.push(`area_${id} appears in both ${areaOwners.get(id)} and ${r.file}`)
      areaOwners.set(id, r.file)
    }
  }
  for (const id of contentIds) if (!areaOwners.has(id)) problems.push(`content "${id}" has no area_${id} in any district`)
  for (const id of areaOwners.keys()) if (!contentIds.includes(id)) problems.push(`area_${id} has no content entry`)

  console.table(reports.map((r) => ({
    file: r.file, tris: r.triangles, budget: r.budget ?? '', objects: r.objects, colliders: r.colliders,
    dyn: r.dynamic, inst: r.instances, areas: r.areas.length, collect: r.collectibles, errors: r.errors.length,
  })))
  const totals = reports.reduce((t, r) => ({ tris: t.tris + r.triangles, dyn: t.dyn + r.dynamic, collect: t.collect + r.collectibles }), { tris: 0, dyn: 0, collect: 0 })
  console.log(`Totals: ${totals.tris} triangles authored (instanced kit counted once), ${totals.dyn} dynamic props, ${totals.collect} collectibles, ${areaOwners.size}/${contentIds.length} content areas.`)
  writeFileSync(join(reportsDir, 'summary.json'), `${JSON.stringify({ totals, areas: areaOwners.size, contentIds: contentIds.length, problems }, null, 2)}\n`)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('Art validation passed.')
}

function exportAll() {
  mkdirSync(modelsDir, { recursive: true })
  run('export_arena.py', { blend: kitBlend, extra: ['--out', join(modelsDir, 'kit.glb')] })
  const files = [['base', blendFor('base')], ...DISTRICTS.map((id) => [id, blendFor(id)])]
  for (const [id, blend] of files) run('export_arena.py', { blend, extra: ['--out', join(modelsDir, `district_${id}.glb`)] })
  const core = new Set(['base', 'hq', 'rfp_gate', 'decade_drive', 'audit', 'tax', 'consulting', 'pace', 'studio', 'catalyst'])
  const manifest = {
    version: 1,
    kit: 'models/kit.glb',
    districts: files.map(([id]) => ({ id, url: `models/district_${id}.glb`, stage: core.has(id) ? 'core' : 'stream' })),
  }
  writeFileSync(join(modelsDir, 'arena.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`[export] wrote ${files.length + 1} GLBs and models/arena.manifest.json`)
}

const [command, flag, value] = process.argv.slice(2)
const only = flag === '--only' ? value : null
console.log(`Using Blender: ${blender}`)
if (command === 'gen') gen(only)
else if (command === 'validate') validate()
else if (command === 'export') exportAll()
else if (command === 'build') {
  gen(only)
  validate()
  exportAll()
} else {
  console.error('usage: node tools/blender.mjs <gen|validate|export|build> [--only <id|kit|base>]')
  process.exit(2)
}
