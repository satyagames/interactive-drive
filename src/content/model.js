/**
 * Turns `content/arena.seed.json` into the one tree that drives the 3D
 * placement (`area_` / `trigger_` ids), the Explore menu and, later, the
 * Passport -- docs/pursuit-arena/05 §6. Pure data in, pure data out (no
 * DOM), so `npm run content:check` can run it under Node too.
 *
 * Every openable thing becomes a node with one shape, whatever it came from:
 *
 *   { id, kind, title, kicker, lead, body, images[], links[], roles[],
 *     status, placeholder, group: { id, name, color }, position: [x, y, z] }
 *
 * `legacyExhibits` (content/projects.json) keeps the prototype world's four
 * `trigger_exhibit_*` volumes working until the Phase 4 arena replaces them;
 * they are reachable by trigger only, not listed in Explore.
 */

/** Brand green, for groups whose seed entry carries no colour of its own. */
const DEFAULT_COLOR = '#86BC25'

/**
 * Where the Explore fly-to aims for the Decade Drive: the middle of the 180°
 * spoke between the HQ plaza edge (22 m) and the RFP Gate (105 m), doc 02 §2
 * / §3.1. Individual arches get real positions from Blender in Phase 4.
 */
const DECADE_DRIVE_FOCUS = [0, 0, 62]

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

export function buildContentModel(arena, { legacyExhibits = [], labels = {} } = {}) {
  const nodes = new Map()
  const issues = []

  const add = (node) => {
    if (nodes.has(node.id)) issues.push(`duplicate content id "${node.id}"`)
    nodes.set(node.id, node)
    return node.id
  }

  const groupOf = (source, fallbackName) => ({
    id: source.id,
    name: source.name ?? fallbackName,
    color: source.color ?? DEFAULT_COLOR,
  })

  const stationNode = (station, group, position) => ({
    id: station.id,
    kind: 'station',
    title: station.title,
    kicker: group.name,
    lead: null,
    body: station.body,
    images: imagesOf(station),
    links: station.links ?? [],
    roles: station.roles ?? [],
    status: station.status,
    placeholder: station.status === 'placeholder',
    group,
    position,
  })

  const tree = []

  // ---- Start: RFP Gate ------------------------------------------------------
  const gate = arena.rfpGate
  const gateGroup = groupOf(gate, labels.start)
  tree.push({
    ...gateGroup,
    label: labels.start ? `${labels.start}: ${gateGroup.name}` : gateGroup.name,
    position: gate.position,
    items: gate.stations.map((s) => add(stationNode(s, gateGroup, gate.position))),
  })

  // ---- HQ -------------------------------------------------------------------
  const hq = arena.hq
  const hqGroup = groupOf(hq)
  const hqItems = []
  for (const station of hq.stations) {
    if (station.id === 'hq_leadership') {
      // The Leadership Balcony is where the leader's welcome lives (doc 02
      // §3.2), so it shows the `hq.leader` block rather than its own body.
      const leader = hq.leader
      hqItems.push(add({
        ...stationNode(station, hqGroup, hq.position),
        kind: 'leader',
        lead: labels.leader ?? null,
        body: leader.welcome,
        images: leader.photo ? [leader.photo] : imagesOf(station),
        roles: [{ name: leader.name, role: `${leader.title} · ${leader.role}` }],
        status: worstStatus(station.status, leader.status),
        placeholder: station.status === 'placeholder' || leader.status === 'placeholder',
      }))
    } else {
      hqItems.push(add(stationNode(station, hqGroup, hq.position)))
    }
  }
  const timelineGroup = { id: 'decade_drive', name: labels.timeline ?? 'Decade Drive', color: hqGroup.color }
  const timelineItems = arena.timeline.map((m) => add({
    id: m.id,
    kind: 'milestone',
    title: m.title,
    kicker: m.year ? `${m.label} · ${m.year}` : m.label,
    lead: null,
    body: m.caption,
    images: m.image ? [m.image] : [],
    links: [],
    roles: [],
    status: m.status,
    placeholder: m.status === 'placeholder',
    group: timelineGroup,
    position: DECADE_DRIVE_FOCUS,
  }))
  tree.push({
    ...hqGroup,
    label: hqGroup.name,
    position: hq.position,
    items: hqItems,
    groups: [{ ...timelineGroup, label: timelineGroup.name, position: DECADE_DRIVE_FOCUS, items: timelineItems }],
  })

  // ---- I. Our Team: territories ------------------------------------------------
  const districtEntry = (district) => {
    const group = groupOf(district)
    return {
      ...group,
      label: group.name,
      position: district.position,
      items: district.stations.map((s) => add(stationNode(s, group, district.position))),
    }
  }
  tree.push({
    id: 'our_team',
    name: labels.ourTeam ?? 'Our Team',
    label: labels.ourTeam ?? 'Our Team',
    color: DEFAULT_COLOR,
    position: hq.position,
    items: [],
    groups: arena.territories.map(districtEntry),
  })

  // ---- II-VI: pillars, in IA order (their names carry the numeral) -----------
  const pillars = [...arena.pillars].sort((a, b) => romanPrefix(a.name) - romanPrefix(b.name))
  for (const pillar of pillars) tree.push(districtEntry(pillar))

  // ---- cross-reference checks a schema can't express --------------------------
  for (const district of [...arena.territories, ...arena.pillars]) {
    if (district.stampTrigger !== `trigger_stamp_${district.id}`) {
      issues.push(`${district.id}: stampTrigger should be "trigger_stamp_${district.id}"`)
    }
  }

  // ---- prototype exhibits (trigger-only) ------------------------------------
  const legacyGroup = { id: 'prototype', name: '', color: DEFAULT_COLOR }
  for (const exhibit of legacyExhibits) {
    add({
      id: exhibit.id,
      kind: 'exhibit',
      title: exhibit.title,
      kicker: null,
      lead: exhibit.pitch,
      body: exhibit.description,
      images: exhibit.image ? [exhibit.image] : [],
      links: [],
      roles: [],
      status: 'placeholder',
      placeholder: true,
      group: legacyGroup,
      position: null,
    })
  }

  return {
    nodes,
    tree,
    issues,
    get: (id) => nodes.get(id),
    /** Every node reachable from the Explore tree, in menu order. */
    exploreIds() {
      const out = []
      const walk = (entry) => {
        out.push(...entry.items)
        for (const child of entry.groups ?? []) walk(child)
      }
      tree.forEach(walk)
      return out
    },
  }
}

function imagesOf(station) {
  if (station.images?.length) return station.images
  return station.image ? [station.image] : []
}

function worstStatus(...statuses) {
  return statuses.includes('placeholder') ? 'placeholder' : 'final'
}

function romanPrefix(name) {
  const match = /^([IVX]+)\./.exec(name)
  return match ? ROMAN[match[1]] ?? 99 : 99
}
