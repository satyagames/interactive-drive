# Changelog

Pursuit Arena build log. One entry per phase (see `docs/pursuit-arena/06-phased-prompts.md`).

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
