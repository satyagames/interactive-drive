# Changelog

Pursuit Arena build log. One entry per phase (see `docs/pursuit-arena/06-phased-prompts.md`).

## Phase 11 — QA and ship

- **QA checklist** (`docs/pursuit-arena/QA-checklist.md`) covers build and tooling, content and IA, gameplay,
  inputs, browsers and devices, accessibility, performance budgets and the offline package. Every row has a status
  and its evidence; every open row has an owner (as a role: COE content, Brand, Dev, QA-Mac, QA-Android,
  QA-laptop). It ends with an open-items list and how to re-run each part.
- **Content-editing guide** (`docs/content-editing-guide.md`) for the Pursuits team: how to change station text,
  pictures and links, the timeline, the leader's welcome, "What's new", birthdays, service awards and events in
  `content/arena.seed.json` without touching code. It covers the rules (consent, never invent, placeholder until
  approved, never change an id), VS Code's live schema checking, and the two commands that publish.
- **Feeds now show up** (found while writing the guide: editing `feeds.events` or `feeds.serviceAwards` did
  nothing, and birthdays only fired confetti):
  - stations take an optional `"feed"`; Birthdays, Service awards and Upcoming events use it
  - the station panel lists today's birthdays (else this month's), service awards (longest first) and upcoming
    events (past ones drop off), with "sample" tags on placeholder entries (`src/content/feeds.js`)
  - schemas for awards (`years` integer) and events (`YYYY-MM-DD`, optional time, place and link)
  - birthdays reject a year
  - the confetti finds its station by its feed instead of a hard-coded id
- **Share package fixed and hardened:**
  - `npm run package:share` failed on Windows: it spawned `npm` directly and needed a `zip` command. It now builds
    through the shell and writes the zip itself (deflate, UTF-8 names, Unix permissions, so the Mac launcher stays
    executable).
  - The launchers (renamed **Start Pursuit Arena**) used `python -m http.server` or `npx serve`. That had three
    problems:
    - the Store `python` stub on Windows made the launcher fail
    - `npx serve` downloads from the internet, which isn't offline
    - Python's server on Windows can serve `.js` as `text/plain`, which breaks modules
  - The fix: two bundled, dependency-free servers (`serve.py`, `serve.mjs`) with fixed MIME types, bound to
    127.0.0.1 on a free port, that open the browser. The launchers *try* each runtime rather than just finding it.
  - Line endings are pinned in `.gitattributes` and normalised by the packager: LF for the `.command` and the
    servers (a CRLF `.command` fails on macOS, and a Windows checkout would produce one), CRLF for the `.bat`. The
    zip is now `pursuit-arena-share.zip`.
- An inline SVG favicon (a green disc with "10"; not the logo): the browser no longer requests `/favicon.ico` (the
  only 404 in the offline run).
- README now leads with Pursuit Arena and has sections on sharing, updating content and what's placeholder;
  AGENTS.md points at the checklist and the guide.

Checklist run (details and evidence in the checklist):
- [x] Every IA node opens by driving into its area (43/43); Explore lists all 43.
- [x] Every badge (17/17) through the real detection paths, from a clean store (backed up and restored after).
- [x] Keyboard: all driving keys held and all action keys pressed for real.
- [x] Gamepad: through a software stand-in (no physical pad here).
- [x] Touch: joystick and respawn at phone size.
- [x] Chrome and Edge (headless), default and reduced motion, from the **unzipped package with every off-machine
  request blocked**: 0 off-machine requests, no errors. Windows extraction is identical to `share/`.
- [x] Lighthouse accessibility 100 on all ten steps, including a station panel with a feed.
- [x] Budgets (Phase 10 numbers): 7.8 MB first load, at most 117 draw calls, 85k triangles.
- [ ] Open, with owners:
  - COE content and Brand assets
  - Firefox, Safari, iOS and Android (no devices here)
  - the target-laptop frame rate
  - a physical gamepad, and gamepad menu navigation
  - NVDA / VoiceOver
  - KTX2 (needs `toktx`)
  - real audio

## Phase 10 — Art pass, the cart, and performance

- **The anniversary cart** (`blender/scripts/gen_cart.py`, `npm run art:cart`): an original, toy-like open-top buggy,
  generated, bevelled, AO-baked and exported in one pass.
  - The look: Deloitte-green tub with rounded fenders over chunky wheels, dark seats and trim, a white roll bar, and
    a "10" pennant (shapes, no font) on the spring antenna.
  - Size: 3,140 triangles (budget 4k), a 49 KB GLB, and a 1024² AO atlas.
  - Space: authored in the physics body's own space and size, so the runtime only turns it π.
  - Runtime (`arcadeVehicle.js`):
    - wheel_FL's look is cloned for all four physics wheels
    - the model's `antenna` hangs off a pivot in the car's frame
    - the `light_brake_*` / `light_reverse_*` meshes are driven as before
    - skins repaint `cart_body`
  - The procedural wheels, antenna and lamps it replaces are gone. The prototype car stays for `?vehicle=sim`.
  - **Nose-first verified:** driving forward, the headlamps' world bounding-box centre leads along the velocity and
    the tail lamps trail.
- **Matcaps:** `brand-green`, `gold`, `glass`, `paper` and `red-tape` added to `tools/generate-matcaps.mjs`. All five
  hit their hex at the centre texel; red-tape needed a low specular and green-poor fill to reach #C8102E.
- **Landmarks:**
  - HQ tower: glass storeys, white bands, eight fins, a crown and a beacon mast
  - the "1" of the monument: a flag and a plinth
  - RFP Gate: a paper arch with printed lines
  - Studio pencil: eraser, ferrule, sharpened wood and lead
  - materials: the toolbox and Red Tape bricks in red-tape, coins, trophy and golden dots in gold, and every
    tinted-ivory brand green replaced with the brand-green matcap
- **Art pass** (`blender/scripts/polish.py` + `polish_lib.py`, `npm run art:polish`, now part of `art:build`):
  - Bevels: on every static visual (2 segments), and on every dynamic prop and kit piece (1 segment, on the shared
    mesh so prop batching survives). Trees are skipped (budget).
  - `landmark_*_LOD1` twins: the pre-bevel blockout.
  - Per-district AO atlases: 1024², HQ 2048².
  - The base's ground bake: AO × soft sun shadow, with every district linked in as an occluder.
  - Bakes ship as greyscale JPEG: 2.3 MB for all 17, against 8.6 MB as RGB PNG.
  - Validation counts LOD1 twins apart. Authored total 86k triangles (was ~23k); every district, landmark, pod,
    prop and tree budget passes.
