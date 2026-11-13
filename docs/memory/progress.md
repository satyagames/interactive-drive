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
