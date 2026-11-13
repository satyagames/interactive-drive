# 09 — Codebase audit (commit `b053a12`, 2026-10-28)

## 1. Summary
Phases 0–11 are complete. **Mechanics are at reference parity:** feel-probed, iso camera, areas, reveal, gamification, VFX, audio, HUD and QA.
**The look is still greybox.** It reads as a clean prototype, not an AAA experience. The stack also contradicts the
project instructions (TypeScript, WebGPURenderer, TSL, ≤ 5 MB, < 100 draw calls), so the look-dev upgrade is also the right moment to migrate.

## 2. Stack and size
| Item | Current | Project instruction | Gap |
|---|---|---|---|
| Language | JavaScript (~12.5k lines, 70+ modules) | TypeScript strict | migrate incrementally |
| Renderer | `WebGLRenderer`, ACES Filmic, exposure 1.05 | `WebGPURenderer` from `three/webgpu`, `await init()`, `setAnimationLoop` | migrate |
| Post | `EffectComposer` (Render, UnrealBloom, Vignette, SMAA/FXAA, Output) | TSL `RenderPipeline` | rebuild the post chain; EffectComposer does not run on WebGPURenderer |
| Materials | `MeshMatcapMaterial` + `onBeforeCompile` patches (AO, fresnel, emission) | TSL node materials, no `onBeforeCompile` | rewrite as one TSL stylised-lit material |
| Lighting | none (matcaps) + one ambient fallback | ≤ 1 real-time shadow light, baked elsewhere | add a sun with a shadow map |
| Assets | Draco GLBs, JPEG greyscale AO, PNG matcaps; no KTX2, no meshopt | meshopt + KTX2 via gltf-transform | add the pipeline |
| First load | 7.8 MB (QA) | ≤ 5 MB | stream districts; KTX2; trim |
| Draw calls | ≤ 117 (QA) | < 100 | palette atlas + BatchedMesh |
| Triangles | 85k in view | ≤ 300k mobile | **headroom: spend it on silhouettes and grass** |
| Memory files | missing (`docs/memory/*`) | required | create |
| Audio | procedural placeholders; `public/audio` empty | real assets, licensed | source and record |
| Fonts | system UI stack | design-system tokens | pick a self-hosted typeface |

## 3. Visual audit (headless screenshots, medium tier)
What the frame looks like now:
- **The floor is a flat pale lime-cream wash.** No value structure, no texture, no edge, no ambient contrast. It fills about 70% of the frame, so it dominates the impression.
- **Objects have no light direction.** Matcaps give shading, but there is no cast shadow on the ground except the blobs, no form shadow consistent with a sun, and no bounce. The white blocks read as unlit greybox.
- **The intro letters are illegible.** "PURSUIT ARENA" is built from stacked boxes. It reads as random pillars, while the "10" reads well because it is gold and chunky.
- **The palette is unbalanced.** It mixes lots of off-white, pure black roads, saturated tree green, gold arches and brand green with no hierarchy. Black roads are the strongest value in the frame and pull the eye away from the car.
- **Trees, posts and arches are primitives** (cones, spheres, boxes) with no stylistic signature.
- **The HUD reads like a dashboard.** Four dark rounded panels plus a minimap compete with the world; the reference shows almost no chrome.
- **The sky and horizon are white.** No atmosphere, no depth cue, no time of day.
- **What's good:** the camera angle and framing, the cart's silhouette and colour, the instant readability of the gold "10", clean edges (SMAA), and the physics fun (letters toppled convincingly).

## 4. Code-level strengths to keep
- Tunables in `config.js` with live lil-gui; the feel probe and doc 07 targets (do not regress them).
- Blender → GLB pipeline with naming prefixes, validation, LOD twins and per-district AO bakes.
- Event-driven VFX/SFX/UI, pooled particles, quality tiers, reduced-motion support, accessibility at Lighthouse 100, an offline share package.

## 5. Risks for the upgrade
1. **The WebGPU migration touches every shader.** `onBeforeCompile`, `ShaderMaterial` and EffectComposer all need ports. Expect colour shifts from the output transform; re-grade after porting.
2. **Feel regression.** Physics must not change during look-dev. Re-run `npm run probe:feel` after every phase.
3. **Budget pressure.** Grass, shadows and post all cost GPU time. Quality tiers must gate each one, and low tier must stay ≥ 30 fps on a mid phone.
4. **Brand.** Logo, colours and type still await the Brand team (QA open items).
5. **The TypeScript migration** is large. Do it file-by-file with `allowJs`, never as a big-bang rewrite.
