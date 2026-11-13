import * as THREE from 'three'

import { rebuild } from '../config.js'
import { showcaseBodies } from './builder.js'
import { createChampions } from './champions.js'
import { districtFrames } from './frame.js'
import { createHotspots } from './hotspots.js'
import { createMascots } from './mascots.js'
import { createPeopleWalls } from './peopleWalls.js'
import { viewYaw } from './labels.js'
import { createLearningGarden } from './learningGarden.js'
import { createMemoryLane } from './memoryLane.js'
import { createNewsstand } from './newsstand.js'
import { createRnr } from './rnr.js'
import { createSignposts } from './signposts.js'
import { createWinsBoard } from './winsBoard.js'

/**
 * Layer 2 of the 2D-site integration (docs/content-backup/10 §2, phase LD-C):
 * objects whose shape is the content. Each exhibit module reads its data
 * from `content/arena.seed.json -> exhibits` (and the stations it points
 * at), its layout from `rebuild.showcase`, and builds itself when its
 * district loads -- streamed districts included -- into that district's
 * static group, so the district reveal scales it in with the buildings.
 *
 * Exhibit module contract:
 *
 *   createX(ctx) -> { district | districts, build(info), update?(dt, car), stats?() }
 *
 * `ctx` (below) carries the world, the content, the hotspot registry and
 * two openers: `openStation(id)` (a real content station: XP, passport,
 * "visited" all count as usual) and `openCard(card)` (an exhibit card --
 * an album, an issue, a signpost -- shown in the same panel, counted only
 * towards the exhibit's own badge).
 *
 * Systems talk through `game.events` as everywhere else: the showcase emits
 * `exhibit` ({ counter, key }) for the badge counters and listens for
 * `easter-egg` / `finale` (the mascots celebrate).
 */
export async function createShowcase({ scene, world, RAPIER, seed, gameWorld, renderAssets, blobs, game, content, vehicle, camera, openNode, announce, overlayRoot }) {
  const group = new THREE.Group()
  group.name = 'showcase'
  scene.add(group)

  const frames = districtFrames(seed)
  const hotspots = createHotspots({ announce })
  const districtNodes = new Map([seed.hq, seed.rfpGate, ...seed.territories, ...seed.pillars].map((d) => [d.id, d]))

  const ctx = {
    scene,
    group,
    world,
    RAPIER,
    gameWorld,
    seed,
    exhibits: seed.exhibits,
    layout: rebuild.showcase,
    renderAssets,
    blobs,
    game,
    content,
    vehicle,
    camera,
    overlayRoot,
    hotspots,
    frames,
    district: (id) => districtNodes.get(id),
    colorOf: (id) => districtNodes.get(id)?.color ?? '#86BC25',
    openStation(id, options) {
      const node = content.get(id)
      if (node) openNode(node, options)
    },
    /**
     * An exhibit card in the station panel. `card`: { id, kicker, title,
     * body, images, links, district, counter?, key? } -- counter/key feed
     * the exhibit badges when it opens.
     */
    openCard(card) {
      openNode({
        id: `exhibit:${card.id}`,
        kind: 'exhibit',
        kicker: card.kicker ?? null,
        title: card.title,
        lead: card.lead ?? null,
        body: card.body ?? '',
        images: card.images ?? [],
        links: card.links ?? [],
        roles: [],
        feed: null,
        placeholder: false,
        group: { id: card.district, name: districtNodes.get(card.district)?.name ?? '', color: districtNodes.get(card.district)?.color ?? '#86BC25' },
        exhibit: card.counter ? { counter: card.counter, key: card.key } : null,
      })
    },
    /** Count `key` towards an exhibit badge counter (trophies knocked, champions found...). */
    progress(counter, key) {
      game.events.emit('exhibit', { counter, key })
    },
  }

  const modules = (await Promise.all([createMascots(ctx), createWinsBoard(ctx), createPeopleWalls(ctx), createRnr(ctx), createMemoryLane(ctx), createNewsstand(ctx), createLearningGarden(ctx), createSignposts(ctx), createChampions(ctx)])).filter(Boolean)

  const built = new Set()
  const stats = new Map()
  function buildFor(info) {
    for (const module of modules) {
      const ids = module.districts ?? [module.district]
      if (!ids.includes(info.id)) continue
      const key = `${module.name}|${info.id}`
      if (built.has(key)) continue
      built.add(key)
      const before = info.staticGroup.children.length + info.propMeshes.length
      // One exhibit failing must never take a district (or the stream) down.
      try {
        module.build(info)
      } catch (error) {
        console.error(`[showcase] ${module.name} failed to build in ${info.id}`, error)
      }
      const record = stats.get(info.id) ?? { district: info.id, exhibits: [], drawCalls: 0 }
      record.exhibits.push(module.name)
      record.drawCalls += info.staticGroup.children.length + info.propMeshes.length - before
      stats.set(info.id, record)
    }
  }
  // Register before the reveal does (main.js creates the showcase first),
  // so a district's exhibits are hidden and revealed with it.
  // Exhibits that live between districts build once, now.
  for (const module of modules) module.init?.()
  for (const info of gameWorld.districts) buildFor(info)
  gameWorld.onDistrictLoaded(buildFor)

  return {
    hotspots,
    /** Per frame, after physics. `blocked`: a station area owns Enter right now. */
    update(dt, { car, interact, blocked }) {
      for (const module of modules) module.update?.(dt, car)
      hotspots.update(car, { interact, blocked })
    },
    /** The hotspot in reach, `{ label }` or null (the HUD hint reads it). */
    get activeHotspot() {
      return hotspots.active
    },
    /**
     * `#debug` / console: every exhibit collider tested against the arena's
     * fixed colliders (lifted 6 cm so resting on the floor doesn't count).
     * Returns [{ exhibit, at: [x, y, z] }] for each overlap; empty is clean.
     */
    checkPlacement() {
      const hits = []
      world.colliders.forEach((collider) => {
        const body = collider.parent()
        if (!body || !showcaseBodies.has(body)) return
        const t = collider.translation()
        world.intersectionsWithShape({ x: t.x, y: t.y + 0.06, z: t.z }, collider.rotation(), collider.shape, (other) => {
          const ob = other.parent()
          if (ob && !showcaseBodies.has(ob) && ob.isFixed()) hits.push({ exhibit: body.userData.showcase, at: [t.x, t.y, t.z].map((v) => +v.toFixed(1)) })
          return true
        })
      })
      return hits
    },
    /** Per-district exhibit draw calls added (`#debug`; recorded in docs/memory/progress.md). */
    stats: () => [...stats.values()],
    modules,
    frames,
    layout: rebuild.showcase,
    get viewYaw() {
      return viewYaw()
    },
  }
}
