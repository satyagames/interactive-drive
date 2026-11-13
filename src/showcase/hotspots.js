import { t } from '../content/ui.js'

/**
 * Exhibit hotspots: "drive up to it, press Enter". The station areas own the
 * Enter key while you stand in one; anywhere else, the hotspot nearest the
 * car (within its own reach) is active, the HUD hint reads "Enter: open
 * <label>", screen readers hear it once, and Enter (or the touch ↵ button)
 * opens it.
 *
 * A hotspot is `{ test(car) -> { score, item } | null, label(item), open(item), highlight?(item | null) }`:
 * one test covers a whole gallery (Memory Lane picks its nearest frame, the
 * newsstand the cover facing you), so `item` says which.
 *
 * `near(position, radius)` is the test for a single point.
 */
export function createHotspots({ announce }) {
  const spots = []
  let active = null
  let pressed = false

  function setActive(spot, item) {
    if (active && active.spot === spot && active.item === item) return
    active?.spot.highlight?.(null)
    active = spot ? { spot, item } : null
    if (active) {
      active.spot.highlight?.(item)
      announce(t('showcase.hotspotAnnounce', { label: active.spot.label(item) }))
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
    /** `{ label }` of the hotspot in reach, or null. */
    get active() {
      return active ? { label: active.spot.label(active.item) } : null
    },
    get count() {
      return spots.length
    },
  }
}

/** Hotspot test for one point on the floor. */
export function near(position, radius) {
  return (car) => {
    const d = Math.hypot(car.position.x - position.x, car.position.z - position.z)
    return d <= radius ? { score: d, item: 0 } : null
  }
}
