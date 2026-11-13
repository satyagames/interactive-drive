# Blender authoring conventions

How the Blender files map onto the game code in `src/`. Read this before
touching any `.blend` or the loader.

Two sources, two pipelines:

- **The arena** -- `blender/kit/arena_kit.blend` and
  `blender/districts/<id>.blend` (base + 14 districts) -- is *generated* by
  `blender/scripts/` from `content/arena.seed.json` and
  docs/pursuit-arena/02's layout (`npm run art:build`; see **Rebuilding the
  arena** below). Until the Phase 10 art pass, change the generators, not the
  `.blend` files: a regenerate overwrites them.
- **The car** lives in `blender/scene.blend` ("Vehicle" collection) and keeps
  its original four-pass pipeline (**Rebuilding the art**). That file's
  "World" collection is the retired prototype lot; it is no longer exported.

## Naming convention

Every object's **name** (not its mesh data name) decides its role at load
time. `src/world/world.js` walks every node of every district GLB, at any
depth, and reads these prefixes (docs/pursuit-arena/04 §2):

| Prefix | Blender object type | Role |
|---|---|---|
| `collision_` | Mesh (primitive) | Not rendered. Its geometry's bounding box + world transform become a fixed Rapier collider (`src/world/colliders.js`). Under a `dyn_` root it becomes part of that prop's compound instead. |
| `collision_*_cyl` / `collision_*_sph` | Mesh | Same, built as a cylinder (upright in its own frame) / sphere. The suffix alone decides the shape. |
| `dyn_<type>_<n>` | Empty | A **dynamic prop**: one Rapier body at the empty (its centre of mass), compound of its `collision_` children, drawn from its **one** visual mesh child (instanced per look, per district). Custom properties (exported as glTF extras): `type`, `mass`, `friction`, `restitution`, `sfx` (`paper`/`wood`/`metal`/`plastic`/`brick`/`rubber`). Starts asleep. |
| `inst_<type>_<n>` | Empty | Place an instance of kit piece `kit_<type>` here (trees, lamps). Custom property `type`. Kit pieces may carry `collision_` children (trunks, poles); every instance gets them. |
| `area_<contentId>` | Empty (`Cube`) | An **Enter area**: driving in opens content `<contentId>` from `arena.seed.json`. Half extents from scale, with the Y/Z swap below. Exactly one per content id (`art:validate` checks). |
| `trigger_<id>` | Empty (`Cube`) | A passive trigger -- passport stamps (`trigger_stamp_<district>`), the "0" loop counter. Same half-extent rule. |
| `collect_<kind>_<n>` | Empty | A collectible spot, `dot` / `golden` / `shuriken`; drawn from `kit_<kind>`. Pickup logic is Phase 6. |
| `spawn_<id>` | Empty | A respawn point (`R` takes the nearest); the car faces the empty's -Z. The boot spawn is the one `arena.seed.json` names (`rfpGate.spawn`). |
| `sfx_<id>` | Empty (`Sphere`) | An ambient sound emitter for Phase 8; radius = scale. |
| `decal_<id>` | Mesh (flat plate) | Floor typography / boards. Visual only. |
| `anim_<id>` | Mesh | A kinematic visual the runtime turns about its own origin: custom props `spin` (rad/s) and `axis` (`x`/`y`/`z`, local). Kept out of the static merge. Put the origin where it should pivot (the portal ring's centre). |

Optional `dyn_` behaviour properties (src/world/dynamicProps.js):

| Properties | Behaviour |
|---|---|
| `hang`, `springK`, `springDamp` | Hangs on a spring from a point `hang` m above where it was authored; the rest length is set so its weight stretches the spring to exactly the authored height (the Idea Spark bulbs). |
| `buoyancy`, `tether` | Floats with `buoyancy` x its weight on a rope `tether` m long to the floor below it (the Culture balloons). Author it at the top of its tether. |
| anything else | Mesh | Static visual. Merged per material per district at load. The mesh named `ground` stays separate: `render/floorGradient.js` repaints it. |

**Materials** decide shading by name: `mc_<matcap>` or
`mc_<matcap>__<RRGGBB>` (a tint multiplied into the matcap), where
`<matcap>` is one of `rendering.matcaps` in `src/config.js`. Objects whose
material isn't named that way (the car) fall back to the object-name prefix
rules in `rendering.matcapRules`.

A `collision_` proxy is a **separate object** from its visual mesh, not the
same mesh reused -- e.g. `pod_audit_managers` (visual) and
`collision_pod_audit_managers` (proxy) are two objects at the same transform.
Keeping them separate is what lets the proxy stay a cheap primitive even when
the visual gets detailed later. Keep dynamic-prop colliders about 10% inside
the visual (doc 04 §3) so props look like they touch the ground.

## Units, scale, and pivots

- Blender's unit system is **Metric, unit scale 1.0** -- 1 Blender unit =
  1 metre = 1 three.js/Rapier unit. Don't change this; `config.js`'s numbers
  (chassis size, wheel radius, ramp dimensions, ...) are all metres and
  assume a 1:1 export.
- Every object's scale is **applied** (`Object > Apply > Scale`, or just
  don't leave a non-1,1,1 scale on export) before exporting. `world.js`
  reads a `collision_` node's *geometry* bounding box to size its collider,
  not `rebuild`-side constants -- if you leave scale un-applied, the loader
  still corrects for it (it multiplies by `node.scale`), but applying it
  first keeps the numbers you see in Blender and in-game in sync, which
  matters when you're eyeballing placement.
- Object **origins** matter for exhibits/ramps: a `collision_` proxy's
  bounding box is read in the proxy's own local space and then centred using
  its own bounding-box centre, so an off-centre origin is tolerated -- but
  keep it centred anyway, it's one less thing to reason about later.
- The **vehicle body** (`blender/scene.blend`'s "Vehicle" collection) is the
  one place origin placement is load-bearing: its origin becomes the origin
  of the `chassis-visual` group in `vehicle/vehicle.js`, which already sits
  `rebuild.chassis.offsetY` (currently `-0.12`) below the wheel anchors. Build
  the body so its own vertical centre (not its wheel-well bottom) sits at
  Blender's Z = 0, matching how the current placeholder box straddles that
  origin.

## Axis conversion (why the numbers "just work")

Blender is Z-up with -Y as the modeling-forward convention; the engine is
Y-up with -Z forward (three.js default). Exporting with the built-in glTF
exporter's default **+Y Up** conversion handles this automatically -- once
exported, reading a node's `position`/`quaternion` in three.js gives you
values already in game space, no manual axis-juggling needed in JS. That's
confirmed by construction: `blender/scene.blend`'s objects were placed by
converting the intended game-space transform, and the exported `world.glb`
comes back out with the *original* game-space numbers (e.g. `exhibit_a` was
authored at Blender `(-12, 6, 1.1)` and exports as three.js position
`(-12, 1.1, -6)` -- exactly the game-space value it started from).

Two things are **not** auto-corrected, both already handled in code:

1. **The vehicle body's forward direction.** The glTF spec's own convention
   is that an asset faces +Z; this project drives towards -Z. That's why
   `rebuild.model.yawOffset = Math.PI` exists and gets applied to the loaded
   vehicle scene in `vehicle.js` -- author the car facing Blender's own
   "front view" direction (-Y, the natural way to model something facing the
   viewer) and the yaw offset does the rest. **Always verify this visually
   after a re-export** (drive forward and check the nose leads) rather than
   trusting the math -- it's cheap to check and a wrong sign here is
   completely invisible until you drive.
2. **Trigger half-extents.** A `trigger_` empty's scale gets the same Y/Z
   swap the exporter applies to position: set the empty's `Scale` in Blender
   to `(halfExtentX, halfExtentZ, halfExtentY)` and it comes back out of
   `world.glb` as `(halfExtentX, halfExtentY, halfExtentZ)` -- i.e. already
   in game-space order. `world.js`'s `emptyScaleToHalfExtents()` just reads
   `node.scale` straight through once loaded; don't add another remap on the
   JS side, and don't assume Blender's X/Y/Z already *are* game X/Y/Z when
   setting the scale in Blender -- they aren't, only after that swap.
   (An earlier version of this doc had the swap backwards, and the loader
   code matched it -- a double-negative that happened to cancel out for one
   axis on the ground/exhibit boxes but silently shrank every trigger's
   effective depth. It went unnoticed because teleporting a test object to a
   trigger's *centre* can't reveal an axis swap; only driving up to an edge
   can. If you add a shape whose half-extents aren't symmetric, sanity-check
   this by driving in, not by teleporting to the middle.)

If you add a new *rotated* object and the tilt comes out wrong, it's one of
these two (position is never the problem): a rotation about Blender's X axis
maps 1:1 to game X; a rotation about Blender's Y axis maps to game Z with the
**sign flipped**; a yaw (game Y axis) maps 1:1 to Blender's Z axis. When in
doubt, build the tilt as raw mesh geometry (bake it into the vertices, leave
the object's own rotation at identity) instead of fighting the sign -- that's
what sidesteps the question entirely, and it's how you'd want to author
anything more complex than a flat ramp anyway.

## Trigger -> content id

A `trigger_` empty's name, minus the `trigger_` prefix, **is the id** it
looks up in the content model (`src/content/model.js`), which is built from
[`content/arena.seed.json`](../content/arena.seed.json) -- every station,
milestone and leader block has an `id` there. `main.js`'s
`contentIdForTrigger()` does the stripping:

```
trigger_audit_managers  ->  id "audit_managers"  ->  arena.seed.json station with "id": "audit_managers"
```

There's no separate mapping table to keep in sync -- the Blender empty's name
*is* the key. To point an existing trigger at a different piece of content,
edit the `id` in `content/arena.seed.json` to match (pure data edit; run
`npm run content:check` afterwards). To add a whole new station, add a
`trigger_<id>` empty in Blender (+ a `collision_`/visual pair for the
structure itself) and a matching station in the seed -- order doesn't matter
on either side, and a trigger with no matching content id is simply ignored
(logged on enter, no panel). The Phase 4 `area_<id>` empties use the same ids.

The prototype world's `trigger_exhibit_a` ... `_d` still resolve, to the four
entries in [`content/projects.json`](../content/projects.json), until the
Phase 4 arena replaces that world.

Renaming a `trigger_` empty means a re-export (see **Export settings**
below); editing the content JSON does not.

## Collision proxy shape

- Default: box (`RAPIER.ColliderDesc.cuboid`), sized from the proxy mesh's
  local bounding box.
- Cylinder: name the proxy `collision_<name>_cyl`. Its radius is taken as
  `max(bbox.x, bbox.z) / 2` and its half-height as `bbox.y / 2` in the
  *loaded* (three.js/game) space, so an upright Blender cylinder (its own
  local Z axis vertical) comes out upright with no extra rotation needed.
- There's no other shape yet. A capsule or convex-hull proxy would need a new
  suffix convention and a matching branch in `addColliderFromNode()` in
  `src/world/world.js`.

## Rebuilding the arena

```bash
npm run art:build      # = art:gen, art:polish, art:validate, art:export, art:cart
node tools/blender.mjs gen --only audit      # one district (or kit / base)
node tools/blender.mjs polish --only audit   # its art pass (base last: it needs every district)
```

`tools/blender.mjs` runs Blender 5.x headless (`BLENDER_BIN` from the
environment or `.env.local`, else the default install path):

1. **`gen_kit.py`** → `blender/kit/arena_kit.blend`: trees, lamps, and the
   dot / golden / shuriken collectible shapes.
2. **`gen_base.py`** → `blender/districts/base.blend`: ground, ring roads and
   spokes, the boundary berm + invisible wall, four Outer Loop ramps, the
   junction fingerposts, scattered trees and lamps, the 100 green dots.
3. **`gen_district.py --id <id>`** → `blender/districts/<id>.blend` for HQ,
   the RFP Gate, the Decade Drive and the 11 territories / pillars, at the
   seed's coordinates: plaza, gateway + `trigger_stamp_<id>`, landmark, one
   pod + `area_` per station, the themed playground, trees, spawn, ambience.
   Shared helpers live in `_common.py`; the arena's radii in `arena_layout.py`.
4. **`polish.py`** per file (the Phase 10 art pass, shared code in
   `polish_lib.py`):
   - **LOD1**: each `landmark_*` visual gets a twin `<name>_LOD1`, copied
     *before* the bevel (the plain blockout, roughly a third of the bevelled
     triangles). The runtime merges LOD0 and LOD1 landmarks into two sets and
     shows one by camera distance (`settings.lod.distance`, set by the
     quality tier).
   - **Bevel**: every static visual (2 segments, 5–6 cm), dynamic-prop visual
     and kit piece (1 segment, 3 cm) gets a rounded, smooth-shaded edge,
     written into the mesh with bmesh. Props of one look share a mesh, and
     that sharing is what the runtime batches them by, so the bevel goes on
     the shared mesh, once. Floors, roads, plazas, decals and kit trees are
     left alone.
   - **AO**: the district's static visuals share one atlas on the `bake` UV
     layer (TEXCOORD_1), 1024² (HQ 2048²), baked against each other and a
     temporary ground plane. Downward faces and LOD1 twins sample the
     atlas's reserved white corner. Collision proxies and dynamic props are
     hidden from the bake: proxies would occlude their own visuals, and props
     would leave a shadow where they started.
   - **Ground (base)**: the ground alone is baked, AO times a soft sun shadow
     at 2048², through a planar top-down projection, with every district's
     statics linked in as occluders. Roads and kerbs share the projection but
     are hidden during the bake, so they inherit the ground's shadows instead
     of baking the floor beneath them into their own texels.
   - Bakes are written as greyscale JPEG to `public/textures/bake/district_<id>.jpg`.
     Save them with the Standard view transform: Blender 5's default AgX maps
     1.0 to about 0.77.
5. **`validate.py`** per file → `blender/reports/<file>.json` (git-ignored),
   then cross-file checks: naming, applied scale, budgets (district 25k tris,
   landmark 6k, pod 1.2k, prop 300, letter 400, tree 250), every content id
   with exactly one `area_`, and **no dynamic prop starting inside static
   geometry** (it would be shot out on the first physics step). Any error
   fails the build. `_LOD1` twins are counted apart (`lod1Triangles`), not
   in the district total, since they never draw alongside LOD0.
6. **`export_arena.py`** per file → `public/models/kit.glb`,
   `public/models/district_<id>.glb`, and `public/models/arena.manifest.json`
   (core districts load before the first frame; the outer ring streams). A
   district with a bake gets `"bake": "district_<id>.jpg"` in the manifest.

All generators work in game space (metres, -Z north) and convert to Blender
on object creation, so their numbers read like docs/pursuit-arena/02.

## The anniversary cart

`npm run art:cart` runs `blender/scripts/gen_cart.py`, which builds the cart
(docs/pursuit-arena/04 §5), bevels it, bakes its AO and exports it in one
pass: `blender/vehicle/cart.blend`, `public/models/cart.glb` (≤ 4k tris; about
3.1k) and `public/textures/bake/cart-ao.jpg`. It is authored in the physics
body's own space and size (the arcade preset at worldScale 1.6), nose towards
Blender −Y, so the runtime only turns it π (`rebuild.cart.yawOffset`). Node
names are the contract with `src/vehicle/arcadeVehicle.js`: `cart_*` body
parts (`cart_body` takes skins), `wheel_FL/FR/BL/BR` (origin at the hub;
wheel_FL's look is cloned for all four), `antenna` (an empty at the spring's
pivot) and `light_brake_L/R`, `light_reverse_L/R`. After changing it, drive it:
the nose must lead.

## Rebuilding the art (the prototype car, `?vehicle=sim` only)

The `sim` preset still uses the prototype's `blender/scene.blend` car. Four
headless passes, in this order:

```bash
blender --background blender/scene.blend --python blender/vehicle_details.py
blender --background blender/scene.blend --python blender/bevel.py
blender --background blender/scene.blend --python blender/bake_ao.py
blender --background blender/scene.blend --python blender/export.py
```

Each saves the .blend, so the order is a real dependency chain, not a
convention:

1. **`vehicle_details.py`** rebuilds the car's lamps and tail lip. Idempotent
   (it replaces objects by name), and it emits *un-bevelled* geometry, so it
   has to come before the bevel pass rather than after it.
2. **`bevel.py`** rounds every visible edge and applies the result into the
   mesh. Idempotent via a `bevel_applied` custom property on each object --
   read its docstring before changing a width, because a second pass compounds
   on the first rather than replacing it.
3. **`bake_ao.py`** unwraps and bakes. It has to see final geometry: it
   projects UVs onto whatever mesh it finds, so bevelling afterwards would
   leave the bake mapped to a surface that no longer exists.
4. **`export.py`** writes the two .glb files.

Steps 1 and 2 are only needed when the geometry changes. **Steps 3 and 4
always run as a pair**: the bake writes the textures *and* creates the UV
layer that samples them, and only the export carries that UV layer into
`world.glb`.

## Baked lighting

Static world geometry carries a Blender bake that the game multiplies into its
matcap shading (`src/render/materials.js`). Without it the boxes read as
hovering: matcap shading is view-space and has no idea where the ground is.

### UV layers

Every baked object ends up with exactly two UV layers, in this order:

| # | Name | glTF | Role |
|---|---|---|---|
| 0 | `UVMap` | `TEXCOORD_0` | Reserved for real art UVs. Empty placeholder for now. |
| 1 | `bake` | `TEXCOORD_1` | The AO/shadow bake. `rendering.bakeChannel` in `config.js` is hardcoded to 1. |

`bake_ao.py` creates both and will *re-create* them if it finds `bake` sitting
at index 0, so the ordering can't drift. Don't reorder them by hand, and don't
rename `bake` -- the script looks it up by name, and the game looks it up by
index.

### What gets baked, and why it differs by object

- **Ground** (`world-ao-ground.png`, 2048) gets a hand-written top-down planar
  unwrap so its single visible face fills the whole texture (~12 cm/texel over
  240 m). Its other faces are parked on one unused corner texel; if they
  shared the top face's UVs they would bake over its shadows.

  It also gets a **sun cast-shadow pass** multiplied on top of the AO. Pure
  AO was tried first and is not enough on its own here: next to a 4 m box on a
  240 m plane, essentially all of the occlusion lands *underneath* the box,
  and the visible penumbra is about a metre wide -- invisible at driving
  distance. A cast shadow is what actually reads as contact.

  The sun direction (`SUN_ELEVATION` / `SUN_AZIMUTH`) is a free choice, not
  something to match to a light in the scene: matcap shading is view-space, so
  there is no world-space key light for it to agree or disagree with.

- **Props** (`world-ao-props.png`, 1024) -- exhibits and ramps -- get an
  automatic multi-object unwrap packed into a shared atlas, and **AO only**.
  A cast-shadow pass would darken one whole flank of every prop and fight the
  matcaps for no benefit.

Both bakes are then put through `AO_GAMMA` (`ao ** 1.9`) before being saved.
Raw Cycles AO is a visibility fraction, and a visibility fraction next to a
box on an open plane is a gentle, physically correct ramp that reads as
nothing at driving distance. The curve leaves open ground alone (`1 ** g == 1`,
so no seams appear in the atlas gutters, which sit at 1) and pushes everything
already partly occluded further down. Along with a shorter `AO_DISTANCE` (5 m,
was 10) and a lower `SHADOW_FLOOR` (0.24, was 0.42), that is what moved the
contact shadows from "technically present" to readable in motion.

They are two textures rather than one atlas because packing is area-
proportional: the ground is ~57,000 m² against a few hundred for everything
else, so a shared atlas would leave the props with almost no texels.

### Gotchas the script already handles

- `collision_` proxies and the vehicle are hidden from the render during the
  bake. The proxies sit exactly on top of their visual twins and would occlude
  every surface with itself; the car would burn a permanent car-shaped shadow
  into the ground at the origin.
- Bake targets start filled white and bake with `use_clear=False`. AO is a
  multiplier, so an unbaked texel has to mean "no occlusion" -- clearing to
  black instead leaves dark seams wherever filtering strays off an island.
- The bake switches the scene to Cycles and switches it back before saving.

`bake_ao.py` saves the .blend, because the UV layers have to survive for the
next export.

## Export settings

Both `public/models/world.glb` and `public/models/vehicle.glb` are exported
with:

- Format: **glTF Binary (.glb)**, one object selection per file (`World`
  collection -> `world.glb`, `Vehicle` collection -> `vehicle.glb`) via
  `use_selection`.
- **+Y Up** conversion on (`export_yup`, the default) -- required, see above.
- **Apply Transforms** on (`export_apply`) -- bakes any remaining
  modifiers/transforms so the loader sees clean geometry.
- **Draco mesh compression** on, level 6. This is blockout geometry (a few
  hundred verts total) so Draco barely matters yet, but the loader
  (`src/core/gltf.js`) already wires up `DRACOLoader` pointed at
  `public/draco/` (decoder files copied from
  `node_modules/three/examples/jsm/libs/draco/` -- re-copy them if the
  `three` version bumps and the format changes), so it costs nothing to keep
  using it once real, heavier art lands.
- Cameras and lights excluded (the file only needs to carry meshes + empties;
  the scene has no real-time lights at all -- see **Baked lighting** above).
- UVs exported for every layer. Both are needed: `TEXCOORD_1` is the bake
  channel, and `TEXCOORD_0` is the placeholder that keeps it at index 1.

To re-export after editing the scene, either use the Blender MCP tooling
(`execute_blender_code`, calling `bpy.ops.export_scene.gltf(...)` per
collection -- see git history / this doc's export settings for the exact
kwargs) or run headlessly:

```bash
blender --background blender/scene.blend --python blender/export.py
```

## Current object manifest

**Arena.** Generated -- see `blender/reports/*.json` after `npm run
art:validate` for the per-file counts (Phase 4: about 21k authored
triangles, 246 dynamic props, 118 collectibles, 43 areas across 16 files).

**World (retired).** `scene.blend`'s prototype lot: ground plane, four exhibit
stand-ins, two ramps, one spawn, four triggers. No longer exported or loaded.

**Vehicle.** `vehicle_hull`, `vehicle_cabin`, `vehicle_nose_accent`, plus
`vehicle_lamp_l` / `vehicle_lamp_r` (round nose lamps) and `vehicle_spoiler`
(a raised lip across the tail deck). The last three are generated by
`vehicle_details.py`, and all six are visual-only -- the chassis collider is a
box built from `rebuild.chassis.size` in `src/config.js` and never looks at
this geometry.

Every mesh here except the `collision_` proxies carries an applied bevel (see
**Rebuilding the art**). The proxies are deliberately left sharp: they are
never rendered, and a bevel does not change a convex mesh's bounding box, so
nothing in this pass can move a collider, a trigger volume or a spawn point.

The shapes themselves are still placeholder-quality. The flat material colours
are also still there for authoring readability, but the game ignores them
entirely and assigns matcaps by name prefix instead (`rendering.matcapRules`
in `src/config.js`). See `blender/scene.blend`'s `World` and `Vehicle`
collections for the authoritative list, or `public/models/world.glb`'s node
names.

Positions mirror the original placeholder `LAYOUT` table in `world.js`'s git
history (same ramp tilts and spacing), so the driving feel doesn't change
just because the geometry did.