- **Runtime:**
  - `world.js` loads each district's bake from the manifest and applies it to meshes carrying the bake UVs;
    `mergeStatics` keeps `uv1`.
  - Landmarks merge into separate LOD0 and LOD1 sets; `updateLod()` swaps them by camera distance, with 5 m of
    hysteresis.
  - `materials.js` gains `loadBake()` and a `bakeFor` option.
- **Quality tiers:**

  | Tier | AA | Bloom | VFX | Pixel ratio | LOD at |
  |---|---|---|---|---|---|
  | high | SMAA | on | full | 1.5 | 95 m |
  | medium | FXAA | on | 60% | 1 | 70 m |
  | low | FXAA | off | 35% | 1 | 45 m |

  - Low now keeps post-processing on (FXAA, no bloom), where before it turned it off.
  - Applied identically by the menu, `?quality=` and `#debug`.
  - Doc 06's "half-res blobs" has no equivalent here: our blob shadows are analytic quads with no texture to halve.
- **Decisions:**
  - **KTX2 not done.** `toktx` isn't installed on this machine, and doc 04 allows the PNG fallback. The bakes went to
    greyscale JPEG, which already fits the budget. KTX2 needs `toktx`, a `KTX2Loader` with the Basis transcoder,
    and a manifest flag.
  - **Landmark LOD = the unbevelled blockout**, not a decimated mesh: same silhouette, roughly a third of the
    triangles, and no decimation artefacts.

Bugs found while building it, and fixed:
- **`save_render` darkened every bake by ~23%** through Blender 5's default AgX view transform. Saves now use
  Standard.
- **Ground bake conflicts:**
  - raised base meshes (ramps) and roads shared the ground's planar texels and baked black slabs onto the ring road
  - the sun pass needed normalising (open ground read 0.77)
- **Atlas packing:**
  - plaza undersides took a quarter of HQ's atlas; downward faces are now left out
  - repacking without collapsing those faces first shrank every island to dots

Acceptance checks:
- [x] **First load under 10 MB:** 7.79 MB raw / 5.28 MB gzipped (production build). That covers index, the JS
  bundle, the Draco decoder, 13 matcaps, kit, cart, the 10 core districts and their bakes. The outer ring streams
  1.21 MB more afterwards. The whole `dist/` is 9.74 MB.
- [x] **Under 150 draw calls in the busiest view:** 101 car positions on a 22 m grid over the whole arena, every
  district revealed:
  - worst 117 draw calls; median 92
  - worst 85k triangles (budget 250k)
- [ ] **60 fps on the target laptop: not measured.** There's no 2020 integrated-GPU laptop here. On this machine
  (RTX 4080 SUPER, pixel ratio 1): 59.9 fps, p99 16.9 ms over 12 s of driving.
- [x] Low tier verified: FXAA, bloom off, VFX 0.35, LOD 45 m. Skins repaint the cart.
- [x] `art:build` (gen → polish → validate → export → cart, about 3 minutes with the GPU) passes; the production
  build passes.
- [ ] Not looked at closely: every district at close range after the bevel, and the LOD1 swap distance in motion.
  The scan only checked that it happens (12 of 14 districts on LOD1 from the far edge).

## Phase 9 — UI, HUD and accessibility

Doc 05 §5, in `src/ui/`.

- **Loading and Start** (`startScreen.js`):
  - a black screen with a big "10" (drawn as SVG shapes) that fills Deloitte green as files arrive, driven by
    three's `DefaultLoadingManager`, plus stages
  - "Pursuit Arena" and "USI Pursuits COE · 10 Years", a real `role="progressbar"`, keyboard and touch hints
  - then **Start**, which takes focus. Nothing moves until it's pressed; then the opening (camera dolly, car drop,
    letters) plays. The click is also the audio unlock.
- **HUD corners** (`hud.js`, `minimap.js`, `gameHud.js`):
  - top left: the passport ring and rank
  - top right: collectibles and stations visited, and a **Menu** button
  - bottom centre: a contextual hint (drive controls until the first 25 m; "Enter: open {station}" in an area; a
    nudge to the first station; a Passport pointer after a stamp)
  - bottom right: a compass / minimap turned to the camera. District markers fill once stamped; HQ, the car, and a
    pulsing diamond for the next objective (the Dash checkpoint, else the nearest unstamped district). The
    objective is also written under the map and in its accessible name.
  - The corners fade after 4 s of driving (`settings.hud.idleHide`). A stop, any game event, the pointer or focus
    brings them back. Opacity only, so they stay readable by screen readers.
- **Esc menu** (`menu.js`): a modal dialog (focus moves in, Tab is trapped, Esc backs out of a view then closes,
  focus returns). The game pauses: no physics, no game clock.
  - Resume · Explore mode · Passport & badges · Controls (a table from `content/ui.json`) · Audio (the Sound panel)
  - Graphics: Low / Medium / High radios, applied live and saved in `localStorage` (`pursuit-arena/settings`);
    `?quality=` still wins for one load
  - Reset progress (confirm step) · Credits
  - Explore, Passport and Sound moved into the menu (their `P` / `M` keys are unchanged).
- **Accessibility:**
  - the viewport meta no longer blocks zoom (`user-scalable=no`, `maximum-scale=1` removed); pinch on the canvas
    still zooms the camera
  - the arena is the page's `<main>`, with a screen-reader heading
  - closing a screen whose launcher is tucked in the menu returns focus to the game canvas, not to a hidden
    button. Returning to the Menu button would also let Space (brake) reopen the menu.
  - the speed / fps readout is now `#debug` only
- **Copy:** new `start`, `menu`, `controls` (an array of rows, with its own schema) and `credits` sections in
  `content/ui.json`, and the HUD hint and map strings. Dead strings removed (`loader`, the old Sound launcher
  labels). Credits invent nothing: team credits read "to be supplied" with a visible "coming soon" tag.
- **Decision:** the speedometer isn't part of doc 05's HUD, so it stays a `#debug` readout.

