/**
 * Badges earned at the content-driven exhibits (docs/content-backup/10 §3).
 * The rules are content -- `content/arena.seed.json -> gamification.exhibitBadges`,
 * `{ id, counter, target }` -- and the counters are sets of keys kept in the
 * progress store (`store.state.exhibits[counter][key] = true`), fed by
 * `exhibit` events ({ counter, key }) from the showcase and by station opens:
 *
 *   territories  a station opened in each team territory (key: district id)
 *   issues       Intelligence Update issues opened at the newsstand (key: issue)
 *   champions    Chronicles champion plates found (key: name)
 *   trophies     Thank It Forward trophies knocked over (key: trophy id)
 *   albums       Memory Lane albums opened (key: album title)
 *
 * `target: "all"` means every item the exhibit has, counted from the same
 * content the exhibit is built from, so the badge follows the data.
 * Opening a link never counts (doc 10 §3: link clicks never award XP).
 */
export function createExhibitBadges({ seed, store, events, progression }) {
  const rules = seed.gamification.exhibitBadges ?? []
  const ex = seed.exhibits ?? {}
  const totals = {
    territories: seed.territories.length,
    issues: ex.newsstand?.issues.length ?? 0,
    champions: ex.champions?.names.length ?? 0,
    trophies: ex.thankItForward?.awards.reduce((n, a) => n + a.count, 0) ?? 0,
    albums: ex.memoryLane?.albums.length ?? 0,
  }
  const territoryOf = new Map()
  for (const d of seed.territories) for (const s of d.stations) territoryOf.set(s.id, d.id)

  const sets = () => {
    store.state.exhibits ??= {}
    return store.state.exhibits
  }
  const targetOf = (rule) => (rule.target === 'all' ? totals[rule.counter] : rule.target)

  function check(counter) {
    const have = Object.keys(sets()[counter] ?? {}).length
    for (const rule of rules) {
      const target = targetOf(rule)
      if (rule.counter === counter && target > 0 && have >= target) progression.awardBadge(rule.id)
    }
  }

  function count(counter, key) {
    if (!(counter in totals) || key == null) return
    const set = (sets()[counter] ??= {})
    if (set[key]) return
    set[key] = true
    store.save()
    events.emit('exhibit-progress', { counter, key, count: Object.keys(set).length, total: totals[counter] })
    check(counter)
  }

  events.on('exhibit', ({ counter, key }) => count(counter, key))
  events.on('station-open', ({ id }) => {
    const territory = territoryOf.get(id)
    if (territory) count('territories', territory)
  })
  // Saves from before a rule existed, or a target that changed with the data.
  for (const counter of Object.keys(totals)) check(counter)

  return {
    ids: rules.map((r) => r.id),
    totals,
    count,
    /** How many of `counter` you have. */
    progress: (counter) => Object.keys(sets()[counter] ?? {}).length,
  }
}
