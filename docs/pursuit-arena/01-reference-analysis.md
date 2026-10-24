# 01 — Reference analysis: 2019.bruno-simon.com

> Purpose: give Claude Code a precise target for *feel* and *mechanics*.
> **Verified in Phase 0** against the open-source folio-2019 repository (MIT licence, commit
> `540f135`, cloned to `../_reference/folio-2019`, outside this repo) and a headless re-run of its car
> at 60 Hz. Source references are written `File.js:line` relative to `folio-2019/src/javascript/`.
> Nothing from that repository (code, models, textures, sounds, images, fonts or text) is copied here;
> only numbers and behaviour descriptions are recorded. Corrections against the original memory-based
> draft are marked **(corrected)**. Measurable targets derived from these values live in
> `07-feel-targets.md`.

## 1. Tech anatomy of the reference
| Layer | Reference (2019) | Our equivalent |
|---|---|---|
| Renderer | Three.js, one perspective camera, matcap materials, no real-time lights, pixel ratio fixed at 2, black clear colour (`Application.js:90-92`) | Three r186, matcaps (already in `render/materials.js`) |
| Physics | cannon.js world, `RaycastVehicle`, Z-up, gravity −13 (`Physics.js:37`). **(corrected)** One cannon step per rendered frame with a variable `dt` = frame delta, clamped to 60 ms (`Physics.js:30`, `Utils/Time.js`) | Rapier 0.20, Y-up, fixed 1/60 s step. Use `world.createVehicleController()`. Identical to the reference at 60 Hz; deliberately more stable above 60 Hz |
| Floor | **(corrected)** Not a world plane. A clip-space quad drawn at the far plane (`shaders/floor/vertex.glsl`) samples a 2×2 texture of four corner colours (`Floor.js:19-51`), so the gradient is **screen-space** and never changes with position. Physics floor is an infinite plane (`Physics.js:90-101`) | `render/floorGradient.js` (new). Our doc 02 asks for a **world-space** gradient that hints at map position — a deliberate divergence, kept |
| Shadows | Per-object rounded-rectangle alpha quads on the floor plane (no raycast), offset along a fixed sun vector by the object's height, faded by height and by tilt (`Shadows.js:61-97`, `shaders/shadow/fragment.glsl`) | generalise `render/shadowBlob.js` into instanced blobs |
| Scene assembly | Blender objects split by **naming convention**: per-object `base` (visual) + `collision` scenes whose children named `cube*`/`box*`, `cylinder*`, `sphere*`, `center*` become compound shapes (`Physics.js:681-693`). Static (mass 0) objects are merged (`Objects.js:270`) | our `collision_` / `spawn_` / `trigger_` / new `dyn_` / `area_` prefixes |
| Areas | **(corrected)** Axis-aligned rectangles only (`Area.js:284`). Driving in raises a fence and pops an "ENTER" key label; `F`, `E` or `Enter`, or a click/tap on the area, interacts (`Area.js:302`, `Areas.js`). No fill-progress timer, no hold-to-activate | `world/areas.js` (new); our fill/hold behaviour (doc 05 §4) is an addition |
| Sections | intro (letters + instructions), crossroads, projects (boards), information, playground (bowling, brick walls), four "distinction" sections | our districts (see doc 02) |
| Reveal | **(corrected)** A single radial wave at start: matcap vertex shader sinks geometry 3.2 units below the floor by distance from the origin and lifts it out over 3 s (`shaders/matcap/vertex.glsl:59-67`, `World/index.js:90-94`). Letters do **not** fall from the sky; they are pre-placed sleeping dynamic bodies. Only the car drops in, from z = 12 (`World/index.js:105-111`) | `world/reveal.js` (new). Our per-district drop/bounce reveal (doc 05 §2) is an addition |
| Sound | Howler sample sets; one engine loop whose rate/volume follow speed and throttle; impacts chosen by impact velocity with a per-sound minimum delay (`Sounds.js`) | `audio/` module (new, Web Audio) |
| Debug | `#debug` URL hash opens dat.GUI (`Application.js:48`); `#cybertruck` swaps the car model | ours: lil-gui (keep), also gated by `#debug` |

## 2. Vehicle mechanics to replicate (the "feel")
The 2019 car is a toy RC car: small, light, very responsive, and slightly floaty in the air. It is not a sim.

