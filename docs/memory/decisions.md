# Decisions (ADR log)

## 2026-10-28 — UI may use Svelte 5 + Tailwind v4
Approved by the project owner. Planned in docs/pursuit-arena/10 (LD1 tooling, LD10 migration). Not yet implemented.

## 2026-10-28 — Art shading is custom TSL, not PBR-bound
Approved by the project owner. Custom "ArenaShade" model planned in LD2. Not yet implemented.

## 2026-11-12 — 2D site content imported by a re-runnable tool, not by hand
`tools/site-export/import_site_export.py` reads the Zoomforth export and rewrites station copy, rosters, metrics,
links, images and PDFs in `content/arena.seed.json`, plus a Markdown/JSON backup in `docs/content-backup/`. Why: the
export has 1,526 records and the team will keep updating; a script keeps the arena and the backup in sync.

## 2026-11-12 — Team membership is inferred, shown only at high/medium confidence
The export lacks section membership. Assignments in `tools/site-export/teams.py` cite evidence; team stations stay
`placeholder` until a team id is added to `CONFIRMED_TEAMS`. Why: never present a guess as fact (CLAUDE.md rule 3).

## 2026-11-12 — Privacy: no emails or bio details in the runtime; email-bearing backup files git-ignored
Bio PDFs hold birth dates, family, hometown and phone numbers, so only role keywords are read and nothing is copied.
The repo remote is a personal GitHub; `02-people-directory.md` and `data/people.*` are git-ignored by default.

## 2026-11-13 — Layer 2 exhibits are runtime-built from content, not Blender-baked
Exhibits (`src/showcase/`) are generated in Three.js at district load from `exhibits` in the seed, with layout in
`rebuild.showcase` (district-local frames matching `_common.py Frame`). Why: the data changes (counts, rosters,
issues) must reshape the world without an art rebuild. Only Percy and the blobs are Blender-generated
(`art:mascots`), since they are characters, not data.

## 2026-11-13 — Exhibit data is generated, with its own schema
`npm run content:exhibits` writes `exhibits` from `docs/content-backup/data`, duplicating some numbers that also
appear in station bodies. Why: one generator from one backup keeps both in step; the importer machine path is not
available here. Hand edits are overwritten by a re-run (documented in the content-editing guide).

## 2026-11-13 — Names on the gateway walls before consent is confirmed
The walls show exactly the roster names and designations the Layer 1 panels already show, and say "Roster awaiting
confirmation" while stations are placeholder. Consent (`people.csv → show_in_arena_consent`) is still open
(doc 10 §5); if any person declines, removing them from the station roles removes them from both. Album photos are
shown as already imported in Layer 1 (same §5 caveat).

## 2026-11-13 — Covers are designed title cards, atlases are canvas, not KTX2
No PDF renderer or KTX2 encoder is available in this environment; covers and labels are drawn into canvas atlases
at runtime (no network, no new assets). Revisit when the importer can render PDF page 1.

## 2026-11-12 — Station links may point to bundled PDFs
Schema link pattern now also allows `content/docs/*.pdf`; content-check verifies the file exists. Panel body uses
`white-space: pre-line` so imported paragraphs and metric lines keep their breaks.

## 2026-11-13 — Render interpolation instead of variable-step physics
Keep the deterministic fixed step (feel probe, parity) and blend visuals by `step.alpha`. Why: the reference's
smoothness came from per-frame stepping; interpolation gives the same smoothness without changing the physics.

## 2026-11-13 — Reference depth post (tilt-shift + glow), DPR cap unchanged
Own GLSL ShaderPasses in the current EffectComposer (the WebGPU/TSL port is still planned in LD1). Tilt-shift off
on touch and on the low tier. DPR stays 1.5: the measured AA cost at 2x still exceeds the frame budget.

## 2026-11-13 — Speed cap tapers instead of gating
A deliberate departure from the reference to remove top-speed surging; top speed within 2%, probe green.

## 2026-11-13 — Rosters: show everyone, mark low confidence
Hiding low-confidence people made teams look empty. All 103 are shown; low-confidence placements say "team to confirm".
