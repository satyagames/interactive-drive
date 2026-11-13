# Progress

## Done
- Phases 0–11 (mechanics parity, arena, gamification, VFX, SFX, UI, art pass, QA): see CHANGELOG.md.
- Look-dev prompt pack written (docs/pursuit-arena/08–10); LD phases not started.
- 2026-11-12: 2D PursuitArena content imported (backup in docs/content-backup/, runtime in content/arena.seed.json,
  public/content/site, public/content/docs). content:check OK (43 nodes, 23 placeholder); build OK.

## Next
1. Pursuits team confirms rosters (`docs/content-backup/data/people.csv`) → add confirmed ids to `CONFIRMED_TEAMS` → re-run import.
2. Birthdays/service-anniversary feeds; Decade Drive Years 1–10; Israel Catalyst roster.
3. Layer 2 content-driven 3D (docs/content-backup/10-3d-integration-plan.md §2, phase LD-C).
4. LD0–LD11 look-dev.

## Known issues
- 17 colleagues unassigned to a team; Consulting Services has only 1 identified member.
- Birthday/service names exist only inside banner images in the export (not imported).
- `_to_delete/` holds 3 temporary PNGs and a build-check zip from the import session: safe to delete.
