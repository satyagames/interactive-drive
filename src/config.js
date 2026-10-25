/**
 * Single source of truth for every tunable in the prototype.
 *
 * Everything in `settings` is read live each frame, so lil-gui can mutate it
 * without a rebuild. The few values that only take effect when the vehicle or
 * world is (re)built are grouped under `rebuild` and marked in the debug panel.
 *
 * Axis convention (matches three.js Object3D defaults):
 *   local -Z = forward, +X = right, +Y = up
 * A GLTF car exported with the glTF +Z-forward convention needs a 180 deg yaw
 * when parented to the chassis group -- see `rebuild.model.yawOffset`.
 */

export const settings = {
  vehicle: {
    /** Peak drive force per driven wheel, newtons. Main "how punchy" knob. */
    engineForce: 5000,
    /** Drive force when reversing (deliberately weaker than forward). */
    reverseForce: 2400,
    /** Force applied per wheel when braking against current motion. */
    brakeForce: 5200,
    /** Soft speed cap, m/s. Drive force fades to zero as it is approached. */
    topSpeed: 34,

    /** Max road-wheel angle at full lock, radians. */
    maxSteerAngle: 0.58,
    /** How fast the steering angle chases the input, 1/s. */
    steerSpeed: 5.0,
    /** How fast it recentres when the input is released, 1/s. */
    steerReturnSpeed: 7.0,
    /** Steering authority multiplier at a standstill (ramps to 1). */
    lowSpeedSteerScale: 0.55,
    /** Speed (m/s) at which full steering authority is reached. */
    steerRampSpeed: 7,
    /** Steering authority multiplier once `topSpeed` is reached. 1 = no taper. */
    highSpeedSteerScale: 0.45,

    /** Fraction of sideways wheel velocity cancelled per step. 0..1 */
    lateralGrip: 0.85,
    /** Friction-circle limit: max tyre force as a multiple of wheel load. */
    tireFriction: 2.4,
    /** Rolling drag per wheel, N per m/s. Stops it coasting forever. */
    rollingResistance: 20,
    /** Quadratic air drag on the chassis: F = -airDrag * |v| * v. */
    airDrag: 1.6,
    /** Extra downforce, N per (m/s)^2. Keeps it planted at speed. */
    downforce: 9,

    /** Handbrake: lateral grip multiplier on the rear axle (low = drifty). */
    handbrakeGripScale: 0.22,
    /** Handbrake: longitudinal braking force per rear wheel. */
    handbrakeForce: 3600,

    /** 'rwd' | 'fwd' | 'awd' */
    drivetrain: 'rwd',
  },

  /**
   * The 'arcade2019' preset (`src/vehicle/arcadePhysics.js`): Rapier's
   * DynamicRayCastVehicleController driven by the 2019 folio's control model.
   *
   * Every value here is in **reference units**, exactly as recorded in
   * docs/pursuit-arena/01-reference-analysis.md §7, and is scaled by
   * `rebuild.worldScale` at use time following the rules in
   * docs/pursuit-arena/07-feel-targets.md §3: lengths, speeds, forces and
   * impulses x s; times, rates, angles, stiffness (1/s^2, Rapier multiplies it
   * by chassis mass -- verified in Phase 1), damping (1/s) and friction
   * coefficients unscaled. Keeping the reference units means the debug panel
   * and the doc can be compared number for number.
   */
  arcade: {
    /** Drive force per rear wheel. Constant: the reference has no ramp-in. */
    engineForce: 272,
    boostEngineForce: 476,
    /** Speed gate, units/s: drive force is cut at or above it (not faded). */
    maxSpeed: 9.706,
    boostMaxSpeed: 19.41,
    /** Brake applied to all four wheels while Space/Ctrl is held. */
    brakeForce: 1.35,
    /**
     * With neither throttle nor reverse held, an impulse of
     * `coastImpulse * |v|` opposes the direction of travel every 1/60 s step.
     * This, not rolling friction, is what slows a coasting car.
     */
    coastImpulse: 0.1,

    /** Steering angle change rate, rad/s (the reference's 0.015 rad/ms). */
    steerRate: 15,
    /** Max road-wheel angle, rad (pi * 0.17). */
    maxSteer: 0.534,

    suspensionStiffness: 50,
    dampingRelaxation: 1.8,
    dampingCompression: 1.5,
    maxSuspensionTravel: 0.3,
    maxSuspensionForce: 100000,
    frictionSlip: 10,
    sideFrictionStiffness: 1,
    /**
     * Our addition, not in the reference: rear side-friction multiplier while
     * the handbrake (Q) is held, for a deliberate drift. 1 disables it.
     */
    handbrakeSideFriction: 0.3,

    /** Visual wheel spin while a driven wheel slides, rad/s. */
    slidingWheelSpin: -30,
    /** Sideways speed (units/s) above which a wheel counts as sliding. */
    slideSpeed: 1,

    /** Auto-flip when the chassis up axis . world up stays below this... */
    flipUpDot: 0.5,
    /** ...for this long, s. */
    flipDelay: 1,
    /** Time after a flip before another can trigger, s. */
    flipCooldown: 1,
    /** Upward impulse, applied 0.1 units off-centre so it rolls the car over. */
    flipImpulse: 150,
    flipLever: 0.1,

    /** Horn (H) hop impulse and its minimum spacing, s. */
    hopImpulse: 150,
    hopCooldown: 0.4,
    /** Respawn drops the car from this height above the spawn point. */
    respawnDrop: 12,

    /** Antenna spring, per 1/60 s step (reference `Car.js` values). */
    antennaStrength: 10,
    antennaDamping: 0.035,
    antennaPullBack: 0.02,
  },

  suspension: {
    /** Uncompressed distance from the wheel anchor to the wheel centre, m. */
    restLength: 0.34,
    /** Spring rate per wheel, N/m. Higher = stiffer, less body roll. */
    stiffness: 34000,
    /** Shock damping per wheel, N per m/s. Higher = less bounce. */
    damping: 3400,
    /** Safety clamp on a single wheel's spring force, N. */
    maxForce: 90000,
    /** Anti-roll bar rate, N per m of left/right travel difference. */
    antiRoll: 7000,
  },

  body: {
    /** Global linear damping on the chassis rigid body. */
    linearDamping: 0.06,
    /** Global angular damping. Raise if the car feels twitchy in yaw. */
    angularDamping: 0.75,
    /** Mid-air self-righting torque, N.m per radian of tilt. */
    airRighting: 3200,
  },

  camera: {
    /** Horizontal distance the camera trails behind the car, m. */
    distance: 9.5,
    /** Height above the car, m. */
    height: 4.0,
    /** Position follow rate, 1/s. Higher = tighter, lower = laggier. */
    positionSmoothing: 4.0,
    /** Look-at follow rate, 1/s. Keep above positionSmoothing. */
    lookSmoothing: 7.0,
    /** How far ahead of the car the camera aims, m. */
    lookAhead: 5.0,
    /** Height of the aim point above the car, m. */
    lookHeight: 1.1,
    /**
     * 0 = always sit behind the car's nose, 1 = always sit behind its velocity.
     * Blending in some velocity makes reversing and drifting read better.
     */
    velocityBlend: 0.35,
    /** Base vertical field of view, degrees. */
    fov: 62,
    /** Extra FOV added at `topSpeed` for a sense of speed. */
    speedFovBoost: 10,
    /**
     * A portrait phone has a narrow horizontal FOV, so the car ends up filling
     * the frame. When true, the camera eases back and widens on tall viewports
     * to restore roughly the framing you tuned on desktop.
     */
    portraitFraming: true,
  },

  /** Which camera drives the view: 'iso' (default, the reference's) or 'chase'. C toggles. */
  cameraMode: 'iso',

  /**
   * The reference's camera (docs/pursuit-arena/07 §2): fixed world yaw and
   * pitch, narrow FOV, never rotates with the car. Distances are reference
   * units, scaled by `rebuild.worldScale` like the arcade car.
   */
  isoCamera: {
    fov: 40,
    /** Degrees below horizontal (C2: atan(1.15 / hypot(1.135, 1.45))). */
    pitch: 32.0,
    /** Camera position seen from the car, degrees east of due south (C3). */
    azimuth: 38.05,
    /** distance = minDistance + zoomRange * zoom, zoom in 0..1 (C4). */
    minDistance: 14,
    zoomRange: 15,
    defaultZoom: 0.5,
    /** Exponential follow / zoom rates, 1/s (C5, C6: 0.15 and 0.1 per 60 Hz frame). */
    followRate: 9.75,
    zoomRate: 6.32,
    /** Zoom change per wheel deltaY pixel (C6). */
    wheelSensitivity: 0.001,
    /**
     * Seconds of velocity added to the aim point. 0 = the reference (no
     * look-ahead); a small value (~0.15) leads the car slightly at speed.
     */
    lookAhead: 0,
    /**
     * Opening shot: start at this zoom (negative = closer than minDistance)
     * and ease out to `defaultZoom` over `introDuration` seconds while the car
     * drops in. Skipped under prefers-reduced-motion.
     */
    introZoom: -0.45,
    introDuration: 2.6,
    /** Explore-mode camera flight to a district, and back to the car, s. */
    flyDuration: 1.2,
    /** Same idea as the chase camera's: pull back on tall (portrait) viewports. */
    portraitFraming: true,
  },

  /**
   * World-space floor gradient (`render/floorGradient.js`). Corner colours
   * from docs/pursuit-arena/02 §2; the colour tells you roughly where on the
   * map you are -- a deliberate change from the reference's screen-space one.
   */
  floor: {
    northWest: 0x0b3d2e,
    northEast: 0x0d5b5f,
    southEast: 0xe9e2d0,
    southWest: 0xdadfe3,
    /** The gradient spans -halfExtent..+halfExtent on X and Z, m. */
    halfExtent: 135,
    /** Beyond this radius the floor dissolves into the fog colour... */
    boundaryRadius: 135,
    /** ...over this many metres. */
    fadeWidth: 45,
  },

  /**
   * Instanced floor blobs for props (`render/blobShadows.js`), modelled on the
   * reference's: no raycasts, offset along a fixed sun direction by height,
   * faded by height and by tilt. The car keeps its own raycast blob below.
   */
  blobShadows: {
    enabled: true,
    tint: 0x2b1d14,
    /** Overall opacity (reference: 0.5 after the intro fade-in). */
    opacity: 0.5,
    /** Horizontal shift per metre of height; reference sun (-2.5, -2.65, 3.75) -> (0.667, 0.707) in its Z-up frame. */
    sunOffsetX: 0.667,
    sunOffsetZ: -0.707,
    /** Fully faded at this height above the floor, m (3 reference units x 1.6). */
    fadeHeight: 4.8,
    fadePower: 2,
  },

  /** Arena dynamic props (`world/dynamicProps.js`). */
  props: {
    /** Most bodies one district keeps awake; the slowest extra ones are put to sleep. */
    awakeBudget: 60,
    /** Angular damping on free props (rolling resistance stand-in). Read when a district loads. */
    angularDamping: 0.3,
  },

  /**
   * Collision impacts (`world/impacts.js`): Rapier contact-force events,
   * shared by the VFX (sparks, paper, chips) and the Phase 8 SFX.
   * The two thresholds are baked into the colliders when they are created.
   */
  impacts: {
    /** A prop contact counts once it could change the prop's speed by this much in one step, m/s. */
    minDeltaV: 1.5,
    /** The same for the car's own body against walls (it's heavier and scrapes more). */
    carMinDeltaV: 2.5,
    /** Speed change that counts as a full-strength impact, m/s. */
    fullDeltaV: 10,
    /** At most one impact per body this often, ms (doc 05 §3). */
    perBodyMs: 80,
  },

  /**
   * Visual effects (`src/vfx/`, doc 05 §2). Everything is pooled: these caps
   * are allocated once at boot and never grow.
   */
  vfx: {
    enabled: true,
    /**
     * Spawn-count multiplier, set by the quality tier (`qualityTiers`).
     * Caps and pools stay the same size; fewer particles are asked for.
     */
    density: 1,
    /** 'auto' follows prefers-reduced-motion; true / false force it (testing). */
    reducedMotion: 'auto',
    /**
     * HDR multiplier for emissive effects. Matcap surfaces never exceed 1.0
     * (see `post.bloom`), so anything drawn above the bloom threshold is,
     * by construction, an emissive -- that is the bloom "layer".
     */
    emissive: 2.6,
    dust: {
      /** Puffs per second per sliding rear wheel. */
      slideRate: 22,
      /** A landing this fast (downward, m/s) throws a ring of dust. */
      landingSpeed: 3.5,
      landingPuffs: 12,
      color: '#A89C86',
    },
    boost: {
      /** Exhaust flame sprites per second, per pipe. */
      flameRate: 45,
      /** Speed-line opacity at full boost speed. */
      lines: 0.55,
    },
    skid: { width: 0.3, opacity: 0.32, fade: 6, color: '#2B2B2B' },
    /** Paint Trail (doc 02 §3, Studio): green tyre paint inside `radius` m of the Studio. */
    paint: { width: 0.42, opacity: 0.85, fade: 10, color: '#86BC25', radius: 15, minSpeed: 2 },
    confetti: { max: 400, burst: 260 },
    /** Idle twinkles on collectibles within this many metres. */
    sparkleRange: 26,
    /** Golden skin: tiny 10s per second while moving (the Konami egg). */
    tensRate: 14,
    /**
     * The Birthdays station (content id) whose opening fires the confetti
     * cannon when a `feeds.birthdays` date is today.
     */
    birthdayStation: 'culture_1',
    camera: {
      /** FOV punch when boost starts, degrees (doc 05 §2: ±4°). */
      boostKick: 4,
      /** Landings punch inwards. */
      landingKick: -2.5,
      maxKick: 4,
      kickDecay: 3.5,
      landingShake: 0.45,
      impactShake: 0.35,
      stampShake: 0.5,
      /** Metres of shake at full trauma. */
      maxShake: 0.35,
      /** Trauma lost per second. */
      shakeDecay: 1.6,
    },
  },

  /** Enter areas (`world/areas.js`, doc 05 §4). */
  areas: {
    /** Ring fill on entering, s. */
    fillTime: 0.4,
    /** Standing still this long opens the station too, s (0 disables). */
    dwellTime: 1.5,
    /** Below this speed counts as standing still, m/s. */
    dwellSpeed: 0.6,
    /** After opening, the car is held with a soft brake this long unless you accelerate, s. */
    holdTime: 0.6,
    /** Leaving the area closes the panel it opened after this delay, s. */
    closeDelay: 1.0,
  },

  /** District reveals and the intro (`world/reveal.js`). */
  reveal: {
    /** A district reveals when the car comes within its radius + this, m. */
    distance: 40,
    /** Landmark scale-in, s (with overshoot). */
    scaleTime: 0.9,
    /** Props drop in from this high, m, over `dropTime` s, staggered by distance from the centre. */
    dropHeight: 8,
    dropTime: 0.7,
    stagger: 0.6,
    /** The opening: intro letters fall from higher, one after another. */
    introHeight: 18,
    introStagger: 0.12,
  },

  /** Collectibles (`game/collectibles.js`, doc 03 §2.3). */
  collectibles: {
    /** Pickups within this many metres fly to the car. */
    magnet: 2.0,
    flyTime: 0.18,
    /** Dots within this many seconds of the last one extend the combo. */
    comboWindow: 2.0,
    spinSpeed: 2.0,
    bob: 0.15,
  },

  /** Gameplay tunables that aren't content (`game/`). */
  game: {
    /** "First Drive": metres driven. */
    firstDriveDistance: 25,
    /**
     * "Airtime" badge threshold, s. Doc 03 says 2 s, but doc 07 §1 V15 shows
     * the arena's 15° ramps give 0.39 s (0.77 s boosted), so 2 s is
     * unreachable; 1 s needs a boosted ramp jump plus a horn hop. Decided in
     * Phase 6 (CHANGELOG); change here if a launch pad is ever built.
     */
    airtimeSeconds: 1.0,
    /** Deadline Dash. */
    dash: {
      countdown: 3,
      /** Reaching a checkpoint: within this many metres of it. */
      checkpointRadius: 7,
      /** A "heavy collision": speed drops by more than this in one frame (m/s)... */
      penaltySpeedDrop: 6,
      /** ...at most once per this many seconds. */
      penaltyCooldown: 1,
      /** Give up a run that takes longer than bronze x this. */
      timeoutFactor: 3,
    },
    /** Coin Run: knock every Tax coin within this many seconds of the first. */
    coinRunSeconds: 20,
    /** Paint Trail: seconds of driving in the Studio for the paint-splash skin. */
    paintSeconds: 60,
    /** Easter eggs. */
    hornsAtHq: 10,
    loopsForTrophy: 10,
  },

  /** On-screen touch pad (`input/touch.js`). */
  touch: {
    /** Joystick travel radius, CSS px. */
    joystickRadius: 52,
    /** Fraction of the radius ignored around the centre. */
    deadZone: 0.18,
  },

  /** Gamepad (`input/gamepad.js`), standard mapping. */
  gamepad: {
    stickDeadZone: 0.15,
    triggerDeadZone: 0.05,
  },

  /**
   * Fake contact shadow under the car. Not a shadow map -- a single faded
   * quad placed by a downward raycast, which is all a stylised scene needs
   * and costs one ray plus one transparent quad per frame.
   */
  shadow: {
    enabled: true,
    /**
     * Half-size across the car, m. The falloff texture is an ellipse
     * inscribed in the quad, so anything sized to the car's own footprint is
     * invisible -- every texel that isn't hidden under the bodywork is out at
     * the transparent rim. These are deliberately half a metre oversized.
     */
    radiusX: 1.95,
    /** Half-size along the car, m. */
    radiusZ: 3.35,
    /** Opacity with the wheels on the ground. */
    maxOpacity: 0.82,
    /**
     * Shadow colour. Not black: the blob is alpha-blended, so a neutral black
     * drags the warm ground towards grey wherever it lands, which is exactly
     * the note the whole palette pass was trying to fix. A deep warm brown
     * darkens the sand without desaturating it, and matches the multiplied
     * (and therefore automatically warm) Blender bake under everything else.
     */
    tint: 0x2b1d14,
    /** Height above the ground at which the shadow has faded out entirely, m. */
    fadeHeight: 9,
    /** Extra spread per metre of altitude. 0 = the blob never grows. */
    growth: 0.16,
    /** Ride height of the chassis origin at rest, m. Subtracted from the
     *  raycast distance so a grounded car reads as height 0. */
    groundClearance: 0.62,
    /** Lift off the surface, m. Just enough to beat z-fighting. */
    offset: 0.03,
    /** Give up past this drop, m -- off the edge of the world, no shadow. */
    maxDrop: 50,
  },

  /**
   * Post-processing. Every pass is individually switchable and `enabled`
   * bypasses the composer entirely (straight `renderer.render`), so the cost
   * of the whole chain can be measured against zero in one click.
   */
  post: {
    enabled: true,
    /**
     * Anti-aliasing strategy for the composer's render target.
     *
     * Routing through `EffectComposer` bypasses the canvas's own
     * `antialias: true`, and hardware MSAA on the composer's own target used
     * to be the only thing standing in for it -- at a real cost, since MSAA
     * multiplies the target's memory and blend bandwidth by its sample count.
     *
     * Measured with `src/debug/benchmark.js` on this machine (Apple M2, GPU
     * timer queries -- see that file for why wall-clock + `gl.finish()` is
     * *not* trustworthy here, it was tried first and gave physically
     * impossible numbers), full composer chain, bloom off / vignette on:
     *
     * | mode  | 0.79 Mpx | 4096x3072 (12.58 Mpx) |
     * |-------|----------|------------------------|
     * | none  |  1.21 ms |  18.0 ms               |
     * | msaa  |  7.96 ms |  91.2 ms               |
     * | smaa  |  3.03 ms |  41.9 ms               |
     * | fxaa  |  1.72 ms |  24.1 ms               |
     *
     * (no-post baseline, i.e. `renderer.render()` with no composer at all:
     * 0.05 ms / 0.42 ms -- confirms the scene itself is not the cost centre.)
     *
     * Re-measured after the look pass (bevels on every mesh, +1.4k vertices
     * scene-wide; a new gradient sky dome; same texture count, one of them
     * larger). Three runs, same machine:
     *
     * | mode  | 0.79 Mpx      | 4096x3072       |
     * |-------|---------------|-----------------|
     * | none  | 1.40-1.45 ms  | 19.0-20.8 ms    |
     * | msaa  | 8.29-9.69 ms  | 100.5-103.5 ms  |
     * | smaa  | 2.92-3.18 ms  | 44.1-46.3 ms    |
     * | fxaa  | 1.65-2.03 ms  | 25.9-26.7 ms    |
     * | (no post) | 0.04-0.06 ms | 0.43-0.55 ms |
     *
     * i.e. unchanged within run-to-run noise, and the conclusion is unchanged
     * with it: the scene is still nowhere near the cost centre, and the AA
     * pass still is. Worth knowing *why* that was the expected answer rather
     * than a lucky one -- bevels add vertices to a scene whose vertex count
     * was never the bottleneck, and the sky dome is one extra screen's worth
     * of a four-instruction fragment shader.
     *
     * These are ~4x higher than the figure this comment used to cite from
     * the prior session (1.95 ms at 0.79 Mpx, 4x MSAA) -- that number came
     * from the same kind of CPU-side sync this benchmark tried and rejected,
     * and on this GPU/driver stack that sync point doesn't actually wait for
     * the GPU. Treat the table above as the trustworthy one; it was cross-
     * checked against the live production composer at matching resolution
     * and agreed within ~10%.
     *
     * - 'smaa' (default): ~2.6x cheaper than MSAA at both resolutions, and
     *   holds up visually on this geometry's long straight edges -- this is
     *   blockout/low-poly art, not a texture-detail scene, which is exactly
     *   where SMAA's edge-search approach is strongest relative to FXAA's.
     * - 'fxaa': cheaper again (~1.7x cheaper than SMAA, ~4.6x cheaper than
     *   MSAA) but softer on those same edges. Good enough for a lower
     *   quality tier (see `qualityTiers` below), not the default.
     * - 'msaa': the old approach. Kept as an option so these numbers stay
     *   reproducible, and as a fallback if a future effect needs true
     *   multisampling (e.g. MSAA'd geometry edges under a transparent
     *   overlay that a post-AA pass can't reach).
     * - 'none': no AA at all, for A/B comparison only.
     */
    aa: {
      mode: 'smaa',
      /** MSAA sample count when `mode` is 'msaa'. Ignored otherwise. */
      msaaSamples: 4,
    },
    /**
     * Selective bloom for emissive layers only (doc 05 §2), done with HDR
     * rather than a second render pass.
     *
     * Matcaps are 8-bit textures, so nothing a surface can produce exceeds
     * 1.0: after the look pass the frame's linear values stack up as ground
     * 0.73, sky horizon 0.95, headlamps 0.90 (and the Fresnel rim adds at
     * most a few hundredths). The emissive effects -- the Submission Portal,
     * sparks, pickup sparkles, the stamp's light pillar, boost exhaust,
     * fireworks, bulb and beacon halos -- are drawn at
     * `settings.vfx.emissive` (x2.6) into the half-float target. A threshold
     * above 1.0 therefore *is* the layer mask: surfaces can never reach it,
     * emissives always do.
     *
     * Why not three's two-pass selective bloom (darken everything else,
     * render again): it renders the scene twice, doubling the draw calls the
     * performance budget counts (rule 5), and needs every non-bloom material
     * swapped per frame. The HDR band costs nothing extra and gets occlusion
     * right for free (a wall in front of the portal hides its glow).
     *
     * (History: before Phase 7 there were no emissives and no threshold
     * isolated anything -- under 0.90 caught the sky, under 0.73 the ground.)
     */
    bloom: {
      enabled: true,
      strength: 0.85,
      radius: 0.45,
      /** Linear luminance; keep it above 1.0 so matcap surfaces never bloom. */
      threshold: 1.15,
      /** Ramp width above the threshold (UnrealBloomPass's smoothWidth). */
      softness: 0.6,
    },
    vignette: {
      enabled: true,
      /** Higher = the darkening starts closer to the centre. */
      offset: 1.0,
      darkness: 1.05,
    },
  },

  /** Shading knobs that are read live by the material library. */
  render: {
    /** Strength of the Blender AO bake, 0..1. 0 renders pure matcap. */
    bakedAo: 1,
    /**
     * Cap on `window.devicePixelRatio` the renderer will actually use.
     * Composer cost scales close to linearly with pixel count (see the
     * `post.aa` table above), so this is the other big lever on the same
     * budget -- a retina display reporting 2 rendering at that ratio is 4x
     * the pixels of a 1x display at the same CSS size, and this scene's
     * geometry is cheap enough that AA cost dominates the frame, not the
     * render target size doing so.
     *
     * Was 2 (uncapped for any display this prototype is likely to run on).
     * Dropped to 1.5 once the real AA costs above were known: at 2x, even
     * SMAA's ~3.3 ms/Mpx means a modest 1400x900 retina window (2x ~5 Mpx)
     * costs ~16.5 ms on the AA pass *alone*, blowing the entire 60 fps frame
     * budget before the scene or physics get a turn. At 1.5x that same
     * window is only ~2.8 Mpx -- a bit under half the pixels, and the
     * quality loss on this stylised low-poly matcap look (not a
     * detail/texture-driven scene) is far less noticeable than it would be
     * on realistic art. Read live by `renderer.js`'s resize handler.
     */
    pixelRatioCap: 1.5,
  },

  /**
   * Name of the last-applied preset from `qualityTiers` (see below), purely
   * informational -- it is not re-enforced on its own, so hand-tuning
   * `post.aa.mode` / `render.pixelRatioCap` / `post.enabled` afterwards is
   * fine and won't be silently reverted.
   */
  quality: 'high',

  debug: {
    showColliders: false,
    showFps: true,
    /** Force the on-screen touch pad to show on a desktop browser. */
    forceTouchControls: false,
    showHud: true,
  },
}

