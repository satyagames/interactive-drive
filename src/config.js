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
     * Off by default, and that is a finding rather than an oversight.
     *
     * Bloom needs its bright pixels to be *small*, and in this scene they
     * never are. Matcaps are 8-bit textures, so nothing a surface can produce
     * exceeds 1.0, and after the look pass the frame's linear values stack up
     * as: ground 0.73, sky horizon 0.95, headlamps 0.90. The only genuinely
     * small bright features are two 26 cm headlamp discs, and there is no
     * threshold that isolates them -- anything under 0.90 also catches the
     * entire sky, and anything under 0.73 catches the ground as well and
     * turns the whole frame to mush. Above 0.95 it does nothing at all, even
     * at strength 3.
     *
     * (The numbers moved with the palette -- this used to read "the brightest
     * highlight lands around 0.6" against the old grey-and-blue scheme -- but
     * the conclusion did not, and for the same structural reason: a stylised
     * matcap scene has broad flat colour, not specular pinpoints.)
     *
     * So it stays wired up and tunable, ready for the first emissive or
     * genuinely bright material, and costs nothing while disabled -- a
     * disabled pass is skipped entirely by the composer.
     */
    bloom: {
      enabled: true,
      /** A sheen on the highlights, not a glow, for when there are any. */
      strength: 0.28,
      radius: 0.6,
      threshold: 0.9,
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
 * World asset + the naming convention `world.js` reads out of it. See
 * `docs/blender-conventions.md` for the authoring side of this contract.
 */
export const world = {
  url: 'models/world.glb',
  collisionPrefix: 'collision_',
  spawnPrefix: 'spawn_',
  triggerPrefix: 'trigger_',
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
   * Which AO bake each static object samples. Two atlases rather than one:
   * the 240 m ground needs a whole texture to itself to have any resolution
   * left, while the props are small enough to share.
   */
  bakeRules: [
    { prefix: 'ground', file: 'world-ao-ground.png' },
    { prefix: 'exhibit_', file: 'world-ao-props.png' },
    { prefix: 'ramp_', file: 'world-ao-props.png' },
  ],

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
  high: { pixelRatioCap: 1.5, aaMode: 'smaa', postEnabled: true },
  medium: { pixelRatioCap: 1, aaMode: 'fxaa', postEnabled: true },
  low: { pixelRatioCap: 1, aaMode: 'none', postEnabled: false },
}
