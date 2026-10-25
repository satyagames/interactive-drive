import * as THREE from 'three'

import { settings } from '../config.js'
import { createAmbience, setParam } from './ambience.js'
import { createEngineSound } from './engine.js'
import { createMixer } from './mixer.js'
import { createMusic } from './music.js'
import { createSounds } from './sounds.js'
import { createNoiseBuffers, createVoices } from './synth.js'

/**
 * Sound (doc 05 §3, doc 06 Phase 8). Composes the mixer, the car's engine
 * and tyres, the event-driven one-shots, positional ambiences and the
 * adaptive music.
 *
 * No AudioContext exists until the visitor's first click, tap or key press
 * (browsers would block it anyway, and doc 05 asks for silence until then).
 * Bus levels and mute are the visitor's and are kept in localStorage
 * (`pursuit-arena/audio`, try/catch-wrapped, like the progress store).
 * The tab going hidden suspends the context.
 */
const STORAGE_KEY = 'pursuit-arena/audio'
const GESTURES = ['pointerdown', 'keydown', 'touchend']
const BUSES = ['master', 'music', 'sfx', 'ambience']

function loadPrefs() {
  const prefs = { volumes: { ...settings.audio.volumes }, muted: settings.audio.muted }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.volumes) for (const name of BUSES) if (typeof saved.volumes[name] === 'number') prefs.volumes[name] = saved.volumes[name]
    if (typeof saved?.muted === 'boolean') prefs.muted = saved.muted
  } catch {
    // Private mode or blocked storage: defaults it is.
  }
  return prefs
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Not persisted; the session still works.
  }
}

export function createAudio({ vehicle, camera, game, gameWorld, seed, isDucked }) {
  const prefs = loadPrefs()
  const changeListeners = new Set()
  const stampTotal = seed.territories.length + seed.pillars.length
  let parts = null // everything that needs a context, built on the first gesture
  let ducked = false

  const forward = new THREE.Vector3()

  function unlock() {
    for (const type of GESTURES) window.removeEventListener(type, unlock, true)
    if (parts) return
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass({ latencyHint: 'interactive' })
    const mixer = createMixer(ctx)
    const noiseBuffers = createNoiseBuffers(ctx)
    const voices = createVoices(() => settings.audio.maxVoices)
    const engine = createEngineSound({ ctx, destination: mixer.buses.sfx, noiseBuffers, vehicle })
    const sounds = createSounds({ ctx, bus: mixer.buses.sfx, noiseBuffers, voices, vehicle, camera })
    const ambience = createAmbience({ ctx, destination: mixer.buses.ambience, noiseBuffers, emitters: gameWorld.emitters })
    const music = createMusic({ ctx, destination: mixer.buses.music, noiseBuffers })
    parts = { ctx, mixer, voices, engine, sounds, ambience, music }

    applyLevels()
    sounds.listen(game.events)
    const events = game.events
    const progress = () => {
      const stamps = Object.keys(game.store.state.stamps).length
      music.setProgress(stamps, stamps >= stampTotal)
    }
    events.on('stamp', progress)
    events.on('finale', () => music.setProgress(stampTotal, true))
    events.on('reset', progress)
    progress()
    music.start()
    ctx.resume?.()
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend()
      else ctx.resume()
    })
  }

  for (const type of GESTURES) window.addEventListener(type, unlock, true)

  function applyLevels() {
    if (!parts) return
    for (const name of BUSES) {
      const value = prefs.volumes[name]
      parts.mixer.setLevel(name, name === 'master' && prefs.muted ? 0 : value)
    }
  }

  function changed() {
    applyLevels()
    savePrefs(prefs)
    for (const listener of changeListeners) listener(prefs)
  }

  /** Per frame, after the camera. `input`: this frame's driving input. */
  function update(dt, input) {
    if (!parts || parts.ctx.state !== 'running') return
    const { ctx, engine, sounds, ambience, mixer } = parts
    // The listener rides with the car and faces where the camera looks.
    const listener = ctx.listener
    setParam(listener, 'position', vehicle.position)
    forward.setFromMatrixColumn(camera.matrixWorld, 2).negate()
    if (listener.forwardX) {
      listener.forwardX.value = forward.x
      listener.forwardY.value = forward.y
      listener.forwardZ.value = forward.z
      listener.upX.value = 0
      listener.upY.value = 1
      listener.upZ.value = 0
    } else {
      listener.setOrientation?.(forward.x, forward.y, forward.z, 0, 1, 0)
    }

    const landing = engine.update(dt, input)
    if (landing > 0) sounds.play((out, at) => engine.thud(out, at, landing))
    ambience.update(vehicle.position)

    const duck = isDucked()
    if (duck !== ducked) {
      ducked = duck
      mixer.setDuck(duck ? settings.audio.duck : 1)
    }
  }

  return {
    update,
    horn: () => parts?.sounds.horn(),
    toggleMute() {
      prefs.muted = !prefs.muted
      changed()
      return prefs.muted
    },
    setMuted(muted) {
      prefs.muted = Boolean(muted)
      changed()
    },
    /** `name`: master | music | sfx | ambience; `value` 0..1. */
    setVolume(name, value) {
      prefs.volumes[name] = Math.min(Math.max(Number(value) || 0, 0), 1)
      changed()
    },
    onChange(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    get prefs() {
      return prefs
    },
    get muted() {
      return prefs.muted
    },
    /** For tests and the debug tools. */
    get context() {
      return parts?.ctx ?? null
    },
    get stats() {
      if (!parts) return { state: 'locked' }
      const { ctx, voices, mixer, music, ambience } = parts
      return {
        state: ctx.state,
        voices: voices.live,
        ...voices.stats,
        peak: mixer.peak(),
        centroidHz: mixer.centroid(),
        limiterDb: mixer.reduction,
        stems: music.stems,
        ambience: ambience.live,
      }
    },
    get sounds() {
      return parts?.sounds ?? null
    },
  }
}
