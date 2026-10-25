import { createAchievements } from './achievements.js'
import { createCollectibles } from './collectibles.js'
import { createDash } from './dash.js'
import { createEvents } from './events.js'
import { createMinigames } from './minigames.js'
import { SKINS, createProgression } from './progression.js'
import { createStore } from './store.js'

/**
 * The game layer (doc 03): progression, collectibles, the Deadline Dash,
 * mini-games, achievements and easter eggs, sharing one store and one event
 * bus (`game.events`). `main.js` feeds it what happens in the world
 * (`stationOpened`, `trigger`, `horn`, `startDash`) and calls `update()`.
 */
export function createGame({ seed, content, gameWorld, vehicle, scene, world, RAPIER, renderAssets }) {
  const events = createEvents()
  const store = createStore()
  const progression = createProgression({ seed, content, store, events })
  const collectibles = createCollectibles({ gameWorld, store, events, progression, seed })
  const dash = createDash({ seed, gameWorld, events, progression, store })
  const minigames = createMinigames({ seed, gameWorld, events, progression, store, scene })
  const achievements = createAchievements({ events, progression, store, scene, world, RAPIER, renderAssets })

  let clock = 0

  const applySkin = () => vehicle.setTint?.(SKINS[store.state.skin]?.tint ?? null)
  events.on('skin', applySkin)
  applySkin()

  collectibles.sync()
  gameWorld.onDistrictLoaded(() => collectibles.sync())

  return {
    events,
    store,
    progression,
    collectibles,
    dash,
    minigames,
    achievements,

    /** Per frame, after physics. Returns { hold } -- the dash countdown holds the car. */
    update(dt) {
      clock += dt
      collectibles.update(dt, vehicle.position)
      minigames.update(dt, vehicle, clock)
      achievements.update(dt, vehicle)
      achievements.sync()
      return dash.update(dt, vehicle)
    },
    stationOpened(id) {
      progression.stationOpened(id)
      if (id === 'gate_deadline_dash') dash.start()
    },
    trigger(name) {
      if (name.startsWith('trigger_stamp_')) progression.gateway(name.slice('trigger_stamp_'.length))
      achievements.trigger(name)
    },
    horn() {
      achievements.horn(vehicle)
    },
    /** Wipe all progress (the Passport screen's Reset). The page reloads to rebuild the world. */
    resetProgress() {
      store.reset()
      events.emit('reset', {})
      window.location.reload()
    },
  }
}
