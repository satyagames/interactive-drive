/**
 * `npm run content:check` -- validates content/*.json against its schema and
 * checks the cross-references a schema can't express (unique ids, images
 * that exist in public/). Exits non-zero on any problem, so a content edit
 * can be checked without opening the app.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildContentModel } from '../src/content/model.js'
import { formatErrors, validate } from '../src/content/schema.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

const files = [
  ['content/arena.seed.json', 'content/arena.schema.json'],
  ['content/ui.json', 'content/ui.schema.json'],
]

let problems = 0
for (const [dataPath, schemaPath] of files) {
  const errors = validate(read(schemaPath), read(dataPath))
  if (errors.length) console.error(formatErrors(dataPath, errors))
  problems += errors.length
}

if (problems === 0) {
  const arena = read('content/arena.seed.json')
  const model = buildContentModel(arena)
  for (const issue of model.issues) console.error(`content/arena.seed.json: ${issue}`)
  problems += model.issues.length

  for (const node of model.nodes.values()) {
    for (const image of node.images) {
      if (!existsSync(join(root, 'public', image))) {
        console.error(`content: ${node.id} image "${image}" not found in public/`)
        problems += 1
      }
    }
  }
  const placeholders = [...model.nodes.values()].filter((node) => node.placeholder).length
  console.log(`${model.nodes.size} content nodes, ${placeholders} still marked placeholder.`)
}

console.log(problems === 0 ? 'Content OK.' : `${problems} content problem(s).`)
process.exitCode = problems === 0 ? 0 : 1
