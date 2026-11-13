/**
 * The game's event bus (doc 06 Phase 6). Gameplay systems emit; VFX, SFX and
 * UI subscribe, so none of them call each other directly.
 *
 *   stamp           { district, name }            passport stamp earned
 *   station-open    { id, first }                 a station panel opened
 *   collect         { kind, id, combo, position } dot / golden / shuriken picked up
 *   xp              { amount, total, reason }
 *   rank            { rank, index }
 *   badge           { id }
 *   skin-unlock     { id }      skin            { id }
 *   dash            { phase: 'countdown' | 'start' | 'checkpoint' | 'penalty' | 'finish' | 'cancel', ... }
 *   minigame        { id, ... }                   progress / completion
 *   easter-egg      { id }
 *   finale          {}                            the full passport
 *   reset           {}                            progress wiped
 */
export function createEvents() {
  const listeners = new Map()

  function on(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type).add(listener)
    return () => listeners.get(type)?.delete(listener)
  }

  function emit(type, detail = {}) {
    for (const listener of listeners.get(type) ?? []) {
      try {
        listener(detail)
      } catch (error) {
        console.error(`[events] ${type} listener failed`, error)
      }
    }
    for (const listener of listeners.get('*') ?? []) listener({ type, ...detail })
  }

  return { on, emit }
}