### 2.1 Body and wheels (verified, reference units; `Physics.js:120-149`)
| Param | Value | Notes |
|---|---|---|
| chassis W × H × D | 1.02 × 1.16 × 2.03 | box collider; shape offset **+0.41 up** from the body origin, so the centre of mass sits low in the box |
| chassis mass | **40** **(corrected, was 20)** | wheel bodies (mass 5) are visual-only and never added to the world |
| wheel radius / width | 0.25 / 0.24 | |
| wheel front / back offset (depth) | 0.635 / −0.475 | wheelbase 1.11 |
| wheel offset (width) | 0.39 | track 0.78; connection points at body-origin height |
| suspension stiffness | 50 | cannon multiplies spring and damper by chassis mass (`RaycastVehicle.updateSuspension`), so units are 1/s² |
| suspension rest length | 0.1 | at rest: front 0.045, rear 0.025 compressed length (probe) |
| max suspension travel | 0.3 | |
| damping relaxation / compression | 1.8 / 1.5 | units 1/s (× mass) |
| friction slip | 10 | dimensionless |
| roll influence | 0.01 | |
| max suspension force | 100000 | never reached |
| custom sliding rotational speed | −30 | wheel spin while sliding with engine force |
| gravity | −13 (`−3.25 × 4`) | |
| contact materials | default friction 0 / restitution 0.2; floor–prop 0.05 / 0.3; prop–prop 0.5 / 0.3 (`Physics.js:40-87`) | |

### 2.2 Controls (verified; `Physics.js:435-585`, `Controls.js:50-132`)
Control values are set once per rendered frame before the step; `speed` is measured in **units per millisecond** in `postStep`.
- **Throttle** `W`/`↑`: **(corrected)** constant engine force `17 × 16 = 272` per rear wheel (rear-wheel drive). `controlsAcceleratingQuad` is declared but never read, so there is **no** quadratic ramp.
- **Speed cap**: drive force is cut while `speed ≥ 0.055 × 3 / 17 = 0.009706` units/ms (**9.71 units/s**) **(corrected)**. It is a hard on/off gate, so the car hovers just above the cap (measured 9.93 u/s).
- **Boost** `Shift`: engine force `17 × 28 = 476`, cap `0.11 × 3 / 17` = **19.41 units/s**.
- **Brake** `Space` or `Ctrl`: **(corrected)** `setBrake(0.45 × 3 = 1.35)` on all four wheels.
- **Reverse** `S`/`↓`: same force and cap backwards. Pressing it while rolling forward applies the reverse force (it decelerates, then reverses); it is not a separate brake.
- **Coasting** (neither up nor down held): an impulse of `0.1 × |v|` against the direction of travel is applied every step (`Physics.js:416-429`). Brakes are off.
- **Steering** `A`/`D`: **(corrected)** linear rate `0.005 × 3 = 0.015` rad per ms, so full lock is reached in 3 frames (~36 ms); max `π × 0.17` = 0.534 rad (30.6°); returns to centre at the same rate. Front wheels only.
- **Sliding**: cannon's `useCustomSlidingRotationalSpeed` spins a sliding, driven wheel at −30 rad/s.
- **Recover** **(corrected)**: when the chassis up axis is tilted more than 60° (`worldUp · Z < 0.5`) for 1 s, an upward impulse of 150 is applied 0.1 units off-centre, which flips it; then a 1 s cooldown (`Physics.js:367-396`, `162-167`). There is no speed condition and no lift-upright-drop.
- **Reset** `R`: destroys and recreates the car at the start point, dropped from z = 12 (`Physics.js:304-309`, `340`). There are no other spawn points.
- **Horn** `H`: plays a horn sound **and makes the car hop** (impulse 150 straight up, at most once per 400 ms) (`Car.js:349-366`). Our two-tone horn should keep the hop.
- **Mute** `M` (`Sounds.js`); `K` rains horn props (easter egg, `Car.js:369`).
- **Mobile** (`Controls.js:139-650`): a joystick that sets an absolute **target heading** (steering is set directly from the angle between joystick and car, offset by 0.18π for the camera yaw), plus boost, forward, brake and backward buttons on the right.

### 2.3 Visual vehicle behaviour (verified; `Car.js`)
- Chassis visual follows the physics body with a −0.28 vertical offset. Wheel visuals follow `updateWheelTransform` (steer plus spin).
- **Antenna spring** (`Car.js:135-186`): a 2D spring driven by chassis acceleration (`speedStrength` 10, `damping` 0.035 per frame, `pullBackStrength` 0.02), mapped to antenna rotation × 0.1. Our car carries a small **"10" pennant** on it.
- Back lights: brake light opacity 0.5 → 1 while braking; reverse light 0.5 → 1 while `down` is held (`Car.js:200-236`). No bloom.
- Car shadow: 3 × 2 blob, `offsetZ` 0.2 (`Car.js:115`); see §4.
- Tyre screech sample when forward acceleration exceeds 0.03 units/frame², at most every 5 s (`Car.js:98`).