Acceptance checks:
- [x] **Lighthouse accessibility ≥ 95 on the menu screens.** Lighthouse 13.5.0, run as a user flow against the dev
  server in headless Chrome with a fresh profile. Every step scored **100**, at 1280×800 and at 360×740 (mobile
  emulation):
  - the initial navigation and the Start screen
  - the menu and each of its views (Controls, Graphics, Reset, Credits)
  - the Passport and Sound

  The first desktop run scored Sound 98 ("no main landmark", since the Start screen was the `<main>`); fixed by
  making the arena the `<main>`. Lighthouse was installed in a scratch folder only, not added to the project.
- [x] **Works at 360 px width:** in-app browser at 360×740 with mobile emulation:
  - Start, the HUD with the touch pad (counts stack under Menu), the menu and its views
  - no horizontal scroll (`scrollWidth` 360)
- [x] **Keyboard:**
  - Enter on the focused Start button starts
  - Esc opens the menu with Resume focused; Tab, Enter and Esc reach and leave Controls with focus back on its
    button
  - Graphics → Medium with the arrow keys applies live (FXAA, pixel ratio 1, VFX density 0.6) and saves
  - Esc, Esc closes the menu with focus on the canvas
- [x] **Touch / pointer:** tapping Start and the Menu button at 360 px.
- [x] **Pause:** menu opened at speed, the car moved 0 m in 1 s.
- [x] **Auto-hide:** faded after about 4 s of driving, back on stopping. New-visitor hint shows the drive controls.
- [x] `npm run build` and `content:check` pass.
- [ ] Screen-reader pass with NVDA / VoiceOver: not done; only Lighthouse / axe-level checks and keyboard paths.
- [ ] Gamepad can open the menu (Menu button) but can't move focus inside it; it needs a focus-navigation layer.
- [ ] The station panel still covers the top-right Menu button on desktop while open (Esc closes it first).

## Phase 8 — SFX and music

All of doc 05 §3 in `src/audio/` (Web Audio). Every sound is a procedural placeholder until real files arrive, as
doc 06 asks.

- **Unlock:** no AudioContext is created until the first `pointerdown`, `keydown` or `touchend`. The context is
  suspended while the tab is hidden.
- **Mixer** (`mixer.js`): Music (plus a separate duck stage), SFX and Ambience feed Master, then a limiter
  (-6 dB, 20:1, 1 ms) and a meter. Levels and mute are the visitor's, saved in `localStorage`
  (`pursuit-arena/audio`, try/catch).
- **Engine** (`engine.js`):
  - three saw+square layers crossfaded by speed, pitch 0.8 → 1.8
  - level and filter brightness rise with throttle
  - boost adds a turbo whine and hiss
  - road rumble, a skid from sideways slip, a landing thud scaled by fall speed
- **One-shots** (`sounds.js`), from `game.events`:
  - impacts by `sfx` class (metal, wood, paper, plastic, brick, rubber), level and pitch from strength, faded and
    panned by distance from the car
  - dot chimes climbing the C-major pentatonic with the combo; a golden-dot chord; a shuriken "shing"
  - stamp thunk and crowd cheer; badge and rank arpeggios; station-open blip
  - Dash countdown, go, checkpoint, penalty and the "submitted" fanfare
  - mini-game cues; the Konami run-up; the beacon's Morse "10", timed by `src/game/morse.js`, shared with the light
  - the two-tone "dot-dot" horn; the finale fanfare
- **Voice limit:** each one-shot is one voice; at most `settings.audio.maxVoices` (12) at once, the rest dropped.
- **Ambience** (`ambience.js`): one PannerNode per `sfx_` empty, active only while the car is within 1.6× its radius:
  - HQ office hum; Studio pencil scratches and keys; PACE distant engines and passing cars
  - R&R crowd and applause; Culture birds and soft music; Innovation pad; L&D page turns; arena wind
- **Music** (`music.js`): an original 8-bar placeholder theme (C–Am–F–G–C–Em–F–G, 108 bpm), sequenced on the audio
  clock with look-ahead. Keys, bass, drums and lead join at 0 / 2 / 5 / 8 stamps; the finale brings in all four. It
  ducks to 30% under the station panel and the Passport.
- **Sound panel** (`ui/soundPanel.js`, HUD "Sound" button):
  - mute checkbox and four labelled range sliders
  - keyboard-operable, and arrow keys don't drive while it has focus; Esc closes it and returns focus
  - shows that the sounds are placeholders
  - `M` mutes from anywhere, announced through the `aria-live` announcer
  - all copy in `content/ui.json → sound` (schema extended)
- **Docs:** `public/audio/MANIFEST.md` lists every file wanted, with format, budget and licence source (CC0 or
  commissioned; the theme commissioned). `CREDITS.md` is new: libraries and their licences (checked against
  `node_modules`), the reimplementation note, and an empty audio log.
- **Decisions:**
  - Gateways, Decade Drive, Audit, Tax, Consulting, Catalyst and Toolkit have no ambience. Doc 05 doesn't say what
    they should sound like, so they're left for the team's sound design rather than invented.
  - Music stems use their own gain stages and don't count against the 12 one-shot voices. Doc 05's limit is for
    impacts and effects.

Acceptance checks (in-app browser, real clicks and key presses):
- [x] **No audio before the first gesture:** after load, `audio.context` is `null` and stats read `locked`. One click
  on the canvas (or on the Sound button) → `running`.
- [x] **The engine responds to speed and throttle**, measured as output peak and spectral centroid, with music and
  ambience at 0:

  | State | Centroid | Peak |
  |---|---|---|
  | rest | 82 Hz | 0.14 |
  | coasting at 15 m/s | 222 Hz | 0.27 |
  | full throttle at 16 m/s | 281 Hz | 0.45 |
  | boost at 31 m/s | 821 Hz (whine) | 0.54 |

- [x] **No clipping with 12 voices:** every bus at 100%, engine at full throttle with boost, all four music stems,
  then three bursts of 20 full-strength impacts plus a golden chord and a fanfare. Voices capped at 12 (the rest
  dropped); output peak 0.905; limiter reduction up to 10.6 dB.
- [x] **Voices free up:** 0 live voices a second after the bursts.
- [x] **Mute:** `M` takes the output to 0, announces "Sound muted", relabels the button "Sound off", and persists.
  `M` again restores it ("Sound on").
