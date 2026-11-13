# 08 — Reference deep dive: every small feature of the 2019 site (plus what the 2025 site adds)

Source: `brunosimon/folio-2019` (MIT, three 0.164, cannon 0.6, Howler, GSAP) and `brunosimon/folio-2025`
(MIT, three 0.183 WebGPU + TSL, Rapier 0.17), both read in full on 2026-10-28.
This doc describes **techniques and tuning numbers**, not code. Never copy code or assets from either repo (CLAUDE.md rule 1).
"Ours" shows the status in this repo at commit `b053a12`: ✅ done, 🟡 partial, ❌ missing.

## A. 2019: the micro-feature catalogue

### A1. Vehicle and physics (Z-up, reference units)
| # | Feature | Detail | Ours |
|---|---|---|---|
| 1 | World | gravity −13; sleep allowed; default contact friction 0, restitution 0.2 | ✅ |
| 2 | Contact materials | floor↔prop friction 0.05 / rest 0.3; prop↔prop 0.5 / 0.3; floor↔wheel 0.3 / 0 (props *slide* on the floor and *grip* each other, which is why piles collapse so satisfyingly) | 🟡 verify per pair in `dynamicProps.js` |
| 3 | Chassis | box 1.02 × 1.16 × 2.03, shape offset +0.41 up, **mass 40**; never sleeps; spawns 12 u high, asleep, and **drops in when you press Start** | ✅ |
| 4 | Wheels | r 0.25, stiffness 50, rest 0.1, travel 0.3, relax 1.8, compress 1.5, slip 10, roll 0.01; **rear-wheel drive** | ✅ (doc 07) |
| 5 | Throttle | gated by a speed cap (≈ 9.7 u/s, boost ≈ 19.4 u/s); reverse uses the same gate | ✅ |
| 6 | Coast drag | with no throttle input, an impulse opposite to travel of 0.1·|v| per step, which gives the long silky roll-out | ✅ |
| 7 | Steering | rate-limited (≈ 3 frames to full lock), max π·0.17, self-centres at the same rate | ✅ |
| 8 | Touch steering | the joystick gives a **world direction**, and the car steers toward that heading (not left/right) | 🟡 verify `touch.js` |
| 9 | Hop / flip | impulse up, applied 0.1 u off-centre so it also rights the car; auto-flip after 1 s past 60° tilt, 1 s cooldown | ✅ |
| 10 | Car-hit sound | only on impact with **static** bodies, scaled by normal impact velocity | 🟡 |

### A2. Car presentation
| # | Feature | Detail | Ours |
|---|---|---|---|
| 11 | Antenna | spring driven by the car's **local acceleration** (lags on launch, whips on braking) | ✅ |
| 12 | Back lights | separate brake and reverse meshes toggled by input | ✅ |
| 13 | Screech | plays when local forward acceleration spikes, with a 5 s cooldown so it stays special | ❌ |
| 14 | Horn ("klaxon") | sound plus hop | ✅ |
| 15 | Shooting ball | debug toy: fire a ball from the car | ❌ (optional) |
| 16 | Alternate body | config swap to a second vehicle model | ✅ (skins) |

### A3. Camera
| # | Feature | Detail | Ours |
|---|---|---|---|
| 17 | Lens | FOV 40, near 1, **far 80** (a short far plane keeps depth precision high) | 🟡 check the far plane |
| 18 | Angle | fixed direction vector, never rotates with the car | ✅ |
| 19 | **Zone angles** | entering the projects zone tweens the camera to a steeper, more top-down angle over 2 s (power1.inOut), so boards on the floor read better; leaving restores it | ❌ |
| 20 | Follow | exponential easing 0.15 per frame; follows x/y only (not jumps) | ✅ |
| 21 | Zoom | wheel/pinch over a range, eased 0.1 | ✅ |
| 22 | **Pan** | drag on the floor (raycast) to look around; any drive key snaps back | ❌ |

### A4. Rendering and look (the "secret sauce")
| # | Feature | Detail | Ours |
|---|---|---|---|
| 23 | Floor | not a lit plane: a **screen-space background** with 4 corner colours (warm oranges), so the ground colour is always perfectly even | 🟡 ours is a world-space gradient |
| 24 | Matcaps | 8 hand-made matcaps (white, orange, green, brown, grey, beige, red, black) plus "pure" unlit colours | ✅ 13 generated |
| 25 | **Indirect bounce** | the matcap shader mixes in a warm floor-bounce colour on down-facing surfaces near the ground (strength by height falloff × facing angle). This is what makes objects feel *sat in* a warm world | ❌ |
| 26 | Baked floor shadows | per-object contact-shadow textures under static objects, tinted the **same warm colour** (never grey) | 🟡 ours bake AO; tint check |
| 27 | Dynamic blob shadows | per prop; offset along a fixed sun vector by height; alpha = ((maxD − h)/maxD)² with maxD 3; extra fade by orientation | ✅ |
| 28 | **Tilt-shift** | separable 9-tap blur whose strength is 1 − sin(π·y): sharp centre band, soft top and bottom, which makes the world feel miniature. Off on touch; fades to 0 in the projects zone | ❌ |
| 29 | **Radial glow** | a full-screen pass mixing a pale pink toward the upper-centre of the frame (alpha 0.55, radius 0.7), like a soft sky haze | ❌ |
| 30 | Pixel ratio | forced to 2 (desktop crispness over speed) | 🟡 ours caps at 1.5 |
| 31 | **Reveal** | the matcap shader has a reveal progress (0 → 1 over 3 s); floor shadows and blob alpha fade in afterwards with staggered delays | 🟡 ours drops props in; no shader reveal |
| 32 | Static merge | all static meshes merged per material at load | ✅ |

