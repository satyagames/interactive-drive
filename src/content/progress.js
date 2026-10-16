/**
 * "Found N of total" tracker for the small persistent HUD indicator.
 * `markFound` is idempotent per id, so re-entering a trigger never double-counts.
 */
export function createProgressTracker(total, { countEl, totalEl } = {}) {
  const found = new Set()

  if (totalEl) totalEl.textContent = String(total)
  if (countEl) countEl.textContent = '0'

  return {
    /** Returns true the first time `id` is marked found, false on repeats. */
    markFound(id) {
      if (found.has(id)) return false
      found.add(id)
      if (countEl) countEl.textContent = String(found.size)
      return true
    },
    get count() {
      return found.size
    },
  }
}
