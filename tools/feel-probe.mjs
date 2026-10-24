/**
 * `npm run probe:feel` -- runs src/debug/feelProbe.js under Node and prints
 * the pass/fail table against docs/pursuit-arena/07-feel-targets.md.
 * Exits non-zero if any target or sanity check fails.
 */
import RAPIER from '@dimforge/rapier3d-compat'

import { runFeelProbe } from '../src/debug/feelProbe.js'

await RAPIER.init()
const { rows, sanity, passed } = runFeelProbe({ RAPIER })

console.table(rows)
for (const [label, ok] of sanity) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
console.log(passed ? '\nAll feel targets within tolerance.' : '\nSome feel targets are out of tolerance.')
process.exitCode = passed ? 0 : 1
