/**
 * XP, ranks, the Pursuit Passport, badges and skins (doc 03 §2.1, 2.2, 2.6,
 * 2.8). Numbers come from `content/arena.seed.json -> gamification`; names
 * from content (ranks) and content/ui.json (badges, skins).
 *
 * Passport: one stamp per team territory and pillar district (11). A stamp
 * needs both: driving through the district's gateway (`trigger_stamp_<id>`)
 * and opening at least one of its stations -- in either order. All 11 ->
 * the Decade Finale and the "Pursuit Legend" rank and badge.
 */

/** Every badge, in the order doc 03 §2.6 lists them. */
export const BADGES = [
  'first_drive', 'decade_historian', 'variance_found', 'coin_collector', 'bright_idea', 'pole_position',
  'across_time_zones', 'bright_strike', 'red_tape_cutter', 'proposal_ninja', 'social_butterfly',
  'lifelong_learner', 'toolkit_pro', 'loop_the_0', 'airtime', 'deadline_hero', 'pursuit_legend',
]

/** Skins and what unlocks them (doc 03 §2.8). */
export const SKINS = {
  default: { tint: null },
  ninja: { tint: '#2B2B2B' },          // all 8 shuriken
  golden: { tint: '#E3B505' },         // Konami code or the full passport
  paint: { tint: '#E86A5C' },          // 60 s of Paint Trail in the Studio
}

export function createProgression({ seed, content, store, events }) {
  const g = seed.gamification
  const districts = [...seed.territories, ...seed.pillars]
  const districtIds = districts.map((d) => d.id)
  const stationDistrict = new Map()
  for (const d of districts) for (const s of d.stations) stationDistrict.set(s.id, d.id)

  const s = () => store.state

  function addXp(amount, reason) {
    if (!amount) return
    const before = rankIndex()
    s().xp += amount
    store.save()
    events.emit('xp', { amount, total: s().xp, reason })
    const after = rankIndex()
    if (after > before) events.emit('rank', { rank: g.ranks[after][0], index: after })
  }

  /** Highest rank whose threshold is met; "fullPassport" needs every stamp. */
  function rankIndex() {
    let index = 0
    g.ranks.forEach(([, threshold], i) => {
      const met = threshold === 'fullPassport' ? passportComplete() : s().xp >= threshold
      if (met) index = i
    })
    return index
  }

  function awardBadge(id) {
    if (!BADGES.includes(id) || s().badges[id]) return false
    s().badges[id] = Date.now()
    store.save()
    events.emit('badge', { id })
    addXp(g.xp.badge, `badge:${id}`)
    return true
  }

  function unlockSkin(id) {
    if (!SKINS[id] || s().skins[id]) return false
    s().skins[id] = true
    store.save()
    events.emit('skin-unlock', { id })
    return true
  }

  function setSkin(id) {
    if (!s().skins[id]) return false
    s().skin = id
    store.save()
    events.emit('skin', { id })
    return true
  }

  function passportComplete() {
    return districtIds.every((id) => s().stamps[id])
  }

  function tryStamp(district) {
    if (s().stamps[district] || !s().gateways[district]) return
    const opened = districts.find((d) => d.id === district)?.stations.some((st) => s().opened[st.id])
    if (!opened) return
    s().stamps[district] = true
    store.save()
    const name = districts.find((d) => d.id === district)?.name ?? district
    events.emit('stamp', { district, name, count: Object.keys(s().stamps).length, total: districtIds.length })
    addXp(g.xp.stamp, `stamp:${district}`)
    if (passportComplete() && !s().finale) {
      s().finale = true
      store.save()
      awardBadge('pursuit_legend')
      unlockSkin('golden')
      events.emit('finale', {})
      events.emit('rank', { rank: g.ranks[rankIndex()][0], index: rankIndex() })
    }
  }

  /** A `trigger_stamp_<district>` was driven through. */
  function gateway(district) {
    if (!districtIds.includes(district)) return
    if (!s().gateways[district]) {
      s().gateways[district] = true
      store.save()
    }
    tryStamp(district)
  }

  /** A station panel opened (by an area, Explore or a trigger). */
  function stationOpened(id) {
    const first = !s().opened[id]
    if (first) {
      s().opened[id] = true
      store.save()
      addXp(g.xp.panelFirstOpen, `open:${id}`)
    }
    events.emit('station-open', { id, first })
    const district = stationDistrict.get(id)
    if (district) tryStamp(district)
    // Open-every-station badges.
    const all = (districtId) => districts.find((d) => d.id === districtId).stations.every((st) => s().opened[st.id])
    if (district === 'culture' && all('culture')) awardBadge('social_butterfly')
    if (district === 'lnd' && all('lnd')) awardBadge('lifelong_learner')
    if (district === 'toolkit' && all('toolkit')) awardBadge('toolkit_pro')
  }

  return {
    addXp,
    awardBadge,
    unlockSkin,
    setSkin,
    gateway,
    stationOpened,
    passportComplete,
    get rank() {
      const index = rankIndex()
      return { index, name: g.ranks[index][0], next: g.ranks[index + 1] ?? null }
    },
    get xp() {
      return s().xp
    },
    get stamps() {
      return districtIds.map((id) => ({ id, stamped: Boolean(s().stamps[id]), district: districts.find((d) => d.id === id) }))
    },
    get badges() {
      return BADGES.map((id) => ({ id, unlocked: Boolean(s().badges[id]) }))
    },
    get skins() {
      return Object.keys(SKINS).map((id) => ({ id, unlocked: Boolean(s().skins[id]), active: s().skin === id }))
    },
    stationTitle: (id) => content.get(id)?.title ?? id,
  }
}
