# Changelog

Pursuit Arena build log. One entry per phase (see `docs/pursuit-arena/06-phased-prompts.md`).

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
