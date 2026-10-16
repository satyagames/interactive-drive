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
- Keep content data in [`content/projects.json`](content/projects.json). A Blender `trigger_<name>` maps directly to the content id `<name>`; there is no separate mapping table.
- Preserve relative asset paths and the `base: './'` setting in [`vite.config.js`](vite.config.js), which allows `dist/` to work from a sub-path.
- Keep user-facing HTML behavior accessible: preserve labels, `aria-live`, keyboard controls, and touch controls when changing the HUD or exhibit panel.

## Blender and generated assets

Read [`docs/blender-conventions.md`](docs/blender-conventions.md) before editing Blender content or loader assumptions. In particular:

- Keep visual meshes separate from `collision_` proxy meshes.
- Keep metric 1:1 units and apply object scales before export.
- Run the art pipeline in this order: `vehicle_details.py`, `bevel.py`, `bake_ao.py`, then `export.py`. The bake and export steps must remain a pair.
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