# Progress

## Done
- Phases 0–11 (mechanics parity, arena, gamification, VFX, SFX, UI, art pass, QA): see CHANGELOG.md.
- Look-dev prompt pack written (docs/pursuit-arena/08–10); LD phases not started.
- 2026-11-12: 2D PursuitArena content imported (backup in docs/content-backup/, runtime in content/arena.seed.json,
  public/content/site, public/content/docs). content:check OK (43 nodes, 23 placeholder); build OK.

- 2026-11-13: **LD-C (Layer 2) done**, commits LD-C 1–9: Percy + 5 buddies, HQ wins board, People of Pursuits
  walls, R&R trophies + BrightStar, Memory Lane, newsstand, L&D garden, Toolkit signposts, champion plates, 5 exhibit
  badges. Badge test 22/22 from a clean store; probe:feel, content:check, build green.

### LD-C measurements (2026-11-13, dev server, 800×600 canvas, this dev machine's GPU, not the 2020 iGPU)
Camera on the default iso rig, car 4 m inside each gateway (HQ: by the wins board), all districts streamed.
Scene render only (no post); GPU = EXT_disjoint_timer_query, mean of 20 renders. "Base" = same view, exhibits hidden.

| View | Draw calls | Base | Added | Triangles | Added tris | GPU ms | GPU ms base |
|---|---:|---:|---:|---:|---:|---:|---:|
| rfp_gate | 84 | 72 | 12 | 65.9k | 5.5k | 1.24 | 0.75 |
| hq | 105 | 83 | 22 | 96.9k | 28.8k | 0.60 | 0.31 |
| audit | 102 | 81 | 21 | 92.7k | 29.1k | 0.68 | 0.87 |
| tax | 107 | 86 | 21 | 91.5k | 29.0k | 0.64 | 0.62 |
| consulting | 134 | 105 | 29 | 99.5k | 29.5k | 0.74 | 0.72 |
| pace | 136 | 107 | 29 | 104.2k | 29.1k | 0.76 | 0.74 |
| studio | 111 | 90 | 21 | 95.9k | 29.0k | 0.68 | 0.66 |
| catalyst | 108 | 88 | 20 | 93.8k | 28.7k | 0.65 | 0.64 |
| innovation | 114 | 92 | 22 | 98.6k | 29.1k | 0.79 | 0.64 |
| rnr | 122 | 87 | 35 | 98.3k | 34.0k | 0.83 | 0.53 |
| culture | 113 | 93 | 20 | 98.4k | 29.7k | 0.57 | 0.55 |
| lnd | 142 | 116 | 26 | 102.8k | 29.3k | 0.74 | 0.72 |
| toolkit | 115 | 95 | 20 | 95.9k | 29.1k | 0.50 | 0.49 |

~15 of the added calls and ~25k of the triangles are everywhere: the mascot batches (10), champion plates (2) and
the trophy batches (3; prop batches are never culled; 117 × ~150 tris). The plan's "≤ 25 added" holds except R&R
(35: trays, stars, labels on top of the constant 15). GPU differences are within noise at this resolution.
The rfp_gate row was taken before R&R was revealed (trophies not yet visible).

- 2026-11-13 (later): rosters v2 (all 103 shown), label z-fighting fixed, render interpolation, exact camera
  follow, tilt-shift + glow passes, speed-cap taper, drag-to-pan, zone camera angles, wider zoom. probe:feel 19/19,
  content:check, build green. Verified headless: flicker heatmaps, interpolation (CV 1.225 → 0), pan return.

- 2026-11-13: **R0 (doc 11) done**: baseline, 45-feature audit (doc 08 §A: 22 done, 17 partial, 5 missing, 1 n/a),
  `src/debug/navTest.js`. No feature changes.

### R0 baseline (2026-11-13, commit `56875d8`)
- `probe:feel` 19/19 (V1 −1.9%, V4 −0.3%, V12 −5.0%, **V13 −6.5%**: inside ±10% but it was +0.2% in doc 07 §5,
  so the boost slide tightened after the speed-cap taper), `content:check` OK (43 nodes, 23 placeholder),
  `build` OK (JS 3,921.95 kB, gzip 1,419.50 kB; after R0 3,921.98 kB: navTest is dev-only).
- **Debug → Run nav test** (dev builds only; also `await __proto.navTest()`): 34 checks, about 4 s; a repeat run gave the same pass/fail
  on every row. 31 pass, 3 fail:

