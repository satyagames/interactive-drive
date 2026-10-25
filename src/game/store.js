/**
 * Progress that survives a reload (doc 03 §3): passport, opened stations,
 * collectibles, XP, badges, personal bests, skins. One versioned JSON blob in
 * localStorage, every access try/catch-wrapped (private windows, blocked
 * storage), written at most a few times a second. No network, ever.
 */
const KEY = 'pursuit-arena/progress'
const VERSION = 1

function blank() {
  return {
    version: VERSION,
    stamps: {},          // district id -> true
    gateways: {},        // district id -> true (drove through its gateway)
    opened: {},          // content id -> true
    collected: {},       // collect_ node name -> true
    xp: 0,
    badges: {},          // badge id -> unlock time (ms)
    skins: { default: true },
    skin: 'default',
    best: {},            // 'dash' | 'paceLap' -> seconds
    counters: {},        // loops, horns, paint seconds, distance...
    finale: false,
  }
}

export function createStore() {
  let state = load()
  let timer = null

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return blank()
      const parsed = JSON.parse(raw)
      if (parsed?.version !== VERSION) return blank()
      return { ...blank(), ...parsed }
    } catch {
      return blank()
    }
  }

  function flush() {
    timer = null
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // Storage full or blocked: progress just won't persist this session.
    }
  }

  return {
    get state() {
      return state
    },
    /** Mark dirty; written within 250 ms. */
    save() {
      if (timer === null) timer = setTimeout(flush, 250)
    },
    flush,
    reset() {
      state = blank()
      if (timer !== null) clearTimeout(timer)
      timer = null
      try {
        window.localStorage.removeItem(KEY)
      } catch {
        // nothing to remove
      }
    },
  }
}
