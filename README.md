# Driving prototype

An original interactive 3D portfolio in the drive-around-and-explore genre
popularised by sites like bruno-simon.com: you drive a small car around an
open lot, and driving into one of a handful of exhibits pops up a card about
that project. Three.js for rendering, Rapier (wasm) for physics, Vite for the
dev server and static build. The world and vehicle are Blender-authored
placeholder shapes (ground, a few exhibit stand-ins, two ramps, a simple
placeholder car), bevelled and matcap-shaded from one designed palette with
baked contact shadows rather than flat-lit — see **Art pipeline**, **Look**
and **Shading** below. See **What's placeholder** for what's real
here versus what's a stand-in for a still-undecided final theme.

## Running it

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # static output in dist/
npm run preview    # serve the built dist/ at http://localhost:4173
npm run serve:dist # same thing, spelled out for anyone just here to demo it
npm run probe:feel # arcade car vs docs/pursuit-arena/07-feel-targets.md (Node, no browser)
npm run content:check # validate content/*.json against their schemas
```

`dist/` is a fully static, self-contained bundle — no CDN scripts, no fonts,
no analytics, no calls out to the internet at all, so it runs the same with
the network off. It still has to be **served over HTTP**, not opened as a
`file://` path — ES modules are blocked on `file://`. Any static file server
works, e.g. `npx serve dist`; `vite.config.js` sets `base: './'`, so it can
live under any sub-path. To hand `dist/` to someone else as a self-contained,
double-click-to-run folder instead of hosting it, see **Sharing without
hosting** below.

## Sharing without hosting

```bash
npm run package:share   # -> share/ and portfolio-share.zip
```

This builds fresh, then packages that build into something a non-technical
recipient can run on their own machine with one double-click — no hosting, no
internet access, and no terminal for them to touch. `dist/` alone isn't quite
that: `index.html` loads its JS as ES modules and fetches the GLTF
models/textures, and browsers refuse both of those from a bare `file://`
page, so *some* local web server is still required. This just makes starting
one the recipient's problem to solve with one click instead of a terminal
command:

- **`share/`** — the built site plus two launcher scripts,
  [`Start Portfolio.command`](scripts/launchers/Start%20Portfolio.command)
  (macOS) and [`Start Portfolio.bat`](scripts/launchers/Start%20Portfolio.bat)
  (Windows). Each one picks a free port, starts a plain local static server
  bound to `127.0.0.1` (`python3 -m http.server`, or `npx serve` if Python
  isn't installed), and opens the portfolio in the default browser once it
  answers. Nothing here talks to the network beyond that localhost port.
- **`portfolio-share.zip`** — `share/` zipped into one file, ready to attach
  to an email or drop in a shared folder. Re-running the command rebuilds
  both from scratch each time, so there's no risk of handing someone a stale
  copy.

**What to tell the recipient:**

1. Unzip `portfolio-share.zip` anywhere.
2. Double-click `Start Portfolio.command` (Mac) or `Start Portfolio.bat`
   (Windows).
3. A terminal/console window opens and the portfolio opens in their browser
   a moment later.
4. To stop it, just close that window.

If neither Python nor Node.js is installed on their machine (rare — Python
ships with every Mac, and both are common on Windows), the launcher prints a
plain-English explanation and a link to install one, instead of a stack trace
or a window that silently closes.

Two platform notes worth passing on if a recipient hits them:

- **macOS Gatekeeper**: a `.command` file downloaded via a browser (email
  attachment, Slack, a download link) gets a quarantine flag, and macOS may
  refuse to open it the first time with an "unidentified developer" warning.
  Right-click (or Control-click) the file and choose **Open** once to clear
  it — after that, double-clicking works normally. This is standard macOS
  behaviour for any downloaded script, not specific to this one.
- **Windows Store Python stub**: on a clean Windows install with no Python
  installed, `python` on `PATH` can resolve to a Microsoft Store placeholder
  instead of a real interpreter. If double-clicking the `.bat` doesn't
  appear to do anything, that's the likely cause — installing real Python
  (or Node.js) from the links the launcher prints fixes it.

## Controls

| | Keyboard | Gamepad (standard layout) | Touch |
|---|---|---|---|
| Accelerate | `W` / `↑` | RT / R2 | push the joystick where you want to go |
| Steer | `A` `D` / `←` `→` | left stick | (the joystick steers towards its direction) |
| Reverse | `S` / `↓` | LT / L2 | ▼ |
| Brake | `Space` / `Ctrl` | B / ○ | ■ |
| Boost | `Shift` | X / □ (hold) | » |
| Handbrake drift | `Q` | RB / R1 | — |
| Horn (the car hops) | `H` | LB / L1 | — |
| Interact | `Enter` / `E` | A / ✕ | ↵ |
| Switch camera (iso / chase) | `C` | Y / △ | — |
| Respawn at the nearest spawn | `R` | View / Share | ⟲ |
| Zoom | mouse wheel | — | pinch |
| Mute · Passport · Menu | `M` · `P` · `Esc` | — · D-pad up · Menu | — |

Interact, mute, passport and menu are wired as input actions but have nothing
to act on until Phases 5–9. In the `sim` preset (`?vehicle=sim`) `Space` keeps
its old handbrake role.

The touch joystick works like the 2019 reference: point it in a screen
direction and the car turns and drives that way, whatever the camera. The touch
pad appears automatically on coarse-pointer devices, and can be forced on for
desktop testing from **Debug → force touch pad** (with `#debug`).

The default **iso** camera is the reference's: fixed south-east view, 32° down,
40° FOV, easing after the car without ever rotating; it opens with a short
dolly-out while the car drops in (skipped under reduced motion).

## Layout

```
index.html            markup for the canvas, HUD and touch pad
vite.config.js
content/
  arena.seed.json     all arena content (see Content)
  ui.json             all interface copy
  *.schema.json       rules for both (npm run content:check)
  projects.json       the prototype world's 4 exhibits (until Phase 4)
blender/
  scene.blend           Blender source: "World" + "Vehicle" collections
  vehicle_details.py    adds the car's lamps + tail lip (idempotent)
  bevel.py              rounds every visible edge, destructively (idempotent)
  bake_ao.py            headless Cycles bake -> public/textures/bake/*.png
  export.py             headless re-export -> public/models/*.glb
                        (those four run in that order -- see Art pipeline)
tools/
  generate-matcaps.mjs  the colour palette + the matcaps it bakes it into
  feel-probe.mjs        npm run probe:feel -- runs src/debug/feelProbe.js in Node
  content-check.mjs     npm run content:check -- schema + image-path checks
scripts/
  package-share.mjs    npm run package:share -> share/ + portfolio-share.zip
  launchers/           the two double-click server+browser launchers it
                        copies into share/ -- see Sharing without hosting
docs/
  blender-conventions.md   naming convention, axis notes, export settings
public/
  models/             world.glb, vehicle.glb (Draco-compressed)
  textures/
    matcaps/          generated matcap spheres (tools/generate-matcaps.mjs)
    bake/             Blender AO + cast-shadow bakes (blender/bake_ao.py)
  draco/              Draco decoder, copied from three's examples/jsm/libs
  content/
    placeholder.svg   stand-in image used by every entry in content/projects.json
src/
  main.js             bootstrap + the per-frame loop; the only file that
                      knows about every other module
  config.js           ALL tunables (see below)
  styles.css
  core/
    renderer.js       WebGLRenderer, scene, camera, resize handling
    physics.js        Rapier wasm init + fixed-timestep accumulator
    loop.js           requestAnimationFrame with a clamped delta
    gltf.js           shared GLTFLoader + DRACOLoader
  render/
    materials.js      matcap material library + the baked-AO shader patch
    sky.js            vertical-gradient sky dome + the scene's distance fog
    shadowBlob.js     raycast contact shadow under the car
    blobShadows.js    instanced floor blobs for props (sun offset, height fade)
    floorGradient.js  world-space 4-corner floor colour + fade into the fog
    post.js           EffectComposer chain (bloom, vignette, output)
  world/
    world.js          loads world.glb, builds colliders from `collision_`
                      nodes, reads out `spawn_`/`trigger_` empties
    triggers.js       logs to console when the vehicle enters a trigger
    lighting.js       a single fallback ambient; matcaps need no lights
  content/
    model.js          arena seed -> one content tree (triggers, Explore, Passport)
    schema.js         small JSON Schema validator (dev + content:check only)
    ui.js             t() / applyUiStrings() for content/ui.json
    panel.js          station panel: drawer / bottom sheet
    explore.js        Explore mode list with camera fly-to
    progress.js       "N of 4 found" tracker behind the HUD indicator
  vehicle/
    vehicle.js        picks the preset (rebuild.vehicle.preset / ?vehicle=)
    arcadePhysics.js  'arcade2019' (default): Rapier vehicle controller + the
                      2019 reference control model, no rendering
    arcadeVehicle.js  its visuals: body, wheels, antenna, brake/reverse lights
    simVehicle.js     'sim': the original force-based raycast vehicle
  ui/
    screenFade.js     full-screen fade that hides respawn teleports
  camera/
    cameraRig.js      owns both cameras, routes to settings.cameraMode (C)
    isoFollowCamera.js  default: the reference's fixed-angle follow + zoom + intro
    chaseCamera.js    alternative: smoothed follow behind the car
  input/
    index.js          merges keyboard, gamepad and touch; per-frame actions
    keyboard.js
    gamepad.js        Gamepad API, standard mapping
    touch.js          joystick + hold/one-shot buttons
  debug/
    gui.js            lil-gui panel bound to config.js
    feelProbe.js      scripted feel test of the arcade car (#debug button)
    propStress.js     #debug: drop 300 physics props to check the blob budget
    physicsDebug.js   collider wireframe overlay
    fps.js            frame-rate readout in the HUD
```

## Where the tunables live

`src/config.js` holds three objects:

- **`settings`** — read live every step, so every value is safe to change from
  the lil-gui panel while driving. Grouped into `vehicle`, `arcade`,
  `suspension`, `body`, `camera` (chase), `cameraMode`, `isoCamera`, `floor`,
  `blobShadows`, `touch`, `gamepad`, `shadow` (car blob), `post`, `render`,
  `debug`.
- **`rebuild`** — structural values (chassis size, wheel positions, mass,
  spawn point, gravity, timestep). Changing these needs a respawn or a reload.
- **`rendering`** — which matcap and which AO bake each object gets, matched
  by object-name prefix. Changing these needs a reload.

The debug panel writes straight into `settings`. **Tuning I/O** can save the
current tune to `localStorage` (restored on the next load), reset to defaults,
or copy the whole thing as JSON to paste back into `config.js` once a feel is
worth keeping.

The panel (lil-gui) only exists with `#debug` in the URL (e.g.
`http://localhost:5173/#debug`), as in the reference; visitors never see it,
and a tune saved from it is only restored in `#debug` too. It opens in the
top-right corner on desktop —
click its **Tuning** title bar to collapse or expand it, or a folder's own
header to fold just that section. On a coarse-pointer (touch) device it
starts collapsed instead, since it would otherwise cover most of the screen;
tap the title bar to open it there too.

## How the vehicle works

There are two presets with the same public API, chosen at load
(`rebuild.vehicle.preset`, or `?vehicle=sim` in the URL; the debug panel has a
dropdown).

**`arcade2019` (default)** reproduces the feel of Bruno Simon's 2019 folio car
(numbers verified from its source in `docs/pursuit-arena/01-reference-analysis.md`).
It is Rapier's `DynamicRayCastVehicleController` with the reference's suspension
and tyre values, driven by its control model: constant rear-wheel drive force
that cuts out at a hard speed cap, Shift boost, all-wheel brake, a coast impulse
when no pedal is held, linear-rate steering, an off-centre kick that rights the
car after 1 s on its side, and a horn hop. All values in `settings.arcade` /
`rebuild.arcade` are in reference units and scaled by `rebuild.worldScale`
(1.6) per the rules in `docs/pursuit-arena/07-feel-targets.md` §3, which is also
what `npm run probe:feel` checks against (all within ±5% today).

**`sim`** is the original model, described below.

One dynamic box rigid body for the chassis. Each of the four wheels casts a ray
straight down from its anchor every physics step; a wheel that hits something
contributes three forces at the contact point:

1. **Suspension** — a spring/damper along the chassis up axis.
2. **Lateral grip** — an impulse cancelling sideways slip.
3. **Traction** — engine, brake and rolling drag along the wheel's forward axis.

Both tyre forces are clamped by a friction circle scaled by that wheel's own
suspension load, so an unloaded wheel (airborne, or the inside wheel of a hard
corner) simply stops gripping. An anti-roll bar flattens the car in corners, and
a self-righting torque applies while all four wheels are off the ground.

## Content

All copy lives in `content/`, never in code:

- **`arena.seed.json`** — the whole arena: HQ and its leader block, the RFP
  Gate, the 10-year timeline, six team territories, five pillar districts, their
  stations, feeds and gamification numbers. Anything with
  `"status": "placeholder"` shows a visible **Content coming soon** tag until the
  USI Pursuits COE team supplies it.
- **`ui.json`** — every interface string (HUD, panel, Explore menu, touch
  labels). Markup picks them up through `data-ui*` attributes.
- **`*.schema.json`** — the rules for both. `npm run content:check` validates
  them (and checks that every image exists in `public/`); `npm run dev` does the
  same in the console on start-up. Neither ships in the production build.

`src/content/model.js` turns the seed into one tree, used in three places:
`trigger_<id>` volumes in the world, the **Explore** menu (`Esc` or the
Explore button — every district and station as a keyboard-navigable list that
flies the camera there and opens it), and later the Passport. The station
panel (`src/content/panel.js`) is a right-hand drawer, or a bottom sheet on
narrow screens; it never pauses driving, and closes with its button, by
driving out of the trigger, or with `Esc`.

The prototype world's four `trigger_exhibit_*` volumes still open the
placeholder entries in `content/projects.json` (and drive the "N / 4 found"
counter) until the Phase 4 arena replaces that world.

## Art pipeline

World and vehicle geometry now load from Blender-authored, Draco-compressed
GLTF (`public/models/{world,vehicle}.glb`), sourced from
`blender/scene.blend`. The shapes are still placeholder -- the same boxes,
cylinder, ramps and wedge-pod car as the original blockout -- but they are no
longer *finished* like a blockout: every visible edge carries a few
centimetres of bevel and the whole scene is painted from one designed palette.
See **Look** below.

Rebuilding the art from the .blend is four headless passes, in this order:

```bash
blender --background blender/scene.blend --python blender/vehicle_details.py
blender --background blender/scene.blend --python blender/bevel.py
blender --background blender/scene.blend --python blender/bake_ao.py
blender --background blender/scene.blend --python blender/export.py
```

The first two are idempotent and only need re-running when the geometry
changes; the last two always run as a pair (see **Shading**). `bevel.py` is
destructive and tags what it has already rounded so a second run can't round
it twice -- read its docstring before changing the widths.

- Axis convention is three.js-native: local **-Z forward, +X right, +Y up**.
- The glTF spec says assets face **+Z**, so the vehicle model gets a 180° yaw
  on load (`rebuild.model.yawOffset = Math.PI`, applied in both vehicle presets).
- `arcadeVehicle.js` / `simVehicle.js` load `vehicle.glb` straight into the
  `chassis-visual` child group; nothing else about the physics, camera or input
  paths looks inside it. The arcade preset scales the placeholder body to its
  shorter chassis until the Phase 10 cart replaces it.
- `world.js` loads `world.glb` and classifies every node by name prefix
  (`collision_`, `spawn_`, `trigger_`, or plain-visual) rather than a
  hardcoded layout table. See **`docs/blender-conventions.md`** for the full
  naming convention, the Blender <-> game axis conversion, and the export
  settings to keep consistent when new art replaces this blockout.

## Look

The art direction is "toy diorama": moulded-looking objects in flat, saturated
colour, sitting on a warm ground under a soft sky. Three things carry it, and
none of them is a new render pass -- it is all mesh, texture and one cheap
background shader.

**Bevels.** Every visible mesh gets a 3-segment rounded edge, applied into the
geometry by `blender/bevel.py` before the bake (2--8 cm depending on object
size; the table is in that script). This is the single change that stops the
scene reading as a collision blockout: a zero-radius edge is a thing only
software makes, and the bright sliver along a rounded one is most of what the
eye uses to read a solid object.

**Palette.** Eight colours, designed together, defined once in
`tools/generate-matcaps.mjs` and baked into the matcaps it generates:

| | hex | used by |
|---|---|---|
| Dune | `#DDA871` | ground |
| Ember | `#D2543C` | exhibit A, the car's nose bar and tail lip |
| Lagoon | `#2E9E8F` | exhibits B and D |
| Plum | `#8E4F9E` | exhibit C |
| Driftwood | `#9C7E62` | ramps, landing platform |
| Cobalt | `#2F6FB5` | vehicle hull |
| Espresso | `#332B29` | tyres, cabin glass |
| Ivory | `#F3E6CC` | headlamps, wheel hubs, sky horizon |

Nothing is fully saturated and nothing is neutral grey, which is what lets
eight hues read as one set. Cobalt is the only strong cool blue in the scene,
so the car never blends into the exhibits. Those hex values are the colour
each matcap renders *head-on* -- the generator inverts its own tone curve to
guarantee it, and prints a round-trip check per texture -- so they can be
verified by sampling the middle of the PNG rather than taken on trust. The
renderer's ACES tone mapping still sits on top at runtime, so on-screen pixels
read a little deeper than the table.

**Background.** A vertical gradient (pale cream at the horizon into apricot
overhead) on an inside-out sphere that follows the camera,
`src/render/sky.js`, with `scene.fog` matched to the horizon colour so the
240 m ground plane's far edge dissolves instead of ending in a line. It is a
dome rather than a CSS or screen-space gradient specifically so the horizon
stays put in the *world* when the car launches off a ramp.

To re-colour the whole prototype: edit the `PALETTE` table in
`tools/generate-matcaps.mjs` and the `rendering.sky` block in
`src/config.js`, then `node tools/generate-matcaps.mjs`. No shader, material
or Blender file is involved.

## Shading

There are no real-time lights. Every surface uses `MeshMatcapMaterial`, which
looks shading up from a pre-lit sphere texture by view-space normal, so the
whole scene costs about what unlit geometry costs. The matcaps are generated,
not vendored:

```bash
node tools/generate-matcaps.mjs     # -> public/textures/matcaps/*.png
```

Static geometry multiplies in a Blender bake on top of that, which is what
stops the boxes looking like they are hovering:

```bash
blender --background blender/scene.blend --python blender/bake_ao.py
blender --background blender/scene.blend --python blender/export.py
```

The bake writes two textures (a 2048 for the ground, a 1024 atlas for the
props) and adds the `bake` UV layer that samples them; the export is what
carries that UV layer into `world.glb`, so the two always run as a pair. The
ground additionally gets a sun cast-shadow pass -- plain AO on a 240 m plane
is almost entirely hidden *under* the object casting it.

Both bakes are then pushed through a contrast curve (`ao ** 1.9`) before being
saved, and the ground's is blurred by ~3 texels. Physically correct AO next to
a box on an open plane is a very gentle ramp that reads as nothing at driving
distance; the curve is what turns it into a shadow you can see, and the blur
both removes the last of the sampling speckle and buys a softer penumbra far
more cheaply than more rays would. The props atlas is not blurred -- it is a
packed atlas, and a blur would drag each island across the gutter into its
neighbours -- so it gets 4x the samples instead. See `blender/bake_ao.py`.

The car gets a shadow blob instead: one ray cast straight down, one soft quad
on whatever it hits, scaled and faded by height. It follows ramps and platform
tops, not just the ground plane.

Post-processing is an `EffectComposer` chain with a vignette (on) and bloom
(off -- the scene has no pixels bright enough to bloom; see the note in
`config.js`). Every pass, and the composer's MSAA level, can be toggled live
from **Rendering** in the debug panel. `settings.post.enabled = false`
bypasses the composer completely, which is the honest baseline to measure
against: the chain costs roughly 2.4 ms per megapixel at 4x MSAA, far more
than the scene itself.

## What's placeholder

Everything you see and read right now is a stand-in, on purpose, pending a
theme decision for the final piece:

- **World & vehicle** — placeholder *shapes* from `blender/scene.blend`:
  boxes and a cylinder for exhibits, two plain ramps, a wedge-and-boxes car.
  They are finished to a consistent look now (see **Look**) rather than left
  as raw grey boxes, but they are still stand-in shapes for a theme that
  hasn't been chosen. The pipeline around them (naming convention,
  collision/spawn/trigger authoring, bevel + matcap + AO passes) is the real,
  load-bearing part; the shapes riding on it are not.
- **Content** — `content/projects.json`'s four entries ("Project One" ...
  "Project Four", a placeholder pitch/description and the same generic
  `placeholder.svg` image for each) exist to prove the trigger → card →
  progress pipeline end to end, not to describe real projects.

Swapping in final art means replacing `blender/scene.blend`'s geometry (kept
naming-convention-compatible) and `content/projects.json`'s entries — nothing
in `src/` should need to change for either. Re-colouring it is smaller still:
the `PALETTE` table in `tools/generate-matcaps.mjs` plus `rendering.sky` in
`src/config.js`.