| Check | Result | Limit | |
|---|---|---|---|
| A1 car speed variation, uneven 144 Hz (CV) | 0.000 | < 0.01 | pass |
| A2 camera frame-to-frame jitter | 0.0003 | < 0.01 | pass |
| A3 control, interpolation off (CV) | 1.235 | > 0.1 | pass |
| B1 drag moves the view | 9.3 m | > 1 | pass |
| B2 grabbed point under the pointer | 0.001 m | < 0.2 | pass |
| B3 idle 3 s keeps the pan | 0.008 m | < 0.05 | pass |
| B4 driving returns a 9 m pan | 1.17 s | < 1.5 | pass |
| B5 driving returns an 82 m pan | 1.79 s | < 1.5 | **fail** |
| B6 `F` re-centres | 9.5 m left | < 0.25 | **fail** |
| B7 / B8 Explore focus lands, then returns with no pan | 0.00 / 0.00 m | < 0.3 | pass |
| B9 arena limit (150 m) | 150.0 m | ≤ 150.2 | pass |
| C pitch in/out: Decade Drive, HQ, Memory Lane | worst 22.3 / 9.6 / 15.9 °/s | ≤ 23.6 / 10.1 / 16.8 | pass (6) |
| D flicker at 11 gateways, 3 zone views, start (default zoom / zoomed out) | 0 / 0 blocks | 0 | pass (14) |
| D Decade Drive zone view, zoomed out | 13–18 blocks | 0 | **fail** |
| D control: label depth offsets removed | 2 of 15 views flicker | ≥ 1 | pass |

### R0 gap list (for R1 unless marked)
1. **`F` does not re-centre.** `recenter` is in `KEY_MAP` but not in `EDGE_ACTIONS` (`input/keyboard.js:36`), so
   `input.consume('recenter')` is never true. The README and controls table promise it.
2. **Long pans return slowly**: the return is a plain exponential (`pan.returnRate` 3.5), so 82 m takes 1.79 s.
3. **Coplanar art in PACE flickers when zoomed out**: an ivory and a dark static surface both sit at y = 0.040 near
   world (28, 57) (the PACE oval, `gen_district.py --id pace`); seen from the Decade Drive zone at max zoom. Not a
   label, so the atlas depth offset does not help. Fix in the generator.
4. **Depth range**: camera near 0.1 / far 1000 (`core/renderer.js:25`) against the reference's 1 / 80. At the 65 m
   overview a depth step is about 2.5 mm; this is the root of 3 and of the earlier label flicker.
5. **Zone `zoom` is dead config**: `isoCamera.zones[].zoom` is declared and documented but never read.
6. **Tilt-shift does not fade inside zones** (doc 08 #28; R1 item).
7. **Teleports that bypass `vehicle.respawn`** (`debug/gameTest.js place`, any `body.setTranslation`) still blend
   from the old pose for one frame: `hasPrev` is only cleared in `respawn`. Props guard by distance (5 m) instead.
8. Pan has no "back to car" control, no cursor change beyond the CSS class, no keyboard or gamepad path, and
   pointer capture is not wrapped in try/catch (`touch.js` does this for a reason).
9. Not audited in R0 (need hands or devices): pan starting on HUD, minimap or joystick; pinch against pan on a
   real touch screen; chase-camera mode with interpolation; Dash countdown hold; tab hidden / visible.
10. Still missing from the reference (R2–R5): tyre screech, engine progress model, per-class impact table, area
    fence and floor key label, reset pads, board approach fade, paving tiles, in-world start, warm bounce, shader
    reveal. See doc 08 §A.

## Next
1. Pursuits team confirms rosters (`docs/content-backup/data/people.csv`) → add confirmed ids to `CONFIRMED_TEAMS` → re-run import.
2. Birthdays/service-anniversary feeds; Decade Drive Years 1–10; Israel Catalyst roster.
3. Layer 2 leftovers: Leadership balcony (needs consent for photos), Studio follow-the-sun clock, Research
   library, applauD wall + applause SFX, Chronicles kiosk ticker, Scoop cart, design-library shelf, Toolkit PDF
   binders, issue covers rendered from the PDFs (needs a PDF renderer in the import), split-flap SFX. Re-measure on a
   2020 iGPU laptop; re-run the 101-position draw-call sweep; hand-drive a lap and check touch + 360 px.
4. LD0–LD11 look-dev.

## Known issues
- 9 colleagues placed with low confidence ("team to confirm"); the Israel Catalyst roster (3) is inferred from creation order.
- Birthday/service names exist only inside banner images in the export (not imported).
- `_to_delete/` holds temporary PNGs, superseded script copies and build-check zips: safe to delete.
- Not yet from the reference: tyre screech SFX, area "fence" pop-up, paving tiles along paths, in-world start label, warm indirect bounce in the matcap shader.