### A5. World authoring and interaction
| # | Feature | Detail | Ours |
|---|---|---|---|
| 33 | Name-driven parsing | the prefix of a mesh name picks its material (`shade…`, `pure…`, `floor…`); collision shapes come from children | ✅ (our prefixes) |
| 34 | Area | a floor border with progress, plus a **vertical gradient "fence"** that pops up (0 → 0.5 u with back.out(2)) when you interact, plus "ENTER" key labels drawn in the world | 🟡 no fence pop, HTML hint |
| 35 | **Tiles** | stepping-stone paving along paths, with random model choice and position and rotation jitter, so paths look hand-laid | ❌ |
| 36 | Walls | brick walls with per-brick jitter; a **reset area** rebuilds them | 🟡 check reset |
| 37 | Bowling | pins plus ball with a reset area | ✅ (Strike a Win) |
| 38 | Project boards | images fade in as you approach (power4.inOut, 1 s); a floor area opens the link | 🟡 |
| 39 | In-world labels | instructions are textured quads on the floor that fade in during the reveal | 🟡 |
| 40 | Start screen | is *in the world*: a "loading" label on the floor becomes "start" | ❌ ours is an HTML overlay |
| 41 | Konami | in-world label hint; triggers a rain of objects | ✅ |
| 42 | Promo popup | a Yes/No dialog with playful hover states (for his course) | n/a |

### A6. Audio
| # | Feature | Detail | Ours |
|---|---|---|---|
| 43 | Engine | single sample; "progress" = |speed|·2.5 + max(accel, 0)·0.4, eased up 0.3 and down 0.15; rate 0.4–1.4, volume 0.4–1 | 🟡 procedural synth |
| 44 | Impact table | per sound: minimum repeat delay, minimum velocity, velocity multiplier, volume and rate ranges (e.g. brick: 100 ms, v ≥ 1, ×0.75, vol 0.2–0.85, rate 0.5–0.75). **Rate randomisation is what stops repetition** | 🟡 |
| 45 | Mute | `M`; auto-mute when the tab is hidden | ✅ |

## B. What the 2025 site adds (the "AAA" step up, same author)
| Technique | What it does | Why it matters for us |
|---|---|---|
| WebGPURenderer + TSL everywhere | one shader source, WebGPU with WebGL2 fallback | matches our project instructions |
| **Custom lit "default" material** (TSL) | a real directional sun with a shadow map, a **core shadow** (N·L), a **cast shadow**, a **light-bounce** colour from below, and a **tinted shadow colour** (shadow = base × shadowColor, never black) | the single biggest look upgrade over flat matcaps: objects get form *and* stay stylised |
| Palette texture colouring | merged meshes pick colours by UV from a tiny palette strip | 1 material, many colours, about 1 draw call per district |
| Single sun shadow map | 2048 (high) / 512 (low) | fits "≤ 1 shadow light" |
| Bloom on threshold 1, strength 0.25 | only true emissives glow | clean, not hazy |
| Cheap DOF | blur by screen height (tilt-shift successor) | miniature feel |
| Narrower camera | FOV 25 | more "diorama", less distortion |
| Terrain painted in Blender | colour/grass/water masks from textures | no flat floor |
| **Grass** | about 78k single-triangle blades in one mesh, looped around the camera, wind-driven, and **pushed down by the car via a tracks render-target** | life and motion everywhere |
| Foliage | SDF leaf cards on instanced trees; **leaves near the car shrink** so the path stays visible | readable *and* lush |
| Wind | one global uniform field shared by grass, leaves, wind lines | cohesion |
| Day cycle presets | day / dusk / night / dawn: light colour, intensity, shadow colour, reveal colour | mood and anniversary night finale |
| Weather | rain, snow (accumulates), leaves, lightning | optional delight |
| Reveal ring | a coloured ring expands from the start to reveal the world | a signature opening |
| Spatial audio | layered vehicle (springs, hydraulics, engine, tyres, boost, horn), ambient beds, single UI click with rate variation | polish |
| Quality tiers | DOF/water blur off and smaller shadows on mobile | budget safety |

## C. Three.js Journey: which lessons map to our upgrade
Only the curriculum titles are public (87 lessons, 116 h). Treat these as study references for the team, not content to copy.
| Our need | Lessons |
|---|---|
| WebGPU/TSL migration, node materials | WebGPU & TSL 1–8 (Fundamentals), 13 Instances |
| Stylised world look | WebGPU 20 **Stylized Nature Scene**, 21 Snow; Three.js 44 Procedural Terrain |
| Baked Blender scene | 49–52 **Portal Scene** (create, bake, export, import/optimise, details) |
| Realistic/tone mapping/env | 24 Environment map, 25 Realistic render |
| Post-processing | 45 Post-processing; WebGPU 11 Post-processing |
| VFX | 34 Fireworks, 33 Hologram (Submission Portal), WebGPU 14 Magic Explosions, 15 Sprites, 41 GPGPU Flow Field Particles |
| Toon/stylised shading | 35 Lights Shading, 37 Halftone Shading |
| Loading and HTML overlay | 47 Intro and loading progress, 48 Mixing HTML and WebGL |
| Performance | 46 Performance tips |
| Physics and game | 20 Physics, 65 Physics, 66 Create a game |
