# 07 — Feel targets

Measurable targets for Phase 1 (`src/debug/feelProbe.js`) and Phase 2 (camera). Every number has a source:

- **src** = read directly from folio-2019 (commit `540f135`); see doc 01 §7 for `File.js:line`.
- **probe** = measured by a headless re-run of the reference car (cannon 0.6.2, the reference's own
  parameters and per-frame control logic, fixed 60 Hz, flat floor). The probe script lived in the
  session scratchpad and is **not** part of this repo; to reproduce it, rebuild the car from doc 01 §2
  and run the manoeuvres below.
- **derived** = calculated from src values (formula given).

The live site was not driven for this phase; the source plus the probe stand in for it. Phase 1 still
does the side-by-side drive.

Pass band for `feelProbe`: **±10%** unless stated otherwise.

## 1. Vehicle targets

| # | Target | Reference units | Ours (s = 1.6) | Source |
|---|---|---|---|---|
| V1 | Top speed, throttle held (steady) | 9.93 u/s (cap 9.71) | 15.9 m/s (57 km/h) | probe / src |
| V2 | 0 → 90% of cap | 0.65 s, 2.94 u | 0.65 s, 4.70 m | probe |
| V3 | 0 → 99% of cap | 0.72 s, 3.57 u | 0.72 s, 5.70 m | probe |
| V4 | Top speed, boost (steady) | 19.53 u/s (cap 19.41) | 31.3 m/s (113 km/h) | probe / src |
| V5 | 0 → 90% of boost cap | 0.75 s, 6.83 u | 0.75 s, 10.9 m | probe |
| V6 | Braking (Space) from V1 to stop | 1.12 s, 5.33 u | 1.12 s, 8.5 m | probe |
| V7 | Braking from V4 to stop | 2.10 s, 18.7 u | 2.10 s, 30.0 m | probe |
| V8 | Coast (no input) from V1: half speed / stop | 4.33 s / 32.9 s, 60.6 u | 4.33 s / 32.9 s, 96.9 m | probe (±15%: long tail) |
| V9 | Reverse top speed | 9.74 u/s | 15.6 m/s | probe |
| V10 | Steering: centre → full lock | 3 frames (≈ 36–50 ms), 30.6° | same | derived: 0.534 / (0.015 × 16.7) |
| V11 | Turning radius at full lock, 50% speed | 2.06 u (yaw 137°/s) | 3.30 m (137°/s) | probe |
| V12 | Turning radius at full lock, top speed | 2.17 u (yaw 256°/s) | 3.47 m (256°/s) | probe |
| V13 | Turning radius at full lock, boost top speed | 9.22 u (yaw 120°/s, rear slides) | 14.8 m (120°/s) | probe |
| V14 | Horn hop: Δv / airtime / apex | 3.75 u/s / 0.52 s / 0.51 u | 6.0 m/s / 0.52 s / 0.81 m | src / probe |
| V15 | Ramp jump, 15° ramp at V1 / at V4 (ballistic) | 0.39 s / 0.77 s airtime | same times | derived: t = 2·v·sin θ / g |
| V16 | Ride height (body origin above floor at rest) | 0.284 u | 0.454 m | probe |
| V17 | Auto-flip: tilt threshold / wait / cooldown | > 60° / 1.0 s / 1.0 s | same | src |

Notes:
- V1/V4: the cap is a hard gate, so the steady speed sits 1–2% above it. Match the gate, not the overshoot.
- V8 depends entirely on the per-step coast impulse (`0.1·|v|` per step, mass 40 → 0.25% speed loss per step).
  Rapier's own rolling friction must be ≈ 0 for this to match.
- V13: at boost the rear axle exceeds friction slip and the car slides wide. That slide **is** the drift
  feel. Phase 1 must reproduce it rather than tune it away.
- V15: the reference has no authored ramps; the 15° ramp is our standard (doc 02 §3.5). With g scaled by s,
  airtimes are scale-invariant. **Doc 03's "Airtime: more than 2 s" achievement is unreachable** on a 15° ramp
  even at boost (0.77 s); 2 s needs a ~42° launch at boost speed. Proposed: change the badge to "more than 1 s"
  and build one steep boost ramp, or keep 2 s with a dedicated launch pad. Decide in Phase 6.

## 2. Camera targets

| # | Target | Reference | Ours (s = 1.6) | Source |
|---|---|---|---|---|
| C1 | Vertical FOV | 40° | 40° | src |
| C2 | Pitch (down from horizontal) | 32.0° | 32.0° | derived: atan(1.15 / hypot(1.135, 1.45)) |
| C3 | Azimuth of the camera from the car | 38° east of due south (camera SE of car, looking NW) | same, in our −Z-north frame | derived: atan(1.135 / 1.45) |
| C4 | Distance: default / min / max | 21.5 / 14 / 29 u | 34.4 / 22.4 / 46.4 m | src |
| C5 | Follow easing | 0.15 per frame | 1 − e^(−9.75·dt) | derived: −60·ln(0.85) |
| C6 | Zoom easing; wheel step | 0.1 per frame; `deltaY × 0.001` of the zoom range | 1 − e^(−6.32·dt); same | src / derived |
| C7 | Follow target | car x/z only; target height stays on the floor | same (do not follow jumps vertically) | src |
| C8 | Rotation with car | none, ever | none in `isoFollow` | src |
| C9 | Look-ahead | none | optional ≤ 10% of distance, off by default | src (ours is an addition) |
| C10 | Car on screen (16:9, default zoom) | frame spans 15.6 u vertically at the target (2·21.5·tan 20°); the 2.03 u car covers ~7% (pointing up-screen, foreshortened by the 32° pitch) to ~13% (side-on) | same ratios | derived |

