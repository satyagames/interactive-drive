# 11 — Reference features: finish, harden and verify (Claude Code prompt pack)

Goal: bring every remaining interaction and navigation feature of https://2019.bruno-simon.com/ into Pursuit Arena,
and harden the features added on 2026-11-13 (render interpolation, exact camera follow, tilt-shift + glow, speed-cap
taper, drag-to-pan, zone camera angles, label depth fix, rosters v2), so the build is solid, smooth and easy to
navigate.

## Model and effort
| Phase | Model | Effort | Why |
|---|---|---|---|
| R0–R6 (all build work) | **Claude Fable 5.2** | **High** | Long, multi-step work across physics, camera, shaders, audio, Blender and UI; Fable pulls furthest ahead on exactly this kind of work and catches subtle bugs (interpolation edge cases, input conflicts). |
| R7 (QA, docs) | Fable 5.2 or Opus 5.5 | Medium | Mostly checking and writing. |
| Budget option | Opus 5.5 | High | Anthropic's recommended daily driver; a good fallback if Fable's cost matters. |

Set it with `/model` in Claude Code (pick Fable, then the effort level in the same picker, or `/effort high` if your
version has the command). Raise to **Max** only if a phase skips files, skips tests or does not check its own work.
Start each phase in **plan mode** (Shift+Tab), approve the plan, one phase per session, `/clear` between phases.

---

## MASTER PROMPT (paste first, every session)
```
You are the senior engineer + game-feel designer + technical artist on Pursuit Arena (this repo).
Read, in this order: CLAUDE.md, AGENTS.md, docs/memory/{progress,decisions,learnings}.md, the newest CHANGELOG
entry, docs/pursuit-arena/07-feel-targets.md, docs/pursuit-arena/08-reference-deep-dive.md (feature catalogue and
parity status) and this file (docs/pursuit-arena/11-reference-features-prompt.md).

The reference is brunosimon/folio-2019 (MIT). If ../_reference/folio-2019 does not exist, clone it there (outside
this repo) and read the relevant files for each feature. Learn the technique and the tuning numbers; never copy its
code, shaders, models, textures, sounds or fonts into this repo.

Non-negotiables:
1. Driving feel: `npm run probe:feel` must pass all targets after every phase. Do not retune doc-07 numbers.
2. `npm run content:check` and `npm run build` green after every phase. No console errors or warnings.
3. Budgets: first load unchanged or smaller; draw calls < 100 in a typical view where already met, never worse
   than the LD-C table in docs/memory/progress.md; GPU cost of every new effect measured on high and low tiers.
4. Accessibility: keyboard, mouse, touch and gamepad all work; prefers-reduced-motion respected; every new
   in-world label has an HTML/aria-live mirror; Lighthouse a11y stays 100.
5. All tunables in src/config.js (live in lil-gui under #debug). Game rules in content JSON, not code.
6. Privacy: no colleague emails or bio details in runtime files. Never push to a remote without asking me.
7. One phase per session. Commit per phase with a clear message; update CHANGELOG and docs/memory.

Verification method (headless GPU is slow, so do not judge smoothness in real time):
- Dev bundle with debug hooks: NODE_ENV=development npx vite build --mode development (exposes window.__proto).
- Deterministic stepping: __proto.loop.stop(), then __proto.loop.step(dt) with synthetic uneven 144 Hz deltas.
- Flicker: render 3 frames with 4 mm camera nudges and diff them (z-fighting shows as solid blocks, not edges).
- Screenshots of each feature at three bookmarks, before and after, saved under docs/pursuit-arena/lookdev/R<n>/.
End every phase with: what changed, measurements, what I must check by hand (see the playtest list at the end).
Wait for "go R0".
```

---

## R0 — Baseline and audit (no feature changes)
```
1. Run probe:feel, content:check, build. Record results in docs/memory/progress.md.
2. Re-read docs 08 §A and mark each of the 45 features: done / partial / missing, with file references.
   Confirm the 2026-11-13 items really work: write src/debug/navTest.js (dev only) that checks
   (a) interpolation: car speed coefficient of variation < 0.01 under uneven 144 Hz frames, outside camera zones;
   (b) pan: drag moves the view and the grabbed point stays under the pointer within 0.2 m; idle keeps the pan;
       driving returns it in under 1.5 s; F re-centres; Explore focus clears the pan; the arena limit holds;
   (c) zones: the pitch eases in and out with no snap;
   (d) flicker sweep: the 3-frame diff at every district gateway shows no solid-block regions.
3. Report the gaps. No fixes in this phase.
Acceptance: navTest runs from #debug and prints a pass/fail table; the gap list is in progress.md.
```

## R1 — Harden today's features
```
Fix everything R0 found, then:
- Interpolation edge cases: respawn, reveal drop-ins, prop resets, the Deadline Dash countdown hold, menu pause
  and resume, tab hidden/visible, chase-camera mode. No blending across teleports; no one-frame streaks.
- Pan UX:
  - Must not start on the HUD, panels, the minimap or the touch joystick area.
  - The touch flow is one finger to pan and two to pinch; a touch on the joystick never pans.
  - Grab/grabbing cursors.
  - A small accessible "Back to car" chip shows while panned. It is focusable, Enter activates it, and an
    aria-live message announces it.
  - Double-click or double-tap on the floor re-centres.
- Zone camera: like the reference, fade the tilt-shift blur to 0 inside zones that show boards (Decade Drive,
  Memory Lane, the newsstand), eased with the pitch. Zones live in config.
- Minimap: click or tap a point to pan the view there (the same pan system, clamped to the arena).
- Keyboard map look for accessibility: hold `Alt` + arrow keys to pan (driving keys stay unchanged), plus an
  "Overview" key (`O`) that eases to max zoom over the arena centre and back.
Acceptance: navTest all green; no input conflicts across keyboard, mouse, touch and gamepad; reduced motion makes
pan and zoom transitions instant.
```

