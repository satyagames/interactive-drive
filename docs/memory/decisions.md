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

## 2026-11-12 — Station links may point to bundled PDFs
Schema link pattern now also allows `content/docs/*.pdf`; content-check verifies the file exists. Panel body uses
`white-space: pre-line` so imported paragraphs and metric lines keep their breaks.