Framing check for Phase 2: at default zoom and 16:9, the frame is about 27.8 u wide at the target, i.e. ±14 u
either side of the car (±22 m ours). HQ to the 62 m inner ring is therefore about 1.4 screen-widths, which is fine
for wayfinding but means district landmarks must read from off-screen distances (signposts, floor typography).

## 3. Scaling rules (reference → ours)

With lengths scaled by `s` and time unchanged:

| Quantity | Scale | Examples |
|---|---|---|
| Length | × s | chassis, wheel radius/offsets, rest length, travel, drop height, camera distance, shadow fade height |
| Speed | × s | speed caps, horn Δv |
| Acceleration | × s | gravity |
| Mass | × 1 (chosen) | keep car 40 and prop masses as in the reference, so impact ratios match |
| Force, impulse | × s (at equal mass) | engine force, brake, max suspension force, flip/horn impulses |
| Time, rate, angle | × 1 | steer rate, steer max, easing rates, flip delay, airtimes |
| Suspension stiffness, damping | × 1 | cannon multiplies both by chassis mass, so units are 1/s² and 1/s |
| Friction slip, roll influence, restitution | × 1 | dimensionless |

**Phase 1 risk:** the scaling of stiffness/damping assumes Rapier's `DynamicRayCastVehicleController` also multiplies
suspension force by chassis mass, as cannon does. Its compiled wasm can't be inspected here, so Phase 1 must
check it first. Settle the car at rest and compare the compressed lengths against the probe (front 0.045 u,
rear 0.025 u, × s). If they differ, convert stiffness to an absolute value (k × m) before tuning anything else.

## 4. How `feelProbe` should run each target (Phase 1)
1. Flat-floor test scene, car spawned at rest; settle 3 s.
2. V1–V5: hold throttle (and boost) for 10 s; log time and distance at 50/90/99% of the cap and the steady speed.
3. V6–V8: from the steady speed, brake (or release) until speed < 0.05·s; log time and distance.
4. V9: hold reverse 5 s; V11–V13: hold throttle with a speed governor plus full right lock for 4 s, measure yaw rate and speed after 1 s, radius = v/ω.
5. V14: apply the horn impulse; airtime = time with no wheel in contact.
6. Print a pass/fail table against the "Ours" column.

## 5. Phase 1 results (`npm run probe:feel`)

The Rapier implementation (`src/vehicle/arcadePhysics.js`) passes every target **using the scaled reference values as
they are**; no fudge factors were needed. Suspension convention verified first: Rapier also multiplies spring and damper
force by chassis mass (compressed lengths identical at 40 kg and 400 kg; 0.048/0.028 u vs cannon's 0.045/0.025 u).

| # | Expected | Measured | Error |
|---|---|---|---|
| V1 top speed | 15.89 m/s | 15.54 | −2.2% |
| V2 0→90% time / distance | 0.65 s / 4.70 m | 0.667 / 4.95 | +2.6% / +5.2% |
| V3 0→99% time | 0.72 s | 0.733 | +1.9% |
| V4 boost top speed | 31.25 m/s | 31.10 | −0.5% |
| V5 0→90% boost time / distance | 0.75 s / 10.93 m | 0.767 / 11.41 | +2.2% / +4.4% |
| V6 brake from V1 time / distance | 1.12 s / 8.53 m | 1.117 / 8.13 | −0.3% / −4.7% |
| V7 brake from V4 time / distance | 2.10 s / 29.92 m | 2.05 / 29.57 | −2.4% / −1.2% |
| V8 coast half-time / distance | 4.33 s / 96.96 m | 4.35 / 96.31 | +0.5% / −0.7% |
| V9 reverse top speed | 15.58 m/s | 15.59 | 0.0% |
| V11 / V12 / V13 full-lock radius | 3.30 / 3.47 / 14.75 m | 3.31 / 3.30 / 14.78 | +0.3% / −4.9% / +0.2% |
| V14 hop airtime | 0.52 s | 0.517 | −0.6% |
| V16 ride height | 0.454 m | 0.458 | +0.7% |

Sanity rows also pass: forward input moves the car towards −Z (nose first), and positive steer yaws left.
Not covered by the probe: V10 (by construction, same rate code) and V15 (derived, no ramp in the test scene).
Rapier exposes no `rollInfluence` setter; with the centre of mass pinned at the body origin the radii above match
without it.
