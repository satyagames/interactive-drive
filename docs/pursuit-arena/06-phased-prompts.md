# 06 — Phased build prompts for Claude Code

## How to run
1. Open the repo folder (`D:\Deloitte\Projects\interactive-drive`) in Claude Code. `CLAUDE.md` loads automatically and imports `AGENTS.md`.
2. **Model**: `/model opus` (Claude Opus 5.5, `claude-opus-5-5`) for Phases 0, 1, 2, 4, 6 and 10, which involve physics feel, architecture and procedural Blender work. Sonnet 5.5 (`/model sonnet`) is fine for Phases 3, 5, 7, 8 and 9 if you want faster and cheaper runs.
3. Start each phase in **plan mode** (Shift+Tab). Paste the phase prompt, review the plan, then let it execute.
4. Commit after each phase on a branch: `git checkout -b arena/phase-N`.
5. Blender 5.2.x must be on `PATH` (or set `BLENDER_BIN` in `.env.local`) for Phases 4 and 10.

---

## MASTER PROMPT (paste once at the start of a fresh session)
```
You are a senior Three.js/WebGL engineer, game-feel designer, Blender technical artist, and UX/IxD lead.
We are turning this repo's driving prototype into "Pursuit Arena", the 10-year anniversary world of the
Deloitte USI Pursuits COE. Read CLAUDE.md, AGENTS.md, README.md, docs/blender-conventions.md, and every file in
docs/pursuit-arena/ plus content/arena.seed.json. Then:
1) Summarise the current architecture in 15 lines, citing files.
2) List contradictions or gaps between the docs and the code.
3) Propose the exact file/module changes for Phases 0–11 in docs/pursuit-arena/06-phased-prompts.md, with risks.
Do not write code yet. Wait for "go phase 0".
```

---

## Phase 0: Reference verification (Opus)
```
Goal: verify docs/pursuit-arena/01-reference-analysis.md.
- Clone https://github.com/brunosimon/folio-2019 into ../_reference/folio-2019 (OUTSIDE this repo) and read
  its LICENSE. Study the car physics, controls, camera, floor, shadows, areas, sounds and reveal code.
- Fill in §7 "Confirmed values" with exact values and file references. Correct any (≈) values that were wrong.
- Write docs/pursuit-arena/07-feel-targets.md with measurable targets: time 0→max speed, 0→max with boost,
  stopping distance, turning circle at low and high speed, airtime of a standard ramp jump, and the camera angle/FOV/distance.
  Express them in reference units and in our scaled metres.
Do not copy any code or assets from the reference into this repo.
Acceptance: the doc is updated and every number has a source line.
```

## Phase 1: Vehicle parity, "arcade2019" preset (Opus)
```
Implement vehicle preset 'arcade2019' alongside the existing model (now 'sim'), selected by
settings.vehicle.preset in src/config.js.
- Use Rapier's DynamicRayCastVehicleController (world.createVehicleController) for 1:1 mapping of the
  reference parameters: suspension stiffness/rest length/travel, damping relaxation/compression, friction slip,
  roll influence, and max suspension force. Scale them by rebuild.worldScale (default 1.6, see doc 01 §6).
- Implement the control model in doc 01 §2.2 exactly: quadratic accel ramp, soft speed cap, Shift boost,
  Space brake, reverse-after-stop, steering rate and max, front steer only, auto-flip after 1 s upside-down,
  R = reset to the nearest spawn_ with a fade, H = horn event.
- Wheel visuals follow the controller's wheel transforms; slide → custom wheel spin.
- An antenna spring-damper with a "10" pennant placeholder; brake-light emissive toggle.
- All values live in config.js and are exposed in lil-gui. Keep the fixed-timestep physics.
- Add src/debug/feelProbe.js: an automated run (gated by #debug) that measures the doc 07 feel targets and prints a pass/fail table.
Acceptance: feelProbe passes within ±10%; a side-by-side manual drive against the live site feels the same; npm run build passes.
```

## Phase 2: Camera, floor, shadows, input (Opus)
```
- Add camera/isoFollowCamera.js (default): fixed world yaw, high angle, narrow FOV, eased follow, slight
  velocity look-ahead, wheel/pinch zoom with clamps, intro dolly. C toggles to the existing chase camera.
- Add render/floorGradient.js: a 4-corner gradient floor (colours from doc 02 §2) that fades to fog at the boundary.
- Generalise render/shadowBlob.js into instanced blobs for N bodies (fixed sun offset, height fade).
- Input: add gamepad, the Enter/E interact key, the M/P/Esc/C keys, and update the touch pad (joystick + boost/brake/interact).
Acceptance: the camera framing matches doc 07; 300 blobs cost under 0.3 ms; touch works on a phone.
```

## Phase 3: Content model and IA (Sonnet OK)
```
- Promote content/arena.seed.json to the runtime content source (keep projects.json loading for back-compat or migrate it).
- Write a JSON schema (content/arena.schema.json) and validate it at dev start-up.
- Build content/panel.js v2 as described in doc 05 §5: drawer/bottom sheet, district colour header, sub-team roles, gallery, links, and a placeholder badge for status=placeholder.
- Build the Explore-mode menu from the same tree (doc 05 §6), with camera fly-to.
Acceptance: every IA node in doc 05 §6 is reachable both by driving (once Phase 4 lands) and from Explore mode; keyboard-only works.
```

