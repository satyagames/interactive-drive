import { settings } from '../config.js'
import { t } from '../content/ui.js'

/**
 * Exhibit hotspots: "drive up to it, press Enter". The station areas own the
 * Enter key while you stand in one; anywhere else, the hotspot nearest the
 * car (within its own reach) is active, the HUD hint reads "Enter: open
 * <label>", screen readers hear it once, and Enter (or the touch ↵ button)
 * opens it.
 *
 * A hotspot is `{ test(car) -> { score, item } | null, label(item), open(item), highlight?(item | null),
 * anchor?(item) -> { x, z, size?, yaw? } }`: one test covers a whole gallery
 * (Memory Lane picks its nearest frame, the newsstand the cover facing you),
 * so `item` says which. `anchor` is where the active hotspot's fence and
 * ENTER label go (`world/areaMarkers.js`); a `near()` test supplies its own.
 * A hotspot that does something other than open a card gives `action(item)`:
 * the words after "Press Enter to" (the reset pads: "rebuild the wall").
 *
 * `near(position, radius)` is the test for a single point.
 */
const MARKER = 'hotspot'

export function createHotspots({ announce, markers = null }) {
  const spots = []
  let active = null
  let pressed = false

  function mark(spot, item) {
    if (!markers) return
    const at = spot ? (spot.anchor?.(item) ?? spot.test.anchor ?? null) : null
    if (!at) {
      markers.clear(MARKER)
      return
    }
    const size = at.size ?? settings.areas.fence.hotspotSize
    markers.set(MARKER, { x: at.x, z: at.z, yaw: at.yaw ?? 0, sizeX: size, sizeZ: size, color: at.color })
    markers.key(MARKER, true)
  }

  function setActive(spot, item) {
    if (active && active.spot === spot && active.item === item) return
    mark(spot, item)
    active?.spot.highlight?.(null)
    active = spot ? { spot, item } : null
    if (active) {
      active.spot.highlight?.(item)
      const action = active.spot.action?.(item)
      announce(action ? t('showcase.actionAnnounce', { action }) : t('showcase.hotspotAnnounce', { label: active.spot.label(item) }))
    }
  }

  return {
    add(spot) {
      spots.push(spot)
      return spot
    },
    /**
     * Per frame. `blocked`: a station area is active (it has Enter).
     * `interact()` consumes a pending Enter press, if any.
     */
    update(car, { interact, blocked }) {
      let best = null
      let bestItem = null
      let bestScore = Infinity
      if (!blocked) {
        for (const spot of spots) {
          const hit = spot.test(car)
          if (hit && hit.score < bestScore) {
            best = spot
            bestItem = hit.item
            bestScore = hit.score
          }
        }
      }
      setActive(best, bestItem)
      const press = active && (pressed || interact())
      pressed = false
      if (press) active.spot.open(active.item)
    },
    /** Debug (the badge test): act as if Enter were pressed on the next update. */
    press() {
      pressed = true
    },
    /** `{ label, action }` of the hotspot in reach, or null. `action` is null for one that opens a card. */
    get active() {
      return active ? { label: active.spot.label(active.item), action: active.spot.action?.(active.item) ?? null } : null
    },
    get count() {
      return spots.length
    },
  }
}

/** Hotspot test for one point on the floor. */
export function near(position, radius) {
  const test = (car) => {
    const d = Math.hypot(car.position.x - position.x, car.position.z - position.z)
    return d <= radius ? { score: d, item: 0 } : null
  }
  test.anchor = { x: position.x, z: position.z }
  return test
}
