# 02 — Story and arena map

## 1. The story: "Ten Years. One Arena. Every Win Has a Story."
**Premise.** Every pursuit starts as an RFP and ends as a submission. Over ten years the USI Pursuits COE
has run thousands of these journeys, and the Pursuit Arena is the city those journeys built.
The visitor is a **Pursuit Runner** driving the COE's anniversary cart, a small green toy racer with a
"10" pennant on its antenna. The cart is carrying a fresh RFP.

**Narrative arc (mirrors the pursuit lifecycle):**
| Beat | Pursuit stage | In the arena |
|---|---|---|
| 1. The brief lands | RFP received | Intro: the giant letters **P-U-R-S-U-I-T  A-R-E-N-A** and a golden **"10"** fall from the sky at the **RFP Gate**. The cart drops in. A floor hint reads "Drive to begin". |
| 2. Know the history | Qualify | The **Decade Drive** (timeline highway): 10 arches, Year 1 → Year 10, each with a milestone board on the floor and a golden Decade Dot |
| 3. Meet the leader | Win strategy | **Pursuits HQ / Command Tower** at the centre, with the welcome from Vineet K. Arora, SVP and USI Pursuits COE Lead |
| 4. Assemble the team | Solutioning | Six **Team Territories** on the inner ring, one per team |
| 5. Build the bid | Write, design, review | Five **Pillar Districts** on the outer ring: Innovation, R&R, Culture, L&D, Toolkit |
| 6. Submit and celebrate | Submission → win | **Deadline Dash** ends at the **Submission Portal** in HQ. Completing the Passport fires the **Decade Fireworks** over the tower. |

**Tone.** Celebratory, proud and playful, but credible. Think "corporate anniversary meets toy-box city":
clean low-poly shapes, matcap shading, Deloitte green accents, and humour that comes from bid life
(deadlines, red tape, version_final_FINAL_v7).

## 2. Arena layout (top view; game space, metres, −Z = north)
The arena is a 12-point **starburst** that echoes an anniversary badge. Six team territories sit on the
inner ring at 30°, 90°, … 330°. Five pillar districts plus the RFP Gate sit on the outer ring at 0°, 60°, … 300°.
Formula: `x = R·sin θ`, `z = −R·cos θ` (θ is clockwise from north).

```
                         [INNOVATION LAB]  (0,-105)
          [CULTURE                                    [R&R
           COMMONS] (-91,-52)                          ARENA] (91,-52)
                   [AUDIT]                  [TAX]
                   (-31,-54)    ┌───────┐   (31,-54)
      [ISRAEL                   │  HQ   │                 [CONSULTING
       CATALYST] (-62,0) ───────│ TOWER │──────── (62,0)   SKYLINE]
                                │ "10"  │
                   [PURSUIT     └───┬───┘   [PACE
                    STUDIO]         │        SPEEDWAY]
                   (-31,54)    DECADE DRIVE  (31,54)
          [TOOLKIT                  │                 [L&D
           DEPOT] (-91,52)          │                  CAMPUS] (91,52)
                              [RFP GATE / SPAWN] (0,105)
```

| Ring | Radius | Contents |
|---|---|---|
| HQ plaza | 0–22 m | Command Tower, the "10" monument, the Submission Portal |
| **Deadline Loop** (ring road) | 38–44 m | 6 m-wide road with spokes to every district |
| Inner ring | R = 62 m | 6 team territories, each about 30 m across |
| **Outer Loop** (ring road) | 82–88 m | |
| Outer ring | R = 105 m | 5 pillar districts plus the RFP Gate, each about 36 m across |
| Boundary | 135 m | soft boundary: low hedge "berm" plus invisible wall; beyond it the floor gradient fades into fog |

The floor gradient corners are NW deep green `#0B3D2E`, NE teal `#0D5B5F`, SE warm sand `#E9E2D0`, and
SW cool grey `#DADFE3`. The gradient subtly tells you where you are on the map.

Signposts at every spoke junction are fingerposts with district names, and they are physics-knockable.

