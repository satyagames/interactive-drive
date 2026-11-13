# 04 — Blender pipeline (Blender 5.2.x) and web optimisation

> First run `blender --version`. The scripts must target the installed 5.x Python API. Where an API
> differs from 4.x (bake settings, glTF exporter options, attribute and UV APIs), detect it at runtime and adapt.
> Existing conventions in `docs/blender-conventions.md` still apply and take precedence.

## 1. Source files (split for team work and streaming)
```
blender/
  kit/arena_kit.blend         modular kit: road tiles, kiosks, fingerposts, trees, lamps, benches, props
  districts/hq.blend          one file per district (links the kit as library overrides)
  districts/audit.blend … toolkit.blend, culture.blend, rfp_gate.blend, decade_drive.blend
  vehicle/cart.blend          the anniversary cart (replaces the current placeholder vehicle)
  type/intro_letters.blend    PURSUIT ARENA + "10" (from an approved, licence-cleared font)
  scripts/
    gen_kit.py               procedural generation of kit pieces (bevelled boxes, cylinders, arches)
    gen_district_<id>.py     procedural blockout of each district from doc 02 coordinates
    validate.py              naming, scale, triangle budget, UV and collider checks (fails the build)
    bake_ao.py / bevel.py / export.py   (existing, extended to multi-file and per-district GLB)
```
Pipeline order per file: `gen_* → (artist polish) → vehicle_details.py (cart only) → bevel.py → bake_ao.py → validate.py → export.py`.
Run everything headless: `blender -b <file> -P blender/scripts/<script>.py -- --args`.

## 2. Naming convention (extends the existing one)
| Prefix | Type | Runtime role |
|---|---|---|
| `collision_*` / `collision_*_cyl` / `collision_*_sph` | Mesh | static collider (add `_sph` support) |
| `dyn_<type>_<n>` | Empty or Mesh root | **dynamic** body. Children: one visual mesh plus `collision_` primitives (compound). Custom props: `mass`, `friction`, `restitution`, `sfx` (material class: paper/wood/metal/plastic/brick/rubber) |
| `inst_<type>_<n>` | Empty | instancing marker: runtime places an `InstancedMesh` instance of kit `<type>` here (trees, lamps, dots) |
| `area_<contentId>` | Empty (cube/circle) | Enter area. Its size comes from scale. It opens the content id from `arena.seed.json` |
| `trigger_<id>` | Empty | (existing) passive trigger: stamps, checkpoints |
| `collect_<kind>_<n>` | Empty | collectible spawn (`dot`, `golden`, `shuriken`) |
| `spawn_<id>` | Empty | spawn / respawn points (one per district for `R`) |
| `sfx_<ambienceId>` | Empty | positional ambient emitter. Radius comes from scale |
| `decal_<id>` | Plane | floor typography or board; UV into `floor_atlas` |

## 3. Modelling rules (web-optimised)
- **Style**: low-poly, soft-bevelled (`bevel.py`, 2 segments, 3–6 cm), chunky toy proportions, no tiny details below 10 cm.
  Silhouette first. The camera is about 40 m away at about 50° down, so roofs and floor are what people see most.
- **Shading**: matcaps (palette in `tools/generate-matcaps.mjs`, extended with `brand-green`, `gold`, `glass`, `paper`, `red-tape`) times baked AO (UV channel `bake`, index 1). No PBR, no real-time lights.
- **Triangle budgets**: cart ≤ 4k; district landmark ≤ 6k; pod/kiosk ≤ 1.2k; prop ≤ 300 (cones ≤ 120); tree ≤ 250; letters ≤ 400 each; total per district ≤ 25k.
- **Colliders**: always primitives, never mesh colliders, except the drivable "0" loop and the bridge (use a convex decomposition into at most 16 boxes). A collider must be at least 10% smaller than the visual on dynamic props, so they look like they touch the ground.
- **Pivots**: dynamic prop origin at the centre of mass; static at the floor centre. Apply all transforms; metric scale 1.0.
- **UVs**: channel 0 is for decals/atlas (only where needed); channel 1 is `bake` (non-overlapping, ≥ 4 px padding at 2k).
- **Text and logos**: never model the Deloitte logo; import the approved SVG supplied by the team into `public/brand/` and convert curves → mesh at low resolution. Intro letters come from a licence-cleared font.
- **Materials**: one material per matcap slot, named `mc_<matcap>` (e.g., `mc_brand-green`). The loader maps by name.
- **LOD**: landmarks get `_LOD1` (about 40%). The runtime swaps by distance. Props don't need LODs because they are instanced.

## 4. Export
- glTF 2.0 binary, +Y up, apply modifiers, no cameras or lights, custom properties ON (for `dyn_` props), **meshopt or Draco** compression (keep Draco since the decoder is already shipped), and quantised positions.
- One GLB per district (`public/models/district_<id>.glb`) plus `kit.glb` (instanced sources) plus `cart.glb` plus `intro.glb`.
- Textures: AO bakes at 1024² per district (2048² for HQ), stored as KTX2 (UASTC for AO is fine; ETC1S for atlases). Add a `tools/ktx.mjs` step using locally installed `toktx` if available, falling back to PNG.
- `validate.py` writes `blender/reports/<file>.json` (tris, objects, colliders, missing props). The build fails if a budget is exceeded.

## 5. The anniversary cart (vehicle)
- An original design: a rounded, toy-like open-top buggy with oversized wheels, a Deloitte-green body, a white roll bar, and a "10" pennant on a spring antenna (separate object `antenna` with pivot at its base). Brake lights are separate objects (`light_brake_L/R`) for emissive toggling. Wheels are separate objects (`wheel_FL/FR/BL/BR`) with origins at the hub.
- Dimensions follow doc 01 §6 (chassis ≈ 1.6 × 1.85 × 3.25 m at `worldScale = 1.6`; the final value comes from Phase 1).
- Face Blender −Y (see the existing yaw-offset note), then drive-test nose-first after export.