## 3. Camera (verified; `Camera.js`, `Application.js:115-123`)
- Perspective camera, **FOV 40°**, near 1, far 80.
- **(corrected)** Fixed offset direction `(1.135, −1.45, 1.15)` (Z-up): the camera sits south-east of the car and looks down at **32°** (not 45–60°). Azimuth is 38° from due south towards east. **It never rotates with the car.**
- Distance = `14 + 15 × zoom`, zoom ∈ [0, 1], default 0.5 → **21.5 units** (range 14–29). Mouse wheel adds `deltaY × 0.001` to the zoom target; pinch maps distance ratio to zoom.
- Target = the car's **x and y only** (the target stays on the floor plane; the camera does not rise with jumps). Easing 0.15 per frame (≈ 9.75 /s at 60 Hz); zoom easing 0.1 per frame; no look-ahead.
- A second angle `(0.38, −1.4, 1.63)` is tweened in (2 s, power1.inOut) in the projects section.
- There is no intro dolly in the reference; the camera starts at its default framing while the car drops in.
- Ours: keep the chase camera as an alternative mode (`C` toggles). `isoFollow` is the default.

## 4. World interaction patterns to reuse
1. **Physics props everywhere**: letters (mass 1.5), bricks (0.5), bowling pins (0.1), bowling ball (1) against a car of mass 40. Props sleep (`sleepSpeedLimit` 0.01) until hit.
2. **Collision-shape authoring in Blender**: each prop has a visual mesh plus primitive collider children (box/cylinder/sphere) and an optional `center` marker. Compound colliders are allowed.
3. **Areas**: a rectangular floor border plus a fence and a key label. `F`/`E`/`Enter` or click → action. Fence rises in 0.35 s (`back.out(3)`), label follows after 0.1 s; interact pulses the fence and fades border alpha 1 → 0.5 over 1.5 s.
4. **Boards projected on the floor**: content images laid flat in the world, read from above.
5. **Playground**: bowling (pins plus ball) and brick walls you can smash.
6. **Reveal choreography**: the radial rise described in §1, plus shadows fading in (alpha 0 → 0.5 over 3 s after 0.5 s) and the engine sound ramping in (0 → 0.7 over 0.5 s after 0.3 s).
7. **Easter eggs**: key-triggered surprises (`EasterEggs.js`).
8. **Minimal HUD**: most information lives *in the world* (floor text, signs), not in UI chrome.

Shadows in detail: sun at `(−2.5, −2.65, 3.75)`, so a blob shifts `(0.667, 0.707)` per unit of height; alpha = global 0.5 × per-object alpha × `((3 − h) / 3)²` × a tilt factor; rounded-rect falloff with a 0.35 UV fade radius and sine-in-out curve.

Sound in detail: each sample set has a minimum delay (0–1000 ms), a minimum impact velocity, and volume `clamp((v − vMin) × k, volMin, volMax)²`, with a random playback rate in `[rateMin, rateMax]` (`Sounds.js:124-330`). The engine is one looping sample: progress = `|speed| × 2.5 + throttle × 0.4` (throttle 0.5, boost 1), eased up 0.3 / down 0.15 per frame, mapped to rate 0.4–1.4 and volume 0.4–1 × 0.7. Master volume 0.5; muted while the tab is hidden.

## 5. Gap analysis against our current codebase
| Area | Current | Change needed |
|---|---|---|
| Vehicle | custom force-based raycast vehicle with realistic forces (5000 N, 34 m/s) | Add an `'arcade2019'` preset (in `rebuild`, because switching rebuilds the body) using Rapier's vehicle controller with the 2.1/2.2 values, scaled per `07-feel-targets.md` §3. Keep the old model as `'sim'` |
| Camera | chase camera behind the car | add `camera/isoFollowCamera.js` as the default and keep the chase camera |
| Shadows | one raycast blob for the car | instanced floor blobs for all dynamic props (no raycasts), car keeps its raycast |
| World loader | `collision_`, `spawn_`, `trigger_` | add `dyn_` (dynamic prop root, with `collision_` children), `area_` (Enter areas), `collect_` (collectible spawn), `sfx_` (ambient emitter) |
| Content | 4 placeholder exhibits | `content/arena.seed.json` → districts → zones → cards |
| Audio | none | new `audio/` system |
| Gamification | "N of 4 found" | passport, collectibles, time trial, achievements |