- [x] **Ducking:** music peak 0.79 → 0.35 with the Passport open, back after it closes.
- [x] **Ambiences:** each named emitter starts in its own district (HQ, Studio, PACE, R&R, Culture, Innovation, L&D)
  and stops on leaving; arena wind plays everywhere.
- [x] `audio.update`: 0.011 ms average, 0.1 ms worst, per frame.
- [x] `npm run build` and `content:check` pass; no runtime errors from the audio code.
- [ ] Listened to by a person: not yet. The placeholders were checked only by meter. Their musical and tonal quality
  is for the team to judge, and they're meant to be replaced.
- [ ] Safari / iOS (the `webkitAudioContext` and `setPosition` fallbacks) untested.

## Phase 7 — VFX

Every effect in doc 05 §2, in `src/vfx/`, driven by `game.events` and the car's state. All pooled: buffers are sized
once at boot and nothing grows.

- **Systems:**
  - `particles.js`: one instanced, CPU-simulated pool per draw call (flat `Float32Array`, live particles kept packed),
    with per-category caps (dust 64, confetti 400, ...)
  - `atlas.js`: a 4×4 sprite atlas drawn on a canvas at boot (puff, spark, paper, chip, star, confetti, a tiny "10",
    ring, ink splat, glow). No image files.
  - `ribbon.js`: skid marks and the paint trail in one ring-buffer mesh, faded by age in the shader
  - `speedLines.js`: boost streaks built in clip space
  - `fireworks.js`: GPU shells, written once per launch and flown by the vertex shader
  - `stamp.js`, `portal.js`, `floaters.js`: DOM "+N XP" labels, `aria-hidden`; copy is `game.xpGain`
- **Effects:**
  - tyre dust (sliding rear wheels, hard landings)
  - boost: green exhaust, speed lines, +4° FOV kick
  - skid marks (6 s), Studio paint trail (10 s)
  - impacts by `sfx` class: metal → sparks, paper → fluttering sheets, brick/wood → chips, plastic/rubber → dust; the
    car shakes the camera on hard hits
  - pickup sparkle, ring and "+N XP"; idle twinkles on nearby collectibles
  - stamp slam, ink splash and a 2 s light pillar
  - confetti: Strike a Win, Dash finish, the finale, and the Birthdays station when a `feeds.birthdays` date is today
  - Decade Fireworks with "10" and dot shells: finale, Konami
  - Submission Portal energy (pulses on a Dash finish)
  - Idea Spark bulbs glow once lit; the HQ beacon blinks "10" in Morse; golden skin trails tiny 10s
  - landing FOV punch and micro-shake
- **Impacts** (`src/world/impacts.js`): prop colliders and the car's body raise Rapier contact-force events above a
  per-mass threshold (`settings.impacts`). The stepper drains them after every step into
  `impact { position, sfx, strength, withCar, prop }`, at most one per body per 80 ms. Phase 8's SFX gets the same
  events.
- **Selective bloom** (`settings.post.bloom`): matcap surfaces can't exceed 1.0, so emissives are drawn in HDR
  (`settings.vfx.emissive`, ×2.6) and the bloom threshold sits at 1.15. The threshold *is* the layer mask: one scene
  render, correct occlusion, no material swapping. (Three's two-pass selective bloom would double the draw calls
  rule 5 counts.)
- **Quality tiers:** `qualityTiers` gains `vfxDensity` (1 / 0.6 / 0.35). `?quality=medium|low` picks a tier at load;
  the `#debug` preset still does it live.
- **Reduced motion:** from `prefers-reduced-motion` (read live) or `settings.vfx.reducedMotion`. It turns off the
  camera kick and shake and the speed lines, cuts confetti to 30%, stops fireworks flashing and twinkling, and makes
  the stamp appear instead of fall.
- **Debug:**
  - `__proto.benchmark.vfx()` times the VFX on the GPU (same frame offscreen, effects shown vs hidden) and reports
    the CPU cost of `vfx.update`
  - `__proto.loop.step(dt)` runs frames by hand for scripted tests in a hidden or throttled tab (`loop.stop()` /
    `start()` too)
  - the GPU timer now polls with `setTimeout`, so it also completes in a hidden tab, where rAF stops
- **Decisions:**
  - Emissive particles, the portal, the pillar and the fireworks are alpha-blended HDR colour, not additive. Additive
    green over the white plazas and the cream sky washed out to white.
  - Fireworks burst about 10 m up, around where the camera is looking, not high over the tower. The iso camera
    pitches 32° down, so the top of the frame is still 12° below the horizon and a high shell is out of shot from
    almost everywhere. For the same reason the Morse beacon also flashes at the tower's foot.
  - Particle sizes were set for the default iso distance; at first, sparks were 3 px.