## R2 — Reference audio micro-features
```
From folio-2019 Sounds.js / Car.js (techniques only):
- Tyre screech when forward acceleration spikes past the reference threshold, at most once per 5 s; volume by
  slip; also on hard handbrake slides.
- Engine "progress" model: speed × 2.5 + max(acceleration, 0) × 0.4, eased up fast and down slowly, mapped to the
  rate and volume ranges (doc 08 #43). Keep our layered engine; drive it with this progress value.
- Impact table per material class: a minimum repeat delay, a minimum velocity, a velocity multiplier, and
  volume/rate ranges with random rate per hit (this is what stops the repetition). Data in config.
- Auto-mute when the tab is hidden (verify), M toggles.
Acceptance: no clipping at 12 voices; the screech never machine-guns; every value lives in config.
```

## R3 — Interaction areas like the reference
```
- Area "fence": when a station or exhibit area becomes active, a thin vertical gradient ring rises from the floor
  ring (0 → 0.5 m, overshoot ease like back.out(2), 250 ms) and drops on leave. Instanced, one material.
- An in-world key label ("ENTER", or "TAP" on touch) drawn on the floor next to the ring, fading with the area
  state; the existing HTML hint stays as the accessible mirror.
- Reset areas: a small floor pad by the Red Tape Wall and the Strike-a-Win pins that rebuilds them (with the
  same drop-in tween), as in the reference playground.
- Project-board reveal: exhibit images (Memory Lane, newsstand, wins board) fade in as the car approaches
  (power4 in/out, about 1 s).
Acceptance: the area state reads at a glance from the default camera; no extra draw calls beyond one fence batch
and one label batch.
```

## R4 — World dressing and the in-world start
```
- Paving tiles along footpaths (the reference's Tiles): place stepping-stone tiles with weighted random
  variants, position and rotation jitter, and spacing from config. Author the path curves as `path_` empties or
  curves in Blender (blender/scripts), export them as GLB markers, and scatter at runtime into one InstancedMesh
  per variant. Respect the tri budget (≤ 60 tris per tile).
- In-world start: while loading, a floor label at the RFP Gate reads "Loading…" with progress, then becomes
  "Press Enter / Tap to start" (the reference's starting screen). The HTML start button stays for accessibility
  and keyboard focus; both start the game.
Acceptance: paths read as hand-laid from the default camera; first load grows by under 50 KB.
```

## R5 — Shading details from the reference
```
Implement in the current WebGL material path (the TSL port belongs to LD1; if LD1 has already landed, write it in
TSL instead):
- Warm indirect bounce: add a warm floor-bounce colour to down-facing surfaces near the ground (strength = height
  falloff × facing), configurable colour, strength and distance. This is what makes objects sit in a warm world.
- Shadow tint: blob and baked floor shadows multiply towards a warm umber, never neutral grey.
- Reveal shader: a world-space reveal progress (radial from the RFP Gate) that colours the world in during the
  intro, then the blob shadows fade in after it (staggered like the reference).
Acceptance: before/after screenshots at three bookmarks; GPU cost ≤ +0.3 ms high, off or simplified on low.
```

## R6 — Navigation polish and onboarding
```
- First-run onboarding in 3 steps or fewer, skippable: drive → drag the map → press Enter at a ring.
  Teach by doing; each step completes on the action itself.
- The controls table, README and content guide list every new control.
- Gamepad: right stick pans the map (eases back when driving), click the right stick to re-centre.
- Explore mode and the minimap use the same pan/fly system; no conflicting camera states.
Acceptance: a new user can find any district in under 20 s by dragging, the minimap or Explore.
```

## R7 — QA, budgets and docs
```
Run probe:feel, content:check, build, navTest, the flicker sweep and the draw-call sweep. Measure GPU ms per new
effect on high and low. Check reduced motion, touch at 360 px, keyboard-only and gamepad. Update
docs/pursuit-arena/08 (parity table), QA-checklist.md, CHANGELOG, docs/memory/*. List what needs a human playtest.
```

---

## Human playtest checklist (do these yourself after R1 and after R6)
1. Drive a full lap at normal speed and at boost on a 60 Hz and a 120/144 Hz screen. Motion should feel silky, with no stepping.
2. Hold full throttle on a straight: no surging at top speed. Drift at boost: the rear still slides wide.
3. Drag the map in every direction and zoom out fully; drive away and check the view glides back. Try a trackpad and a phone.
4. Stop next to every exhibit: no flickering text. Check the R&R floor labels and the People of Pursuits walls closely.
5. Enter each camera zone (Decade Drive, HQ, Memory Lane): the angle change feels intentional, not nauseating.
6. If anything feels off, tune live under `#debug` (Vehicle/Arcade, Camera, Post → Tilt-shift and Glow), then paste
   the values into src/config.js.