## 6. Scale decision
The reference car is about 2 units long. Our world is in metres. Set `rebuild.worldScale = 1.6` so the car is about 3.2 m long and toy-like next to 6–20 m buildings. **(corrected)** Not every value scales by `s`: lengths, speeds, accelerations (gravity) and forces/impulses (at equal mass) scale by `s`; times, rates, angles, stiffness (1/s²), damping (1/s) and friction coefficients do not. The full rule set and the scaled numbers are in `07-feel-targets.md` §3. Phase 1 confirms the scale by feel.

## 7. Confirmed values
Reference values are verified against source; "Ours" is `s = 1.6` applied per the rules in doc 07 §3 (Phase 1 will tune and overwrite this column).

| Param | Reference (verified) | Source | Ours (s = 1.6, pre-tune) |
|---|---|---|---|
| gravity | −13 u/s² | `Physics.js:37` | −20.8 m/s² |
| chassis mass | 40 | `Physics.js:125` | 40 (keep; see doc 07 §3) |
| chassis W × H × D | 1.02 × 1.16 × 2.03 | `Physics.js:121-123` | 1.632 × 1.856 × 3.248 m |
| chassis shape offset (up) | 0.41 | `Physics.js:124` | 0.656 m |
| wheel radius / width | 0.25 / 0.24 | `Physics.js:129-130` | 0.40 / 0.384 m |
| wheel front / back offset | 0.635 / −0.475 | `Physics.js:126-127` | 1.016 / −0.76 m |
| wheel half-track | 0.39 | `Physics.js:128` | 0.624 m |
| suspension stiffness | 50 | `Physics.js:131` | 50 (unscaled, ×mass) — verify Rapier convention in Phase 1 |
| suspension rest length | 0.1 | `Physics.js:132` | 0.16 m |
| max suspension travel | 0.3 | `Physics.js:138` | 0.48 m |
| damping relaxation / compression | 1.8 / 1.5 | `Physics.js:134-135` | 1.8 / 1.5 (unscaled) |
| friction slip | 10 | `Physics.js:133` | 10 |
| roll influence | 0.01 | `Physics.js:137` | 0.01 |
| max suspension force | 100000 | `Physics.js:136` | 160000 |
| sliding wheel spin | −30 rad/s | `Physics.js:139` | −30 rad/s |
| engine force (per rear wheel) | 272 / boost 476 | `Physics.js:146-147, 527` | 435.2 / 761.6 N |
| speed cap | 9.706 / boost 19.41 u/s | `Physics.js:144-145` | 15.53 / 31.06 m/s |
| brake (per wheel) | 1.35 | `Physics.js:149` | 2.16 |
| coast impulse per step | 0.1 × \|v\| | `Physics.js:426` | 0.1 × \|v\| (v already in m/s) |
| steer rate / max | 0.015 rad/ms / 0.534 rad | `Physics.js:141-142` | same |
| flip trigger / delay / impulse | tilt > 60° / 1 s / 150 | `Physics.js:372-386` | same / same / 240 |
| horn hop impulse / cooldown | 150 / 400 ms | `Car.js:359-361` | 240 / 400 ms |
| start drop height | 12 | `World/index.js:107` | 19.2 m |
| camera FOV / near / far | 40° / 1 / 80 | `Camera.js:76` | 40° / 1.6 / far set by arena size (≥ 400 m) |
| camera pitch / azimuth | 32.0° / 38° E of S | `Camera.js:45` | same |
| camera distance (min–max, default) | 14–29, 21.5 | `Camera.js:116-120` | 22.4–46.4 m, 34.4 m |
| camera / zoom easing | 0.15 / 0.1 per frame | `Camera.js:22, 115` | 9.75 /s / 6.32 /s (frame-rate independent) |
| shadow sun offset per unit height | (0.667, 0.707) | `Shadows.js:103, 111` | same ratio (dimensionless) |
| shadow fade height / power / alpha | 3 / 2 / 0.5 | `Shadows.js:17-18`, `World/index.js:94` | 4.8 m / 2 / 0.5 |
| car blob size | 3 × 2 | `Car.js:115` | 4.8 × 3.2 m |
| prop masses (letter, brick, pin, ball) | 1.5, 0.5, 0.1, 1 | `IntroSection.js:76`, `PlaygroundSection.js:64, 164, 187` | same ratios to car mass |
| prop sleep speed limit | 0.01 | `Physics.js:651` | 0.016 m/s |
| area interact keys | F / E / Enter, click | `Area.js:302`, `Areas.js` | Enter / E, click/tap (F kept free) |
| reveal wave | 3.2 u deep, radius scale 30, 3 s | `matcap/vertex.glsl:59-67`, `World/index.js:92` | 5.12 m, 48 m, 3 s |