Bugs found during verification and fixed:
- **Props sank through the floor** (Phase 5's idle sleeper). Calling `body.sleep()` on one still body while the rest
  of its island was awake left it integrating under gravity with frozen contacts. Seen in the Toolkit brick wall and
  the PACE tyre stack (tyres at y = −550 and still falling). Now a district's props are put to sleep together, once
  *every* awake prop in it has been still for 1 s. Free props get a little angular damping
  (`settings.props.angularDamping`, a rolling-resistance stand-in): a coin rolling on its edge otherwise kept the Tax
  district awake.
- **Fresnel rims and accents never rendered.** `render/materials.js` patched `#include <output_fragment>`, a chunk
  three r154+ renamed `opaque_fragment`, so the patch matched nothing (flagged in Phase 6). Fixed; the default rim
  adds at most 0.035, below the bloom threshold.
- (Caught before commit: a shadowed `lift` parameter made every ribbon vertex NaN.)

Acceptance checks (in-app browser, scripted with `loop.step` because the pane was hidden; this machine is an RTX 4080
SUPER):
- [x] **VFX under 1 ms per frame:**
  - CPU (`vfx.update`) under worst-case stress (400 confetti, ~650 matte and ~200 emissive particles, 10 firework
    shells, the stamp, all at once): 0.09 ms average, 0.33 ms peak
  - CPU on the frame that fires the finale, stamp and Konami together: 0.81 ms
  - GPU, same stress, via `benchmark.vfx()`: within timer noise at 1600×900 (0.453 vs 0.454 ms) and at 4096×3072
    (±0.1 ms)
- [x] **No GC spikes over 2 ms in a 5-minute drive:** autopilot laps of the HQ ring, boosting every 12 s and drifting
  every 20 s, 18,000 frames, 9 respawns.
  - VFX on: no frame more than 2 ms over the median (median 0.4 ms, p99.9 0.9 ms, max 2.7 ms); VFX update peak 0.10 ms
  - VFX off, same drive: 12 such frames, so the remaining jitter isn't the effects
  - VFX per-frame allocations removed (reused update ranges, an allocation-free wheel contact, a hoisted drain
    callback), after a first run showed them adding ~80 KB/s
- [x] Reduced motion (forced): no FOV kick (normal 3.8°), no speed lines (normal 0.54), 78 of 260 confetti.
- [x] `?quality=low`: post off, density 0.35 (91 of 260 confetti), pixel ratio 1.
- [x] Seen on screen: portal, pickup rings, sparks, paper, chips, landing dust, speed lines, exhaust, paint trail,
  stamp with ink and pillar, confetti, fireworks, beacon flash. No runtime errors.
- [x] After visiting every district and driving through the Tax coins, no prop is below the floor, and every prop is
  asleep within 3 s.
- [x] `npm run build` passes.
- [ ] Not measured on the target 2020 integrated-GPU laptop; the GPU numbers above only show the effects are cheap on
  fast hardware.
- [ ] Skid marks share the paint-trail code path, which was verified, but they weren't seen in a real drift: the
  scripted drifts mostly ended in walls.
- [ ] Stack tops still settle a few cm, and the odd top block falls, when a district's props hand back to physics
  after a reveal. Pre-existing; the old sleeper was hiding it by freezing them.

## Dev tooling — reliable reloads on Windows (between Phases 6 and 7)

- `vite.config.js`: the dev server watches by **polling** on Windows (`usePolling`, 100 ms), and waits for a file to
  stop changing before reloading (`awaitWriteFinish`, 80 ms). `VITE_WATCH_POLL=1|0` overrides it on any platform.
  `dist/`, `share/`, `blender/` and `.git/` are ignored, so polling stays cheap.
- Why: three times (Phases 2, 5 and 6) the native watcher missed the second of two quick edits, and Vite served a
  half-edited module. The last time, that crashed every frame where the car took off.
- Verified on this machine with a scratch stress test, then removed:
  - 40/40 rapid double-writes (5 ms apart) to an unimported module served correctly: median 157 ms, max 206 ms
  - 25/25 the same with the module in the running page's module graph: median 157 ms, max 190 ms
  - two back-to-back Edit-tool edits to a real module (`src/game/events.js`), then their revert, both served within a
    second
  - idle cost: 0.3% of one core

## Phase 6 — Gamification

The whole of doc 03, in `src/game/`, around one event bus (`events.js`; VFX, SFX and UI subscribe instead of being
called).

- **Persistence** (`store.js`): one versioned `localStorage` blob, every access try/catch-wrapped, writes debounced, no
  network. Reset is two-step from the Passport screen.
- **Progression** (`progression.js`):
  - XP and ranks from the seed's `gamification`
  - the 11-stamp Pursuit Passport: gateway trigger *and* one opened station, in either order
  - 17 badges and 4 skins
  - the Decade Finale (event, Pursuit Legend badge and rank, golden skin)
  - "open every station" badges for Culture, L&D and Toolkit
- **Collectibles** (`collectibles.js`):
  - 100 / 10 / 8, bobbing and spinning
  - a 2 m magnet fly-in, dot combos, and golden / shuriken completion badges plus the ninja skin
  - collected ones stay gone across reloads, and counts come from the saved record, so streamed districts don't skew them
- **Deadline Dash** (`dash.js`):
  - started by the RFP Gate start pad; 3-2-1 with the car held
  - a random Qualify → Write → Review → Submit chain located from the world's triggers and areas
  - compass and distance, +2 s scope-creep penalties on sudden speed loss
  - seed medals, a saved personal best, and the Deadline Hero badge for gold
- **Mini-games** (`minigames.js`): Chart Stack, Coin Run, Idea Spark, Pace Lap (with a ghost of the best lap), Paint
  Trail (skin), Bridge Run, Strike a Win and Red Tape Wall, all watching the real props and car. Props still on a
  reveal's drop path are ignored.
- **Achievements and easter eggs** (`achievements.js`):
  - First Drive (real distance only), Airtime (real launches only), Loop the 0
  - Konami code → golden skin
  - 10 honks at HQ → beacon Morse event
  - 10 passes through the "0" → a physics trophy drops
- **UI:**
  - `ui/gameHud.js`: rank, XP, an 11-segment passport ring in district colours, counters, the Dash panel, and toasts in
    an `aria-live` region
  - `ui/passportScreen.js` (P): stamps, badges with how-to text, collectibles, records, skin choice, Reset
  - All copy is in `content/ui.json` (schema extended); tunables in `settings.collectibles` and `settings.game`
- **Car skins:** `arcadeVehicle.setTint()` repaints the hull.
- **Decisions:**
  - Airtime is 1 s, not doc 03's 2 s: doc 07 V15 shows 2 s is unreachable on the arena's ramps.
  - Coin Run scores the Tax playground's 12 coins (knock all within 20 s; on a miss they reset), not "25 coins in a
    lane".
  - Paint Trail awards its skin, not a badge; doc 03's badge list has no Paint Trail badge.

Bugs found during verification and fixed:
- Revealing a district counted its dropping-in props as knocked over, awarding Variance Found and Coin Collector on
  their own.
- The boot drop awarded Airtime.
- Collectible counters read 7/8 shuriken before the outer ring had streamed in.

Acceptance checks (in-app browser):
- [x] **The scripted test (`#debug` → Run badge test) awards every badge.** From a clean store: 17/17 through the real
  detection paths. All 11 stamps; rank Pursuit Legend. No badge is awarded by simply loading or revealing every district.
- [x] **Progress survives a reload:**
  - 17 badges, 11 stamps, rank and XP (5,195)
  - collectibles 10/10 golden and 8/8 shuriken, hidden in the world
  - 21 visited, and the Dash personal best
- [x] **Reset works:** the first click only asks to confirm; the second wipes the store and reloads to 0 XP, no badges,
  no stamps, 0 collected.
- [x] **Deadline Dash, real start path:** stopping on the pad opens it and starts the countdown. The car is held
  (0.13 m/s with throttle down), then the chain starts ("Qualify: Tax: Tax Terrace", 151 m) with the compass and timer.
- [x] `content:check`, `probe:feel` and `build` pass; no runtime errors after a drive, a horn and opening the Passport.
- [ ] Dot pickup by real driving around a full loop wasn't measured (the pane was throttled during the attempt). Pickup
  itself is covered by the badge test's drive-over of every golden dot and shuriken.
- [ ] Layout: at narrow desktop widths the station drawer overlaps the Dash panel (Phase 9 HUD work).

## Phase 5 — Dynamic props and interactions

- **Enter areas** (`src/world/areas.js`, doc 05 §4), replacing open-on-touch:
  - each area shows a faint border; driving in draws it around in 0.4 s and pops a floating **ENTER** hint (**TAP ↵**
    on touch), with an `aria-live` announcement
  - Enter / E / gamepad A / the touch ↵ button, or standing still for 1.5 s, opens the station, and a soft brake holds
    the car for 0.6 s unless you accelerate
  - driving out closes a panel the area opened after 1 s; Esc closes it and it stays closed until you press Enter again
  - strings are in `ui.json` (`areas.*`), timings in `settings.areas`
- **District reveals** (`src/world/reveal.js`): districts start hidden and reveal when the car or the Explore camera
  comes within their radius plus 40 m. Buildings, trees and collectibles scale in with overshoot, and props drop in as
  a wave from the centre on a kinematic path, so the Red Tape Wall, Jenga stack and pins land standing.
- **The opening:** PURSUIT ARENA and the golden "10" fall from 18 m in reading order while the car drops and the
  camera dollies out.
- **Reduced motion:** with `prefers-reduced-motion`, nothing is hidden or animated.
- **Playground behaviours** from doc 02:
  - Idea Spark bulbs hang on spring joints from a new gantry
  - Culture balloons float with 1.3× buoyancy on 2.2 m rope tethers
  - the Submission Portal ring and Innovation dome rings turn (new `anim_` prefix with `spin`/`axis` custom props:
    generator, validator, loader and conventions doc)
- **Sleep:**
  - an idle sleeper puts any prop that stays nearly still for 1 s to sleep; Rapier alone left jointed bodies awake
    indefinitely
  - a per-district awake budget (`settings.props.awakeBudget`, 60) sleeps the slowest bodies past it
  - blob shadows of unrevealed props stay hidden
- **Plumbing:**
  - `world.onDistrictLoaded()`, so areas and reveals pick up streamed districts
  - `world.animate()`
  - `props.fixedUpdate()` runs in the fixed step (buoyancy, drop tweens)

Acceptance checks (in-app browser, foreground pane, this machine):
- [x] **60 fps with all props awake in one district:** all 32 Toolkit Depot props kicked awake at once.
  - Physics step: mean 0.15 ms, p95 0.3 ms, max 0.5 ms.
  - Frame time: mean 16.67 ms, max 17.7 ms.
  - Stress case of all 246 arena props awake: step mean 0.64 ms, max 3.5 ms; still 60 fps (16.9 ms max frame).
- [x] **Area flow** (scripted): filling → ready (announced) → dwell opens → soft brake on → still open 0.4 s after
  leaving → closed by 1.3 s → Enter opens → Esc closes and dwell doesn't reopen. The hint is visible over a ready area.
- [x] **The opening plays** (screenshots mid-drop and settled; letters upright and in order). Explore fly-to reveals a
  hidden district (Toolkit).
- [x] **Bulbs and balloons:** a bulb hangs at its authored 1.6 m, swings when hit, settles home within 3 cm and sleeps
  (about 12 s of game time after a hard hit). A balloon knocked down to 2.0 m floats back to 2.2 m with the tether taut.
- [x] `art:build`, `content:check`, `probe:feel` and `build` pass.
- [ ] Not on the target 2020 integrated-GPU laptop (no access here).
- [ ] `prefers-reduced-motion` path is code-reviewed only (the in-app browser can't emulate it).

## Phase 4 — Blender arena blockout

- **Procedural arena** (Blender 5.2.2, headless), generated by `blender/scripts/`:
  - `gen_kit.py`: trees, lamps and collectibles
  - `gen_base.py`: ground, both ring roads and spokes, boundary berm and wall, 4 jump ramps, junction fingerposts,
    trees and lamps, 100 dots
  - `gen_district.py --id <id>`: the 14 districts (HQ, RFP Gate, Decade Drive, 6 territories, 5 pillars) at the seed's
    coordinates, each with:
    - plaza, gateway and `trigger_stamp_<id>`
    - themed landmark
    - one pod and `area_` per station
    - doc 02 playground of dynamic props (bowling, Red Tape Wall, Jenga, letters, …)
    - trees, spawn, ambience
  - Every name follows doc 04 §2 (`collision_`, `dyn_`, `inst_`, `area_`, `trigger_`, `collect_`, `spawn_`, `sfx_`, `decal_`).
- **Pipeline:**
  - `validate.py` checks naming, applied scale and budgets, that every content id has exactly one area, and that no
    dynamic prop starts inside static geometry. That last check caught about 60 bad placements during development.
  - `export_arena.py` writes one GLB per district plus `kit.glb` and `arena.manifest.json`.
  - `tools/blender.mjs` runs it all: `npm run art:gen | art:validate | art:export | art:build`. Blender comes from
    `BLENDER_BIN` / `.env.local` / the default install path.
- **Runtime** (`src/world/`):
  - `world.js` loads the manifest. Core districts load before the first frame and the outer ring streams in after it.
  - Nodes are classified by prefix at any depth, and static meshes are merged per material per district.
  - `kitInstances.js` instances kit pieces and their colliders.
  - `dynamicProps.js` builds `dyn_` props as sleeping Rapier compounds, with mass, friction and restitution from Blender
    custom properties. They are instanced per look and each gets a blob shadow.
  - `colliders.js` holds the shared box / `_cyl` / `_sph` proxy builder.
- **Materials** are named `mc_<matcap>[__<RRGGBB>]` in Blender (a tinted matcap); the object-prefix rules remain for
  the car. This settles the open matcap-naming decision: name prefix, with an `mc_` override.
- **Areas** open their station panel when you drive in. Phase 5 adds the ring fill and Enter on top. The HUD now counts
  "N / 43 visited". The boot spawn is the seed's `rfpGate.spawn`.
- **Retired:** the prototype world (`world.glb`, its two AO bakes, `content/projects.json`, the legacy-exhibit path).
  `blender/export.py` now exports only the car.

Layout bugs the drive test caught and fixed: a Decade Drive arch standing on the Deadline Loop, ramps on the 120°/300°
spoke junctions, and a centre pod blocking the gateway axis.

Acceptance checks (in-app browser unless noted):
- [x] **Whole map drivable** (autopilot, 0 stalls):
  - a full Outer Loop lap (35 s, ramps jumped) and a full Deadline Loop lap
  - all 12 spokes driven through each gateway to each district's centre
  - the Decade Drive into HQ
- [x] **Every area opens the right content:** 43 / 43 areas, each opening its own content node. The edge test on a
  non-square area confirms the Y/Z half-extent swap (inside at 1.8 m, outside at 2.3 m).
- [x] **Budgets:**
  - authored: 21k triangles in total; largest district 2.8k of a 25k budget
  - in view (direct render from 7 viewpoints including max zoom at HQ): at most 117 draw calls (under 150) and about
    40k triangles (under 250k)
  - first load 5.5 MB (under 10 MB), with 0.3 MB streamed afterwards
- [x] Physics settles: 246 props, 0 awake after the full drive. 60 fps in the foreground pane on this machine.
- [x] `npm run art:validate`, `content:check`, `probe:feel` and `build` pass.
- [ ] Frame rate on the target 2020 integrated-GPU laptop (not available here).
- [ ] Kinematic pieces (portal rings, dome rings, balloons) are static for now; animation is Phase 5. A full
  loop-the-loop "0" is left to the Phase 10 art and feel work (the greybox "0" is a drive-through arch).

## Phase 3 — Content model and IA

- **Arena seed is now the runtime content source.** `src/content/model.js` builds one tree (doc 05 §6) from
  `content/arena.seed.json`, covering:
  - the RFP Gate
  - HQ, with the leader block shown at the Leadership Balcony
  - the 10-year Decade Drive
  - "I. Our Team" (6 territories)
  - pillars II–VI, sorted by their numerals
  
  43 openable nodes in all. `trigger_<id>` resolves through the same tree. `content/projects.json` stays only for the
  prototype world's four exhibit triggers until Phase 4.
- **Schemas:** `content/arena.schema.json` and `content/ui.schema.json`, plus a small dependency-free validator
  (`src/content/schema.js`).
  - It runs in `npm run dev` (console) and in `npm run content:check`, which also checks image paths and cross-references.
  - It is tree-shaken out of production.
  - A negative test caught all six injected errors.
- **Interface copy** moved to `content/ui.json` (`t()`, `data-ui*` attributes). `index.html` no longer carries
  visible copy, and the document title comes from content.
- **Station panel v2** (`src/content/panel.js`):
  - right-hand drawer on desktop, bottom sheet on narrow screens
  - header in the district colour, with black or white ink chosen for at least 4.5:1 contrast
  - kicker, title, "Content coming soon" badge for placeholders, lead/role lines
  - image or scroll-snap gallery, body, and links that open in a new tab with a screen-reader note
  - never steals focus when a trigger opens it; returns focus to the Explore entry that opened it
- **Explore mode** (`src/content/explore.js`, `Esc` or the Explore button):
  - every district and station as a list you can move through with Up/Down/Home/End
  - picking a district flies the iso camera there (1.2 s ease, instant under reduced motion)
  - picking a station also opens its panel
  - driving off returns the camera to the car; on narrow screens the list closes after a pick
- **Esc order:** closes the panel first, then Explore, then opens Explore (the Phase 9 menu will take over that step).
  Driving keys are ignored while focus is in the Explore list (`data-captures-keys`).
- **Seed edit:** added `"name": "RFP Gate"` to `rfpGate`, the only group without a display name. It comes from doc 02.
- **Debug panel:** the lil-gui tuning panel now only appears with `#debug`, as doc 01 specifies. It overlapped the new
  drawer.

Acceptance checks (in-app browser):
- [x] All 43 IA nodes open from Explore, each with the right title, badge state and camera fly-to (scripted sweep, 0 failures).
- [x] Keyboard only, with real key presses:
  - Esc opens Explore with focus on the first entry
  - arrows move through the list without driving the car
  - Enter on a group flies the camera there
  - Enter on a milestone opens its panel with focus on the title
  - Esc closes the panel, then Explore, with the camera back on the car and `aria-expanded` reset
- [x] Header text contrast across all 14 group colours: minimum 4.67:1 (Audit, Consulting), so AA passes.
- [x] Driving into `trigger_exhibit_a` still opens its panel without stealing focus, and counts 1 / 4 found.
- [x] At 375×812 with the touch pad, the bottom sheet sits clear of the controls (sheet bottom 570 px, highest control
  572 px) and below the Explore button.
- [x] `npm run content:check`, `npm run probe:feel` and `npm run build` pass.
- [ ] Reaching every node *by driving* waits for Phase 4's `area_`/`trigger_` placement.
- [ ] Screen-reader pass (NVDA/VoiceOver) not done; the structure is headings plus buttons plus a labelled region.

## Phase 2 — Camera, floor, shadows, input

- **Iso camera** (`src/camera/isoFollowCamera.js`, now the default):
  - fixed south-east view, 32° pitch, 38.05° azimuth, 40° FOV
  - frame-rate-independent follow (9.75 /s) that tracks only the car's X/Z
  - wheel and pinch zoom between 22.4 and 46.4 m (34.4 m default)
  - optional look-ahead (off, as in the reference)
  - an intro dolly-out while the car drops in (skipped under reduced motion)
  - pulls back only on portrait screens
- **Camera rig:** `cameraRig.js` owns both cameras; C or gamepad Y toggles iso and chase.
- **Floor** (`src/render/floorGradient.js`): world-space four-corner gradient from doc 02 (NW green, NE teal, SE sand,
  SW grey). It fades into the fog past the 135 m boundary. The authored ground keeps its AO bake under the gradient, and
  an outer 4 km plane carries the colour to the horizon. All values are live in `settings.floor`.
- **Prop shadows** (`src/render/blobShadows.js`): one instanced draw for any number of blobs. They are offset along the
  reference's sun direction by height and faded by height and tilt, with no raycasts. The car keeps its raycast blob.
- **Input:**
  - one-shot actions are now per frame and consumed through `input.consume(action)`
  - new keys: Enter/E interact, C camera, M mute, P passport, Esc menu
  - typing in a field, or Space/Enter on a focused button, no longer drives the car
- **Gamepad** (`src/input/gamepad.js`): standard layout with analog throttle, reverse and steer.
- **Touch pad:** rebuilt as a reference-style joystick (point where you want to go, and it drives there relative to the
  camera), plus boost, brake, reverse, interact and respawn buttons. Pinch zooms.
- **Debug (`#debug`):** "Drop 300 test props" (`src/debug/propStress.js`) plus panel folders for the iso camera, floor
  colours and prop blobs.

Acceptance checks (in-app browser, scripted input):
- [x] Camera framing vs doc 07 §2: pitch 32.00°, azimuth 38.05°, FOV 40°, distance 34.40 m (min 22.4, max 46.4) at 4:3.
- [x] C toggles to chase and back without a jump.
- [x] 300 blobs cost 0.0375 ms per frame (300 `set` + `update`, CPU), well under the 0.3 ms budget. The full
  300-prop sync (bodies, instance matrices and blobs) averages 0.085 ms, peaking at 0.6 ms while all 300 fall. Blobs are
  1 draw call. All 300 bodies were asleep about 5 s after landing.
- [x] Touch at 375×812 (emulated mobile): the joystick drives the car along screen up, right, down and left with
  alignment 1.000 at full speed. Reverse reaches −15.7 m/s, boost and brake register, and pinch zooms.
- [x] Feel probe still all within tolerance; `npm run build` passes.
- [ ] Touch on a real phone (emulated only).
- [ ] Gamepad with real hardware (no pad available).
- [ ] Frame rate: the browser pane was throttled to ~21 fps in the background with or without the 300 props, so
  no fps figure is claimed. Re-measure in a foreground browser on the target laptop.

Noticed, not changed: `render/materials.js` patches `#include <output_fragment>`, which three r154+ renamed to
`opaque_fragment`. Its fresnel rim and accent emission have silently been no-ops on r186.

## Phase 1 — Vehicle parity, `arcade2019` preset

- New default vehicle preset `arcade2019` (`src/vehicle/arcadePhysics.js` + `arcadeVehicle.js`): Rapier's
  `DynamicRayCastVehicleController` with the reference's suspension and tyre values and its control model:
  - constant rear-wheel drive with a hard speed cap, and Shift boost
  - Space/Ctrl brake on all four wheels, reverse, and a coast impulse when no pedal is held
  - linear-rate steering, front wheels only
  - auto-flip after 1 s on its side, and the H horn hop
- Values live in `settings.arcade` / `rebuild.arcade` in reference units, scaled by `rebuild.worldScale = 1.6`.
- The original car is kept as the `sim` preset (`src/vehicle/simVehicle.js`, renamed from `vehicle.js`). Select it with
  `?vehicle=sim` or the debug-panel dropdown. `vehicle.js` is now the preset factory.
- Verified that Rapier multiplies suspension force by chassis mass (as cannon does), so stiffness/damping stay unscaled.
- `src/debug/feelProbe.js` checks 19 doc 07 targets plus 2 sanity checks: `npm run probe:feel` in Node, or the
  **Run feel probe** button with `#debug`. All pass within ±5.2% with no tuning; results are in doc 07 §5.
- Visuals:
  - wheels follow the controller (suspension, steer, spin, slide spin)
  - antenna spring with a green placeholder pennant
  - brake and reverse lights
  - the placeholder body is scaled to the arcade chassis
- Input: Space/Ctrl brake, Shift boost, Q handbrake drift (our addition), H horn. Ctrl/Cmd shortcuts are no longer
  swallowed. The touch "H" button became "Brake".
- `R` fades out, respawns at the nearest `spawn_`, and drops the car from 19.2 m (`src/ui/screenFade.js`).
- Physics gravity follows the preset (−20.8 m/s² arcade, −9.81 sim).
- The shadow blob, chase camera FOV boost and shader speed now read the vehicle's own ride height / top speed.

Drive-test checklist (run in the in-app browser with scripted key input):
- [x] car drops in at boot and settles at 0.45 m ride height
- [x] W moves it nose first; cap 15.7 m/s; Shift boost to 31.9 m/s
- [x] Space brakes to a stop; S reverses at 15.9 m/s
- [x] H hops the car; A/D reach full lock (0.534 rad)
- [x] brake lights light up and the antenna tips forward under braking
- [x] R fades, respawns, and lands
- [x] an upside-down car rights itself within ~1.5 s
- [x] `?vehicle=sim` loads with −9.81 gravity, drives, and drifts on Space
- [x] the feel probe passes in the browser (41 ms) and in Node
- [ ] side-by-side feel against the live 2019 site, by a human (not automatable)
- [ ] touch controls on a real phone (the touch pad is reworked in Phase 2)

## Phase 0 — Reference verification

- Cloned folio-2019 (MIT, commit `540f135`) to `../_reference/folio-2019`, outside this repo. Nothing from it is copied here.
- `docs/pursuit-arena/01-reference-analysis.md`: every approximate value checked against source with `file:line`; §7 "Confirmed values" filled in.
  Corrected: chassis mass 40 (not 20), no quadratic throttle ramp, speed cap 9.71 u/s (units/ms in source), brake 1.35, steering 0.015 rad/ms,
  camera pitch 32° (not 45–60°), screen-space floor gradient, no falling intro letters (radial rise reveal instead),
  flip is an off-centre impulse with no speed condition, `R` respawns at the single start point, and the horn makes the car hop.
- New `docs/pursuit-arena/07-feel-targets.md`: 17 vehicle and 10 camera targets in reference units and scaled metres, measured by a headless
  re-run of the reference car, plus the scaling rules (not every value scales by `s`).
- Flagged for later phases: verify Rapier's suspension-force convention first in Phase 1; doc 03's "Airtime > 2 s" badge is unreachable on a 15° ramp.
- No runtime code changed. `npm run build` passes.

Manual checks not done: the live site was not driven side by side (planned for Phase 1).