/**
 * Structural values. Changing these needs `respawn()` (vehicle) or a page
 * reload (world), so they live apart from the live-tunable `settings`.
 */
export const rebuild = {
  vehicle: {
    /**
     * 'arcade2019' (default) or 'sim' (the original force-based model in
     * `src/vehicle/simVehicle.js`). Switching rebuilds the body and the
     * physics world's gravity, so it is a reload, not a live setting: add
     * `?vehicle=sim` to the URL, or use the debug panel's dropdown.
     */
    preset: 'arcade2019',
  },

  /**
   * Reference units -> metres for the arcade preset. 1.6 makes the car about
   * 3.25 m long: toy-sized next to 6-20 m buildings (doc 01 §6).
   */
  worldScale: 1.6,

  /** Arcade-preset geometry, in reference units (doc 01 §7). Scaled by `worldScale`. */
  arcade: {
    chassis: {
      width: 1.02,
      height: 1.16,
      depth: 2.03,
      /**
       * The collider box sits this far above the body origin, and the centre
       * of mass stays at the origin (set explicitly -- Rapier would otherwise
       * put it at the box centre), which is what keeps the car planted.
       */
      offsetUp: 0.41,
      /** Kept unscaled: props keep their reference masses too (doc 07 §3). */
      mass: 40,
      friction: 0,
      restitution: 0.2,
      /** cannon's default body damping, which the reference never changed. */
      linearDamping: 0.01,
      angularDamping: 0.01,
    },
    wheels: {
      radius: 0.25,
      width: 0.24,
      /** Distance ahead of / behind the body origin. */
      frontOffset: 0.635,
      backOffset: 0.475,
      halfTrack: 0.39,
      restLength: 0.1,
    },
    /** World gravity while this preset is active, units/s^2. */
    gravity: -13,
    /**
     * Visual-only: where the placeholder body mesh sits relative to the body
     * origin, metres (unscaled -- it is a property of our model, not the
     * reference's). Retune when the Phase 10 cart replaces it.
     */
    visualOffsetY: 0.1,
  },

  chassis: {
    /** Visual + collider box size in metres (width, height, length). */
    size: { x: 1.68, y: 0.7, z: 4.1 },
    mass: 1250,
    /**
     * Vertical offset of the collider + visual box relative to the wheel
     * anchors. Negative lowers the centre of mass, which is the cheapest way
     * to stop a box-on-springs from rolling over in corners.
     */
    offsetY: -0.12,
    /**
     * Where the car respawns. Overwritten at boot from the world's
     * `spawn_` empty (see `docs/blender-conventions.md`); these are just the
     * fallback if the world has none.
     */
    spawn: { x: 0, y: 1.6, z: 8 },
    /** Respawn orientation, also overwritten from the `spawn_` empty. */
    spawnRotation: { x: 0, y: 0, z: 0, w: 1 },
  },
  wheels: {
    radius: 0.37,
    width: 0.28,
    /** Half the left/right spacing between wheel centres, m. */
    halfTrack: 0.86,
    /** Half the front/rear spacing between wheel centres, m. */
    halfBase: 1.42,
    /** Wheel anchor height in chassis space; the suspension ray starts here. */
    anchorY: 0.0,
  },
  model: {
    /**
     * Yaw applied to an imported GLTF before parenting it to the chassis.
     * The glTF spec says assets face +Z, this project drives towards -Z,
     * so a Math.PI offset is the usual value once real art lands.
     */
    yawOffset: Math.PI,
    /** GLB loaded into the vehicle's `chassis-visual` group. */
    url: 'models/vehicle.glb',
  },
  physics: {
    gravity: { x: 0, y: -9.81, z: 0 },
    /** Fixed simulation step, seconds. */
    timestep: 1 / 60,
    /** Cap on catch-up steps per frame, so a stall cannot spiral. */
    maxSubSteps: 5,
  },
}