## Phase 4: Blender arena blockout (Opus, needs Blender)
```
Follow docs/pursuit-arena/04-blender-pipeline.md.
- Write blender/scripts/gen_kit.py and gen_district_<id>.py so the whole arena in doc 02 is generated
  procedurally as a greybox with correct names (collision_, dyn_, inst_, area_, trigger_, collect_, spawn_, sfx_, decal_),
  at the coordinates in doc 02 §2 and with the objects in §3.
- Extend world/world.js to load per-district GLBs (stream outer-ring districts after the first frame) and to handle the
  new prefixes. dyn_ → Rapier dynamic compound bodies with mass/friction/restitution from custom props, sleeping enabled.
- Write blender/scripts/validate.py and wire it into an npm script `npm run art:validate`.
Acceptance: the whole map is drivable; every area_ opens the right content; the triangle and draw-call budgets are reported and met.
```

## Phase 5: Dynamic props and interactions (Sonnet OK)
```
- Implement the intro sequence: letters + "10" fall in, the car drops, the camera dolly runs (doc 02 §3.0).
- world/areas.js: ring-fill areas with the ENTER hint (doc 05 §4).
- world/reveal.js: per-district reveal choreography on first approach.
- All district dynamic playgrounds from doc 02 §3 (bar-chart blocks, coins, bulbs on springs, tyre stacks, pins, the red-tape wall, balloons).
- Sleep and wake tuning; a per-district physics budget of at most 60 awake bodies.
Acceptance: 60 fps with all props awake in one district on a mid laptop.
```

## Phase 6: Gamification (Opus)
```
Implement doc 03 in full: Passport, XP/ranks, collectibles (instanced + magnet), Deadline Dash with checkpoint
chain, compass and medals, the 8 mini-games, achievements, easter eggs, skins, and localStorage persistence with
reset. Expose an event bus (game/events.js) so VFX/SFX/UI subscribe instead of being called directly.
Acceptance: a scripted test (#debug) can award every badge; progress survives a reload; Reset works.
```

## Phase 7: VFX (Sonnet OK)
```
Implement every effect in doc 05 §2 as pooled, instanced systems under src/vfx/, driven by game/events.js.
Add selective bloom for emissive layers only. Honour prefers-reduced-motion and quality tiers.
Acceptance: the VFX total is under 1 ms per frame (benchmark.js); no GC spikes over 2 ms during a 5-minute drive.
```

## Phase 8: SFX and music (Sonnet OK)
```
Build src/audio/ (Web Audio): mixer buses, engine layers, tyre/landing, material-class impacts with rate limiting,
positional ambiences from sfx_ empties, adaptive music stems, UI sounds, and the mute toggle. Until real assets arrive,
generate placeholder SFX procedurally (oscillators/noise) and list every needed file in public/audio/MANIFEST.md
with its intended licence source. Write CREDITS.md.
Acceptance: no audio before the first gesture; the engine responds to speed and throttle; no clipping with 12 voices.
```

## Phase 9: UI/HUD and accessibility (Sonnet OK)
```
Implement doc 05 §5: loader with the "10" fill, Start screen, HUD (passport ring, rank, dots, compass/minimap,
contextual hint, auto-hide), Esc menu, settings, credits, and toasts. WCAG 2.2 AA; aria-live; full keyboard and touch.
Acceptance: Lighthouse accessibility ≥ 95 on the menu screens; works at 360 px width.
```

## Phase 10: Art pass, the cart, and performance (Opus, needs Blender)
```
- Model the anniversary cart (doc 04 §5) and replace the placeholder vehicle; re-verify that the nose leads.
- Upgrade the greybox landmarks per doc 02 to final low-poly art within the doc 04 budgets; bevel, bake AO, KTX2.
- Extend the matcap palette (brand-green, gold, glass, paper, red-tape) in tools/generate-matcaps.mjs.
- Add a quality tiers pass (Low: no bloom, fxaa, half-res blobs; High: smaa, bloom, full VFX).
Acceptance: first load under 10 MB, 60 fps on the target laptop, under 150 draw calls in the busiest view.
```

## Phase 11: QA and ship
```
- Write docs/pursuit-arena/QA-checklist.md and run it: every IA node, every badge, all inputs, Chrome/Edge/Safari/Firefox,
  iOS/Android, reduced motion, offline run of share/ zip.
- Run npm run package:share; update the README (controls, content editing guide for the Pursuits team).
- A content-editing guide: how a non-developer updates arena.json (birthdays, events, what's new) without touching code.
Acceptance: the checklist is all green, or the remaining issues are listed with owners.
```

---

## Content the Pursuits team must supply (blocking for release, not for build)
- Approved Deloitte logo/brand assets and font files; a confirmed colour palette.
- Vineet K. Arora's welcome message plus an approved photo.
- Names, roles and photos per sub-team (with consent); the 10-year timeline milestones with real years.
- Content for every pillar station (events, intelligent update, R&R winners, birthdays feed, service awards, Chronicles, Insider Scoop, L&D metrics/links, toolkit guides, site contact).
- Confirmation of what "PACE" stands for and its tagline; the Israel Catalyst Team description.
