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

| | Keyboard | Touch |
|---|---|---|
| Accelerate | `W` / `↑` | ▲ (bottom right) |
| Brake / reverse | `S` / `↓` | ▼ |
| Steer | `A` `D` / `←` `→` | ◀ ▶ (bottom left) |
| Handbrake | `Space` | `H` |
| Respawn | `R` | ⟲ |

The touch pad appears automatically on coarse-pointer devices, and can be
forced on for desktop testing from **Debug → force touch pad**.

## Layout

```
index.html            markup for the canvas, HUD and touch pad
vite.config.js
content/
  projects.json       the 4 exhibit entries (id, title, pitch, description, image)
blender/
  scene.blend           Blender source: "World" + "Vehicle" collections
  vehicle_details.py    adds the car's lamps + tail lip (idempotent)
  bevel.py              rounds every visible edge, destructively (idempotent)
  bake_ao.py            headless Cycles bake -> public/textures/bake/*.png
  export.py             headless re-export -> public/models/*.glb
                        (those four run in that order -- see Art pipeline)
tools/
  generate-matcaps.mjs  the colour palette + the matcaps it bakes it into
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
    post.js           EffectComposer chain (bloom, vignette, output)
  world/
    world.js          loads world.glb, builds colliders from `collision_`
                      nodes, reads out `spawn_`/`trigger_` empties
    triggers.js       logs to console when the vehicle enters a trigger
    lighting.js       a single fallback ambient; matcaps need no lights
  content/
    panel.js          the exhibit info card shown while inside a trigger
    progress.js       "N of 4 found" tracker behind the HUD indicator
  vehicle/
    vehicle.js        raycast vehicle: chassis body + 4 suspension rays
  camera/
    chaseCamera.js    smoothed follow camera
  input/
    index.js          merges keyboard + touch into one axis set
    keyboard.js
    touch.js
  debug/
    gui.js            lil-gui panel bound to config.js
    physicsDebug.js   collider wireframe overlay
    fps.js            frame-rate readout in the HUD
```

## Where the tunables live

`src/config.js` holds three objects:

- **`settings`** — read live every step, so every value is safe to change from
  the lil-gui panel while driving. Grouped into `vehicle`, `suspension`,
  `body`, `camera`, `shadow`, `post`, `render`, `debug`.
- **`rebuild`** — structural values (chassis size, wheel positions, mass,
  spawn point, gravity, timestep). Changing these needs a respawn or a reload.
- **`rendering`** — which matcap and which AO bake each object gets, matched
  by object-name prefix. Changing these needs a reload.

The debug panel writes straight into `settings`. **Tuning I/O** can save the
current tune to `localStorage` (restored on the next load), reset to defaults,
or copy the whole thing as JSON to paste back into `config.js` once a feel is
worth keeping.

The panel (lil-gui) is open by default in the top-right corner on desktop —
click its **Tuning** title bar to collapse or expand it, or a folder's own
header to fold just that section. On a coarse-pointer (touch) device it
starts collapsed instead, since it would otherwise cover most of the screen;
tap the title bar to open it there too.

## How the vehicle works

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

## Exhibits

Four `trigger_` volumes in `world.glb` mark exhibit stops. Driving into one
looks up its id in `content/projects.json` and shows a card (title, one-line
pitch, description, image) via `src/content/panel.js` — driving keeps working
the whole time it's open, and it's dismissed by driving back out, the close
button, or Escape. `src/content/progress.js` tracks how many of the 4 have
been found at least once, shown in the small HUD indicator. To swap in real
projects, edit `content/projects.json` — title, pitch, description and image
are the only fields the panel reads, and ids there must match the `trigger_`
names authored in Blender (see `docs/blender-conventions.md`).

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
  on load (`rebuild.model.yawOffset = Math.PI`, applied in `vehicle.js`).
- `vehicle.js` loads `vehicle.glb` straight into the `chassis-visual` child
  group; nothing else about the physics, camera or input paths changed.
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