/**
 * The arena (written by `npm run art:export`) + the naming convention
 * `world/world.js` reads out of it. See `docs/blender-conventions.md` and
 * docs/pursuit-arena/04 §2 for the authoring side of this contract.
 */
export const world = {
  /** Lists kit.glb and every district GLB, each tagged 'core' or 'stream'. */
  manifestUrl: 'models/arena.manifest.json',
  collisionPrefix: 'collision_',
  spawnPrefix: 'spawn_',
  triggerPrefix: 'trigger_',
  areaPrefix: 'area_',
  dynamicPrefix: 'dyn_',
  instancePrefix: 'inst_',
  collectPrefix: 'collect_',
  sfxPrefix: 'sfx_',
  animPrefix: 'anim_',
}

/**
 * Shading assets and how they are assigned to geometry.
 *
 * Every surface in the prototype is matcap-shaded: the scene has no real-time
 * lights, and shape reads entirely from the pre-lit sphere textures generated
 * by `tools/generate-matcaps.mjs`. Static geometry additionally multiplies in
 * an ambient-occlusion bake from Blender (`blender/bake_ao.py`) so it sits on
 * the ground instead of floating.
 *
 * Assignment is by object-name prefix rather than by material name, because
 * the names are already the load-bearing contract with Blender -- see
 * `docs/blender-conventions.md`.
 */
