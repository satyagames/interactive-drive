# Changelog

Pursuit Arena build log. One entry per phase (see `docs/pursuit-arena/06-phased-prompts.md`).

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