## 3. Districts: concept, structures and objects
Legend: **S** = static (collider, no body), **D** = dynamic (rigid body, sleeps), **A** = Enter area (opens a content panel),
**C** = collectible, **K** = kinematic/animated.

### 3.0 RFP Gate (spawn, 180°)
- **S** Gate arch shaped as a giant paper RFP document curling into an arch. **S** "Start" podium.
- **D** Intro letters `PURSUIT ARENA` (each letter is a box-compound body of about 2.5 m), golden **"10"** (heavier, about 3 m).
- **A** "How to drive" floor board (keys drawn on the floor in the reference's style).
- **A** "Deadline Dash" start pad (time trial).

### 3.1 Decade Drive (180° spoke)
- **S** 10 arches; each arch carries a year label (`Year 1 … Year 10`, with real years supplied by the team).
- **A** Floor milestone board under each arch (image plus caption from `arena.seed.json → timeline`).
- **C** One **Golden Decade Dot** under each arch (10 total).
- **D** Traffic cones in "10" formation at Year 10.

### 3.2 Pursuits HQ: the Command Tower (centre)
- **S** Tower: a stepped, rounded glass-and-white tower with a green "dot" beacon on top (an original form, not Deloitte's building). About 28 m tall; LOD0 ≤ 6k tris.
- **S** The **"10" Monument**: giant 1 and 0 on the plaza; the 0 is a drivable ring ramp loop (a low torus you can drive *through*).
- **A** **Leadership Balcony**: "Vineet K. Arora — Senior Vice President, USI Pursuits COE Lead". The panel shows his welcome note (text and photo supplied and approved by him) plus the COE org overview (links to all 6 territories).
- **A/K** **Submission Portal**: a glowing green gate that ends the Deadline Dash. Its rings rotate.
- **D** Plaza props: café chairs, planters, a stack of "Final_v7" boxes.

### 3.3 Team territories (inner ring)
Each territory has a **Gateway** (district sign plus a stamp station area), one **landmark**, **sub-team pods**
(one per role: Managers / Designers / Researchers) and a themed **dynamic playground**.

| θ | Territory | Landmark (S) | Sub-team pods (A) | Dynamic props (D) | Signature interaction |
|---|---|---|---|---|---|
| 330° | **Audit: "Assurance Citadel"** | Stacked-ledger towers with a giant magnifying-glass sculpture | Audit Managers: "Control Room"; Audit Designers: "Chart Works" (giant bar-chart blocks); Audit Researchers: "Insight Library" (book towers and a telescope) | Bar-chart blocks, binder stacks, ✓ tick cones | **Chart Stack**: knock all bar-chart blocks over → "Variance Found!" badge |
| 30° | **Tax: "Tax Terrace"** | Calculator-key buildings plus a coin-stack tower | Tax Managers: "Compliance Court"; Tax Designers: "Form Factory" | Coin stacks (cylinders), paper-plane forms, "%" signs | **Coin Run**: collect 25 coins in a lane under 20 s |
| 90° | **Consulting Services: "Consulting Skyline"** | Interlocking gears plus a flowchart bridge you drive over | Consulting Services Designers: "Blueprint Studio" | Lightbulbs (hang on springs), gear wheels that roll, sticky-note cubes | **Idea Spark**: hit all 5 bulbs → they light and bloom |
| 150° | **PACE: "PACE Speedway"** | Mini oval track with pace-car tower and chequered flags | PACE Managers: "Pit Wall"; PACE Designers: "Livery Lab" | Tyre stacks, flag poles (spring), cones | **Pace Lap**: one-lap timed run with ghost of best lap |
| 210° | **Pursuit Studio: "The Studio"** | Giant pencil obelisk plus colour-swatch fan wall and an easel | Pursuit Studio Designers: "Layout Grid" (floor drawn as a page grid) | Paint cans, giant crayons/pencils, picture frames | **Paint Trail**: driving here leaves a fading Deloitte-green tyre-paint trail |
| 270° | **Israel Catalyst Team: "Catalyst Bridge"** | Arched bridge plus a globe with arcing "connection" lines; twin clocks showing IST and Israel time (live) | Israel Catalyst Team pod | Globe-ball (big sphere), luggage cases | **Bridge Run**: jump the bridge gap for an "Across Time Zones" badge |

Rule: no religious or political symbols. Catalyst Bridge's theme is collaboration across geographies.

### 3.4 Pillar districts (outer ring)
| θ | District | Landmark (S) | Content stations (A) | Dynamic / play |
|---|---|---|---|---|
| 0° | **Innovation Lab** | Glass dome with orbiting rings (K) | 1 Upcoming events & activities ("Events Billboard", a rotating calendar cube); 2 The intelligent update (a news-ticker LED wall); 3 Behind the scenes ("Backstage" curtain stage); 4 Calling all Proposal ninjas ("Ninja Dojo") | **Ninja Dojo**: 8 hidden shuriken around the whole arena; find them all to unlock "Proposal Ninja" and a ninja-mask skin on the cart |
| 60° | **R&R Arena** | Trophy stadium with a giant trophy | 1 ApplauD ("Applause Wall", clapping-hands panels, K); 2 Reward and Excellence (podium 1-2-3); 3 Bright Star Awards (star sculptures that light up) | **Strike a Win** bowling: 10 trophy-shaped pins and a big ball; strike → confetti and "Bright Strike" badge |
| 120° | **L&D Campus** | Open-book amphitheatre plus graduation-cap pavilion | 1 What we did (gallery board); 2 What's new (fresh-print kiosk); 3 Metrics & useful links (bar-chart garden plus link kiosk) | Stack of learning blocks (Jenga-like), soccer-ball "knowledge ball" |
| 240° | **Toolkit Depot** | Giant toolbox building, lid open | 1 Time reporting guidance (clock tower); 2 Proposal writing guide (giant notebook); 3 Quick links (signpost forest); 4 Site contact (phone-booth kiosk) | **Red Tape Wall**: brick wall of red boxes; smash through for the "Red Tape Cutter" badge; plus toolboxes and spanners |
| 300° | **Culture Commons** | Park with a bandstand and a string-light canopy | 1 Birthdays (cake carousel; today's birthdays from JSON fire a confetti cannon); 2 Service awards (milestone pillars 5/10/15/20 yrs); 3 Deloitte Chronicles (newspaper-stand kiosk); 4 Insider Scoop (ice-cream cart, opens **Photo Mode**) | Beach balls, party balloons (buoyant, K), picnic crates |

### 3.5 Between districts (fillers that sell the world)
- Road furniture **D**: cones, barriers, fingerposts, benches, bins.
- Trees **S** (instanced, 3 variants), shrubs, lamp posts (**S**; light up at dusk if the time-of-day option is on).
- **C** 100 green Deloitte-style dots scattered along racing lines, plus 10 Golden Decade Dots and 8 shuriken.
- Ramps **S**: 4 jump ramps on the Outer Loop and 1 loop-the-0 on the HQ plaza.
- Floor typography (S, decals): district names painted on the ground at large scale (the reference's signature style).

## 4. Static vs dynamic object master list (for asset planning)
| Category | Count (approx.) | Physics | Draw strategy |
|---|---|---|---|
| District landmarks | 12 | S (compound boxes) | unique meshes, merged per district |
| Pods/kiosks | ~30 | S | kit-bashed from 6 kiosk modules |
| Intro letters + "10" | 14 | D (compound) | unique, low-poly extruded type (licensed font → mesh) |
| Props (cones, binders, coins, pins, bricks…) | ~400 | D (box/cyl/sphere) | `InstancedMesh` per type + instanced blob shadows |
| Trees/lamps/benches | ~300 | S (cylinder) or D (benches) | instanced |
| Collectibles | 118 | sensor (trigger only) | instanced + sparkle shader |
| Floor boards/decals | ~40 | none | one atlas (KTX2), quads |