export const rendering = {
  matcapPath: 'textures/matcaps/',
  bakePath: 'textures/bake/',
  /**
   * UV channel the AO bake is authored on. `blender/bake_ao.py` always keeps
   * channel 0 free for future art UVs, so this never has to move.
   */
  bakeChannel: 1,

  /** Used for any mesh no rule matches. */
  defaultMatcap: 'neutral',

  /**
   * First matching prefix wins, so order these most-specific-first.
   *
   * The three exhibit accents are spread so no two neighbouring exhibits
   * share one: warm (a), cool (b), deep (c), cool again (d) -- b and d are at
   * opposite ends of the lot, so the repeat never lands in one frame.
   */
  matcapRules: [
    { prefix: 'ground', matcap: 'neutral' },
    { prefix: 'exhibit_a', matcap: 'accent-warm' },
    { prefix: 'exhibit_b', matcap: 'accent-cool' },
    { prefix: 'exhibit_c', matcap: 'accent-deep' },
    { prefix: 'exhibit_d', matcap: 'accent-cool' },
    { prefix: 'ramp_', matcap: 'stone' },
    { prefix: 'vehicle_hull', matcap: 'vehicle' },
    { prefix: 'vehicle_cabin', matcap: 'dark' },
    { prefix: 'vehicle_nose_accent', matcap: 'accent-warm' },
    { prefix: 'vehicle_lamp', matcap: 'ivory' },
    { prefix: 'vehicle_spoiler', matcap: 'accent-warm' },
  ],

  /**
   * Which AO bake each static object samples, by name prefix. Empty while the
   * arena is greybox: the per-district bakes arrive with the Phase 10 art
   * pass (docs/pursuit-arena/04 §4). The prototype world's two bakes went
   * with it in Phase 4.
   */
  bakeRules: [],

  /** Every matcap in public/textures/matcaps/, nameable as `mc_<name>` from Blender. */
  matcaps: ['neutral', 'stone', 'accent-warm', 'accent-cool', 'accent-deep', 'ivory', 'dark', 'vehicle'],

  /** Matcaps used by geometry built in code (wheels), not loaded from glTF. */
  wheelMatcap: 'dark',
  hubMatcap: 'ivory',

  /**
   * The background gradient (`src/render/sky.js`).
   *
   * A flat `scene.background` colour was the giveaway that this was a
   * viewport and not a picture: a real sky is never one value, and the eye
   * reads the missing vertical falloff as "unfinished" long before it can say
   * why. This is a two-stop warm gradient -- pale cream at the horizon
   * lifting into apricot overhead -- built from the same palette family as
   * the geometry (`tools/generate-matcaps.mjs`).
   *
   * Colours are authored in sRGB, like every other hex in the project; three
   * converts them to the linear working space on the way into the uniform,
   * and `OutputPass` tone-maps and re-encodes at the end of the chain, so
   * on-screen the sky sits a little deeper than these values.
   */
  sky: {
    /** Colour at eye level, where the ground plane's far edge meets it. */
    horizon: 0xfae7c6,
    /**
     * Colour straight up. A dusty rose rather than another sand tone: the
     * ground is already warm yellow, and a sky that only differs from it in
     * brightness leaves the frame reading as one flat material with a line
     * across it.
     */
    zenith: 0xc4614f,
    /**
     * Colour straight down. Only ever visible off the edge of the 240 m
     * ground plane or mid-jump, but a hard cut there would read as a bug.
     */
    nadir: 0xb0574a,
    /**
     * Exponent on |direction.y|, so `zenith` reaches down towards the horizon
     * as this drops below 1 and retreats towards straight up as it rises
     * above 1. Chase-camera framing only ever shows the first 20-25 degrees
     * of sky, so a value near 1 puts the entire gradient off the top of the
     * screen and the visible band reads as a flat wash -- which is what 0.72
     * did. 0.42 brings the rose down into frame.
     */
    falloff: 0.42,
    /**
     * Distance fog, matched to the horizon so the ground plane's far edge
     * dissolves into the sky instead of ending in a visible line.
     */
    fog: 0xf1e1c4,
    fogNear: 80,
    fogFar: 240,
  },
}

/** Deep-clone of the defaults, so the debug panel can offer a proper reset. */
export const defaultSettings = structuredClone(settings)

/**
 * Quality presets bundling the knobs that actually move the frame-time
 * needle: AA mode, the device-pixel-ratio cap, and whether post-processing
 * runs at all. Applying one (`createDebugGui`'s "Quality" dropdown) just
 * assigns these three fields into `settings` and resizes -- it is a
 * convenience preset, not a mode the rest of the app has to branch on.
 *
 * Only `high` is tuned against this machine's actual measurements; `medium`
 * and `low` are reasonable guesses (cheaper AA, a tighter pixel-ratio cap,
 * post off entirely for `low`) and unverified -- there is no lower-end or
 * mobile hardware to test them on yet. They exist so that testing, once it's
 * possible, has somewhere to land instead of starting from nothing.
 */
export const qualityTiers = {
  high: { pixelRatioCap: 1.5, aaMode: 'smaa', postEnabled: true, vfxDensity: 1 },
  medium: { pixelRatioCap: 1, aaMode: 'fxaa', postEnabled: true, vfxDensity: 0.6 },
  low: { pixelRatioCap: 1, aaMode: 'none', postEnabled: false, vfxDensity: 0.35 },
}
