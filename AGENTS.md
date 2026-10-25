# Agent Instructions

## Project shape

This is a browser-based 3D driving portfolio built with Vite, Three.js, and Rapier. The runtime entry point is [`src/main.js`](src/main.js); it composes the renderer, physics, world, vehicle, camera, input, content overlays, post-processing, and debug tools. Keep those systems separated and follow the existing factory-style module APIs.

The project is intentionally self-contained after building: do not add CDN assets, runtime network calls, analytics, or external font dependencies without an explicit requirement.

## Commands

Run these from the repository root:

```bash
npm install
npm run dev          # local development server
npm run build        # production build into dist/
npm run preview      # serve the production build
npm run package:share
```

There is currently no automated test suite, lint configuration, or CI workflow. For runtime changes, validate with `npm run build` and manually exercise the affected browser workflow through a served page. Do not open the app from `file://`; ES modules and GLTF fetches need HTTP.

## Runtime conventions

- Put tunable gameplay and rendering values in [`src/config.js`](src/config.js). Values under `settings` are live-tunable; values under `rebuild` require recreating or reloading the affected system.
- Preserve the local vehicle axis convention: `-Z` forward, `+X` right, `+Y` up. Physics forces belong in the fixed-timestep update, not directly in the render loop.
- Keep arena content in [`content/arena.seed.json`](content/arena.seed.json) and interface copy in [`content/ui.json`](content/ui.json), each validated against its `*.schema.json` (`npm run content:check`, and automatically in `npm run dev`). A Blender `area_<id>` / `trigger_<id>` maps directly to the content id `<id>` (see `src/content/model.js`); there is no separate mapping table.
- Gameplay lives in [`src/game/`](src/game/): systems talk through the event bus (`game.events`); VFX, SFX and UI subscribe rather than being called directly. Progress persists in `localStorage` (`src/game/store.js`, try/catch-wrapped, no network). With `#debug`, **Debug → Run badge test** earns every badge through the real detection paths.
- Visual effects live in [`src/vfx/`](src/vfx/) and subscribe to `game.events` (collisions arrive as `impact` events from `src/world/impacts.js`). Keep them pooled (no per-frame allocation), honour `prefers-reduced-motion` / `settings.vfx.reducedMotion`, and draw anything that should bloom in HDR above `settings.post.bloom.threshold`: matcap surfaces never exceed 1.0, so the threshold is the bloom layer.
- Sound lives in [`src/audio/`](src/audio/) and also subscribes to `game.events`. Never create or resume an AudioContext before a user gesture; route one-shots through `sounds.play` so the 12-voice limit holds. Until real files arrive every sound is synthesised: list any new sound in [`public/audio/MANIFEST.md`](public/audio/MANIFEST.md), and log any file you add in [`CREDITS.md`](CREDITS.md).
- Screens and HUD live in [`src/ui/`](src/ui/) (start screen, HUD corners, minimap, Esc menu). New panels: native controls, copy from `content/ui.json`, `data-captures-keys` on anything that uses arrows/Space itself, focus moved in on open and returned on close (to the game canvas when the opener is gone), and Esc wired through the chain in `main.js`. Check new screens at 360 px wide. Keep Lighthouse accessibility at or above 95 on the menu screens.
- Preserve relative asset paths and the `base: './'` setting in [`vite.config.js`](vite.config.js), which allows `dist/` to work from a sub-path.
- Keep user-facing HTML behavior accessible: preserve labels, `aria-live`, keyboard controls, and touch controls when changing the HUD or exhibit panel.

## Blender and generated assets

Read [`docs/blender-conventions.md`](docs/blender-conventions.md) before editing Blender content or loader assumptions. In particular:

- Keep visual meshes separate from `collision_` proxy meshes.
- Keep metric 1:1 units and apply object scales before export.
- **Arena** (everything the car drives in): generated, not hand-modelled. Run `npm run art:build` (or `art:gen` → `art:validate` → `art:export`), which drives Blender 5.x headless through `blender/scripts/` (`gen_kit.py`, `gen_base.py`, `gen_district.py --id <id>`, `validate.py`, `export_arena.py`) and writes `blender/{kit,districts}/*.blend`, `public/models/{kit,district_*}.glb` and `public/models/arena.manifest.json`. Blender is found via `BLENDER_BIN` (environment or `.env.local`) or the default install path. Change layouts in the generators, not in the `.blend` files, until the Phase 10 art pass. `art:validate` must pass (names, budgets, every content id has exactly one `area_`, no dynamic prop starting inside static geometry).
- **Car** (`blender/scene.blend`, Vehicle collection): run `vehicle_details.py`, `bevel.py`, `bake_ao.py`, then `export.py` in that order. The bake and export steps must remain a pair. The scene's World collection is the retired prototype lot and is no longer exported.
- Do not reorder or rename the `bake` UV layer; runtime AO reads it from texture coordinate channel 1.
- Set asymmetric trigger half-extents using the documented Blender Y/Z swap, and verify them by driving to an edge rather than only checking the trigger center.
- After vehicle re-exports, visually verify that forward input moves the vehicle nose-first; the model yaw correction is intentional.

Generated GLB, bake, and matcap outputs are runtime inputs. When their source or generation scripts change, rebuild the relevant outputs and check that the production build still contains the expected files.

## Change and validation guidance

Prefer small, focused edits that preserve public module APIs and existing visual conventions. Update README or relevant docs when a workflow or command changes. For gameplay, rendering, or asset changes, validate the narrowest affected path first, then run `npm run build`; report manual checks that could not be automated.

Useful detailed references:

- [`README.md`](README.md) for setup, controls, sharing, and the full architecture map.
- [`docs/blender-conventions.md`](docs/blender-conventions.md) for scene naming, transforms, UVs, and export details.
- [`src/config.js`](src/config.js) for tunable values and the rationale behind rendering and physics defaults.