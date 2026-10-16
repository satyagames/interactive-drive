import GUI from 'lil-gui'

import { defaultSettings, qualityTiers, settings } from '../config.js'

const STORAGE_KEY = 'driving-prototype/tuning'

/**
 * Live tuning panel. Everything here writes straight into `settings`, which the
 * vehicle and camera re-read every step -- no rebuild, no reload.
 *
 * Tuned values can be stashed in localStorage so a good feel survives a
 * refresh, and dumped as JSON to paste back into `src/config.js`.
 */
export function createDebugGui({ vehicle, camera, hud, resize }) {
  const gui = new GUI({ title: 'Tuning', width: Math.min(300, window.innerWidth - 30) })
  // On a phone the panel would cover most of the screen, so start it shut.
  if (window.matchMedia?.('(pointer: coarse)').matches) gui.close()

  // ---- vehicle ------------------------------------------------------------
  const vehicleFolder = gui.addFolder('Vehicle')
  const v = settings.vehicle
  vehicleFolder.add(v, 'engineForce', 0, 12000, 50).name('engine force (N/wheel)')
  vehicleFolder.add(v, 'reverseForce', 0, 8000, 50).name('reverse force')
  vehicleFolder.add(v, 'brakeForce', 0, 15000, 50).name('brake force')
  vehicleFolder.add(v, 'topSpeed', 5, 80, 1).name('top speed (m/s)')
  vehicleFolder.add(v, 'drivetrain', ['rwd', 'fwd', 'awd']).name('drivetrain')

  const steerFolder = vehicleFolder.addFolder('Steering').close()
  steerFolder.add(v, 'maxSteerAngle', 0.1, 1.2, 0.01).name('max angle (rad)')
  steerFolder.add(v, 'steerSpeed', 0.5, 20, 0.1).name('turn-in rate')
  steerFolder.add(v, 'steerReturnSpeed', 0.5, 20, 0.1).name('recentre rate')
  steerFolder.add(v, 'lowSpeedSteerScale', 0.05, 1, 0.01).name('authority @ 0 m/s')
  steerFolder.add(v, 'steerRampSpeed', 0.5, 30, 0.5).name('full authority @ (m/s)')
  steerFolder.add(v, 'highSpeedSteerScale', 0.1, 1, 0.01).name('authority @ top speed')

  const gripFolder = vehicleFolder.addFolder('Grip & drag').close()
  gripFolder.add(v, 'lateralGrip', 0, 1.5, 0.01).name('lateral grip')
  gripFolder.add(v, 'tireFriction', 0.2, 6, 0.05).name('tyre friction limit')
  gripFolder.add(v, 'rollingResistance', 0, 400, 5).name('rolling resistance')
  gripFolder.add(v, 'airDrag', 0, 20, 0.1).name('air drag')
  gripFolder.add(v, 'downforce', 0, 60, 0.5).name('downforce')
  gripFolder.add(v, 'handbrakeGripScale', 0, 1, 0.01).name('handbrake grip')
  gripFolder.add(v, 'handbrakeForce', 0, 12000, 100).name('handbrake force')

  // ---- suspension ---------------------------------------------------------
  const suspFolder = gui.addFolder('Suspension').close()
  const s = settings.suspension
  suspFolder.add(s, 'restLength', 0.1, 0.9, 0.01).name('rest length (m)')
  suspFolder.add(s, 'stiffness', 5000, 120000, 500).name('stiffness (N/m)')
  suspFolder.add(s, 'damping', 0, 20000, 100).name('damping (N/(m/s))')
  suspFolder.add(s, 'antiRoll', 0, 40000, 250).name('anti-roll bar')
  suspFolder.add(s, 'maxForce', 10000, 300000, 1000).name('force clamp')

  const bodyFolder = gui.addFolder('Chassis').close()
  bodyFolder.add(settings.body, 'linearDamping', 0, 2, 0.01).name('linear damping')
  bodyFolder.add(settings.body, 'angularDamping', 0, 5, 0.01).name('angular damping')
  bodyFolder.add(settings.body, 'airRighting', 0, 20000, 100).name('air self-righting')

  // ---- camera -------------------------------------------------------------
  const cameraFolder = gui.addFolder('Camera')
  const c = settings.camera
  cameraFolder.add(c, 'distance', 2, 30, 0.1).name('follow distance')
  cameraFolder.add(c, 'height', 0.5, 20, 0.1).name('height')
  cameraFolder.add(c, 'positionSmoothing', 0.5, 20, 0.1).name('position smoothing')
  cameraFolder.add(c, 'lookSmoothing', 0.5, 25, 0.1).name('look smoothing')
  cameraFolder.add(c, 'lookAhead', -5, 20, 0.1).name('look ahead')
  cameraFolder.add(c, 'lookHeight', -2, 8, 0.1).name('look height')
  cameraFolder.add(c, 'velocityBlend', 0, 1, 0.01).name('velocity blend')
  cameraFolder.add(c, 'fov', 30, 110, 1).name('fov')
  cameraFolder.add(c, 'speedFovBoost', 0, 40, 0.5).name('fov boost @ top speed')
  cameraFolder.add(c, 'portraitFraming').name('portrait framing fix')

  // ---- rendering ----------------------------------------------------------
  // Every control in this section is a live uniform or a pass toggle, so it
  // can be answered by looking at the screen while dragging it. `bakedAo` at
  // 0 and both post passes off is the pre-polish look, for A/B comparison.
  const renderFolder = gui.addFolder('Rendering')
  renderFolder.add(settings.render, 'bakedAo', 0, 1, 0.01).name('baked AO strength')

  // A preset that just assigns `render.pixelRatioCap` / `post.aa.mode` /
  // `post.enabled` and resizes -- picking one and then hand-tuning a field
  // below it is completely fine, see `qualityTiers` in config.js.
  renderFolder
    .add(settings, 'quality', Object.keys(qualityTiers))
    .name('quality preset')
    .onChange((name) => {
      const tier = qualityTiers[name]
      settings.render.pixelRatioCap = tier.pixelRatioCap
      settings.post.aa.mode = tier.aaMode
      settings.post.enabled = tier.postEnabled
      resize()
      refresh()
    })

  renderFolder
    .add(settings.render, 'pixelRatioCap', 0.5, 3, 0.1)
    .name('pixel ratio cap')
    .onChange(() => resize())

  const shadowFolder = renderFolder.addFolder('Shadow blob').close()
  const sh = settings.shadow
  shadowFolder.add(sh, 'enabled').name('enabled')
  shadowFolder.add(sh, 'maxOpacity', 0, 1, 0.01).name('opacity (grounded)')
  shadowFolder.addColor(sh, 'tint').name('tint')
  shadowFolder.add(sh, 'radiusX', 0.2, 4, 0.05).name('half width (m)')
  shadowFolder.add(sh, 'radiusZ', 0.2, 6, 0.05).name('half length (m)')
  shadowFolder.add(sh, 'fadeHeight', 1, 25, 0.5).name('fade-out height (m)')
  shadowFolder.add(sh, 'growth', 0, 0.6, 0.01).name('spread per metre')
  shadowFolder.add(sh, 'groundClearance', 0, 2, 0.01).name('ride height (m)')
  shadowFolder.add(sh, 'offset', 0, 0.3, 0.005).name('lift off surface (m)')

  const postFolder = renderFolder.addFolder('Post-processing')
  postFolder.add(settings.post, 'enabled').name('post enabled')
  postFolder
    .add(settings.post.aa, 'mode', { none: 'none', FXAA: 'fxaa', SMAA: 'smaa', MSAA: 'msaa' })
    .name('AA mode')
  postFolder
    .add(settings.post.aa, 'msaaSamples', { off: 0, '2x': 2, '4x': 4 })
    .name('MSAA samples (if MSAA)')
  const bloomFolder = postFolder.addFolder('Bloom').close()
  bloomFolder.add(settings.post.bloom, 'enabled').name('enabled')
  bloomFolder.add(settings.post.bloom, 'strength', 0, 1.5, 0.01).name('strength')
  bloomFolder.add(settings.post.bloom, 'radius', 0, 1.5, 0.01).name('radius')
  bloomFolder.add(settings.post.bloom, 'threshold', 0, 1.5, 0.01).name('threshold')
  const vignetteFolder = postFolder.addFolder('Vignette').close()
  vignetteFolder.add(settings.post.vignette, 'enabled').name('enabled')
  vignetteFolder.add(settings.post.vignette, 'offset', 0, 3, 0.01).name('offset')
  vignetteFolder.add(settings.post.vignette, 'darkness', 0, 2, 0.01).name('darkness')

  // ---- debug --------------------------------------------------------------
  const debugFolder = gui.addFolder('Debug').close()
  debugFolder.add(settings.debug, 'showColliders').name('collider wireframes')
  debugFolder.add(settings.debug, 'forceTouchControls').name('force touch pad')
  debugFolder.add(settings.debug, 'showHud').name('speed HUD').onChange((value) => {
    hud.hidden = !value
  })
  debugFolder.add(settings.debug, 'showFps').name('frame rate')

  // ---- actions ------------------------------------------------------------
  const actions = {
    respawn() {
      vehicle.respawn()
      camera.reset()
    },
    resetTuning() {
      deepAssign(settings, defaultSettings)
      refresh()
    },
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    },
    load() {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      try {
        deepAssign(settings, JSON.parse(raw))
        refresh()
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    copyJson() {
      navigator.clipboard?.writeText(JSON.stringify(settings, null, 2))
    },
  }

  gui.add(actions, 'respawn').name('Respawn (R)')
  const ioFolder = gui.addFolder('Tuning I/O').close()
  ioFolder.add(actions, 'save').name('Save to localStorage')
  ioFolder.add(actions, 'load').name('Load from localStorage')
  ioFolder.add(actions, 'resetTuning').name('Reset to defaults')
  ioFolder.add(actions, 'copyJson').name('Copy settings JSON')

  function refresh() {
    for (const controller of gui.controllersRecursive()) controller.updateDisplay()
    hud.hidden = !settings.debug.showHud
  }

  // Restore a previously saved tune, if any.
  actions.load()

  return { gui, refresh }
}

/** Recursive merge that only writes keys the target already declares. */
function deepAssign(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      deepAssign(target[key], value)
    } else {
      target[key] = value
    }
  }
}
