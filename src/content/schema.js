/**
 * A deliberately small JSON Schema (2020-12) validator covering exactly the
 * keywords `content/*.schema.json` use: type, const, enum, required,
 * properties, additionalProperties, items, prefixItems, minItems, maxItems,
 * minLength, pattern, minimum, maximum, exclusiveMaximum, anyOf, and local
 * `$ref` (`#/$defs/...`), including `$ref` with sibling keywords.
 *
 * Hand-written rather than a dependency because it only ever runs in
 * development (`main.js` under `import.meta.env.DEV`) and in
 * `npm run content:check` -- it never ships in the production bundle.
 *
 * Returns a list of `{ path, message }`; empty means valid.
 */
export function validate(schema, data) {
  const errors = []
  check(schema, data, '', schema, errors)
  return errors
}

function check(schema, value, path, root, errors) {
  if (schema === true || schema === undefined) return
  const at = path || '(root)'
  const fail = (message) => errors.push({ path: at, message })

  if (schema.$ref) check(resolve(root, schema.$ref), value, path, root, errors)

  if (schema.const !== undefined && value !== schema.const) {
    fail(`must be ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum && !schema.enum.includes(value)) {
    fail(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`)
  }
  if (schema.type && !matchesType(schema.type, value)) {
    fail(`must be ${schema.type}`)
    return
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((option) => {
      const trial = []
      check(option, value, path, root, trial)
      return trial.length === 0
    })
    if (!ok) fail('does not match any allowed form')
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('must not be empty')
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      fail(`"${value}" does not match ${schema.pattern}`)
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum}`)
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      fail(`must be < ${schema.exclusiveMaximum}`)
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`needs at least ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`allows at most ${schema.maxItems} items`)
    const prefix = schema.prefixItems ?? []
    value.forEach((item, i) => {
      const itemSchema = i < prefix.length ? prefix[i] : schema.items
      check(itemSchema, item, `${path}[${i}]`, root, errors)
    })
  } else if (value && typeof value === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push({ path: at, message: `missing required "${key}"` })
    }
    const props = schema.properties ?? {}
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key
      if (key in props) {
        check(props[key], child, childPath, root, errors)
      } else if (schema.additionalProperties === false && !hasPropertyViaRef(schema, key, root)) {
        errors.push({ path: childPath, message: 'is not an allowed property' })
      } else if (typeof schema.additionalProperties === 'object') {
        check(schema.additionalProperties, child, childPath, root, errors)
      }
    }
  }
}

/** `additionalProperties: false` next to a `$ref` should still allow the ref's own properties. */
function hasPropertyViaRef(schema, key, root) {
  if (!schema.$ref) return false
  const target = resolve(root, schema.$ref)
  return key in (target.properties ?? {}) || hasPropertyViaRef(target, key, root)
}

function resolve(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Only local $refs are supported, got ${ref}`)
  return ref
    .slice(2)
    .split('/')
    .reduce((node, part) => node?.[part], root)
}

function matchesType(type, value) {
  switch (type) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value)
    case 'array': return Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return true
  }
}

/** One readable line per error, for the console and the CLI. */
export function formatErrors(label, errors) {
  return errors.map(({ path, message }) => `${label}: ${path} ${message}`).join('\n')
}
