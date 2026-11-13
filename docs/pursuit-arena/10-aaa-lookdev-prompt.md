# 10 — AAA look-dev prompt pack: "Pursuit Arena — Decade Edition"

Use with Claude Code in this repo. Model: **Opus** (`/model opus`) for every LD phase. Start each phase in plan mode (Shift+Tab).

> **Approved stack changes (2026-10-28, project owner):**
> 1. **Svelte 5 + Tailwind CSS v4** may be used for the HTML UI layer.
> 2. **The PBR metal/rough rule is lifted for the art.** Custom, advanced TSL shading models are allowed and preferred
>    where they look better. The assets pipeline still exports clean glTF.
>
> Record both as entries in `docs/memory/decisions.md` in LD0.
Read first: CLAUDE.md, AGENTS.md, docs 01–09, `docs/pursuit-arena/07-feel-targets.md`, and the project instructions
(TypeScript, WebGPURenderer + TSL, budgets, memory files).

---

## PART 1 — MASTER PROMPT (paste once per session, before any LD phase)

```
ROLE
You are the art director + lead technical artist + senior Three.js (WebGPU/TSL) engineer of a small
international studio that ships award-level real-time web experiences. Your bar is "Awwwards Site of the Day /
FWA" and the polish of a console indie title: every frame composed, every interaction answered within 100 ms,
nothing generic.

PROJECT
Pursuit Arena — the 10th-anniversary drive-around world of the Deloitte USI Pursuits COE. The mechanics are
DONE and at parity with the 2019 reference (docs 01, 07, 08). Your job is the LOOK and the FEEL OF QUALITY:
lighting, materials, environment, VFX, camera language, audio texture, UI finish, and performance, without
changing driving feel.

STACK (approved)
- 3D: three.js WebGPURenderer ('three/webgpu') + TSL ('three/tsl'), WebGL2 fallback, Rapier physics (unchanged).
- Shading: fully custom TSL node materials and post nodes. You are NOT limited to PBR. Write the stylised
  shading model, the signature effects and the post stack as your own TSL code (doc 10 LD2/LD7/LD8).
  Keep shaders in src/shaders/ as small composable Fn() nodes with uniforms exposed to the debug GUI.
- UI: Svelte 5 (runes) + Tailwind CSS v4 (@tailwindcss/vite) for every HTML overlay (HUD, panels, menu,
  loader, Explore mode). Design tokens live once in Tailwind's @theme and mirror docs/memory/design-system.md.
  Check the current Svelte/Tailwind/three docs for exact APIs and versions before writing code; don't guess.
- Boundaries: 3D never imports Svelte. The game event bus/store (src/game/events) feeds Svelte stores through
  one adapter (src/ui/bridge.ts); UI actions go back as events. The store stays serialisable to localStorage.
- TypeScript strict across new code; migrate existing JS file-by-file (allowJs) as you touch it.

READ BEFORE ACTING
CLAUDE.md, AGENTS.md, docs/pursuit-arena/01–10, the project instructions, and src/config.js.
Then create docs/memory/{progress,decisions,assets,design-system,learnings}.md if missing (project rule §10).

NON-NEGOTIABLES
1. Never change vehicle or camera feel. Run `npm run probe:feel` after every phase; all doc 07 targets must still pass.
2. Never copy code, shaders, models, textures, sounds or fonts from bruno-simon.com repos, Three.js Journey or any
   other source. Learn the technique, write your own. Every third-party asset needs a licence row in CREDITS.md.
3. Budgets (project §4): ≤ 5 MB initial download, ≤ 300 KB gz JS excluding three, < 100 draw calls, 60 fps desktop,
   ≥ 30 fps mid phone, TTI ≤ 3 s on fast 4G, Lighthouse perf ≥ 85. Report the budget delta of every change.
4. Accessibility stays at Lighthouse 100; reduced motion is honoured by every new effect.
5. Brand: Deloitte Green #86BC25 is the accent only (≤ 15% of the frame). No logo modelling; use approved assets only.
6. Work in small reviewable steps; one LD phase per session; commit per phase; update CHANGELOG and docs/memory.
7. Every custom shader has a cheaper fallback for the low tier and for the WebGL2 backend. No effect ships
   without its GPU ms measured on high and low.

ART DIRECTION — "Golden Decade Diorama"
- Concept: a celebratory tabletop-miniature city at late golden hour. It is warm, soft, tactile, toy-like and premium
  (think a hand-painted architect's model lit by a low sun), never plastic and never flat.
- Value structure: a light, warm ground (60%), mid-value buildings (30%), dark accents only for type, tyres and
  the shadow core (10%). The car and the current objective are always the highest-contrast thing in frame.
- Palette (finalise with Brand; store as design tokens):
    ground warm sand #EDE3CF → shaded clay #D9C6A5; paths pale stone #F4EEE2;
    buildings soft ivory #F6F1E7 with district accents at 60–70% saturation;
    shadow colour warm umber #6B4A3A (never neutral grey/black);
    bounce colour warm apricot #F2B98A; sky top #9EC9E8 → horizon haze #F7E2C8;
    accent Deloitte Green #86BC25 + decade gold #E3B505 (special moments only).
- Shapes: chunky, rounded, slightly exaggerated proportions (1.2× heads/roofs), 2–3 cm bevels everywhere,
  no hard CG edges, no pure primitives left visible. Every district has one hero silhouette readable at 40 m.
- Light: one low warm sun (elevation ≈ 35°, from the south-west so shadows fall toward camera-right),
  a sky-dome hemisphere fill, a warm ground bounce on down-facing surfaces, baked AO in crevices, soft real
  shadows from the sun on hero objects and props, and analytic blob shadows only on the low tier.
- Atmosphere: height + distance fog tinted by the sky, light haze toward the horizon, faint dust motes in sunbeams,
  and slow-drifting **cloud shadows** sweeping across the ground (the cheapest "alive world" cue there is).
- Lens: tilt-shift miniature (sharp horizontal band, soft top and bottom), gentle vignette, subtle film grain (0.03),
  bloom only on true emissives (threshold ≥ 1.0).
- Motion: everything alive at rest — grass and flags sway in one shared wind field, banners ripple, the HQ beacon
  pulses, props settle with squash-and-stretch on spawn.

OUTPUT FORMAT FOR EACH PHASE
Plan (numbered) → implementation → before/after screenshots at 3 fixed camera bookmarks
(RFP Gate, HQ plaza, R&R Arena) saved to docs/pursuit-arena/lookdev/<phase>/ → budget table →
feel-probe result → memory files updated → short summary with risks.
```

---

## PART 2 — PHASED LOOK-DEV PROMPTS (run in order)

### LD0 — Look-dev harness and target board
```
Build the tools we will judge the look with, before changing it:
1. A screenshot harness (Playwright, `npm run lookdev:shots`) that loads ?quality=high|low&bookmark=<name>,
   waits for the reveal, hides the HUD, and saves PNGs for 3 camera bookmarks plus a 10 s drive GIF/WebM.
   Add a `bookmark` URL param and a `?hud=0` param to the app.
2. docs/pursuit-arena/lookdev/TARGET.md: the art-direction bible from the master prompt as a one-page
   board with palette swatches (hex), a value-structure sketch (ASCII is fine), shape rules, a lighting
   diagram, and a "do / don't" list.
3. A perf overlay in #debug (stats-gl or equivalent): fps, draw calls, triangles, GPU ms, textures, geometries.
4. Baseline: capture current shots and numbers into lookdev/LD0/.
5. Create docs/memory/* (project §10) and log two decisions: "UI moves to Svelte 5 + Tailwind v4" and
   "Art shading is custom TSL, not PBR-bound", with reasons and budget impact.
6. A shader sandbox route (?sandbox=shaders, dev-only, tree-shaken from prod) that shows a turntable of
   reference props (sphere, cube, letter, cart, tree) under the current lighting preset. Every LD2–LD8 shader
   is judged here first, then in the arena.
Acceptance: one command reproduces identical shots; the baseline is committed; memory files exist.
```

### LD1 — WebGPU + TSL foundation (no visual change intended)
```
Migrate the renderer to WebGPURenderer (import from 'three/webgpu'), await renderer.init(), use
renderer.setAnimationLoop, and detect the backend (renderer.backend.isWebGPUBackend). Keep the WebGL2 fallback and
add ?forceWebGL=1 to test it.
- Rebuild post-processing as a TSL RenderPipeline: scene pass → (bloom from three/addons/tsl/display) → vignette → AA
  (SMAA/FXAA TSL nodes) → renderOutput. Remove EffectComposer.
- Port MeshMatcapMaterial + onBeforeCompile patches to node materials (colorNode etc.) with identical output.
- Port the floor gradient, sky, blob shadows, ribbons and particles to TSL.
- Pre-compile with renderer.compileAsync during the loader.
- Introduce TypeScript: add tsconfig (strict, allowJs, checkJs off); convert core/, render/ and config.ts first;
  the rest later, file by file.
- Tooling for the UI (no UI rewrite yet): add Svelte 5 (@sveltejs/vite-plugin-svelte) and Tailwind v4
  (@tailwindcss/vite) to Vite; create src/ui/bridge.ts (event bus → Svelte stores) and mount an empty
  <App/> overlay beside the existing DOM UI. Report the JS/CSS gzip delta (target: under 25 KB combined).
- Create src/shaders/ as the home of all TSL code: lib/ (noise, remap, ramps, fresnel, triplanar, hash),
  materials/, post/, vfx/. Every Fn() is unit-viewable in the shader sandbox.
Acceptance: LD0 shots match within a small tolerance (document any colour-transform shift and re-grade);
feel probe passes; both backends run; budgets unchanged or better.
```

### LD2 — Lighting and the custom stylised shading model (the biggest jump)
```
Replace matcap shading with ONE custom TSL shading model, "ArenaShade", written from scratch as a node
material (start from MeshBasicNodeMaterial or NodeMaterial and compute lighting yourself in colorNode/outputNode;
do NOT inherit PBR). Build it from small Fn() blocks in src/shaders/materials/arenaShade/:
- Sun: one directional light, the only real-time shadow caster. Read its shadow map yourself. Size it 2048 on high,
  1024 on medium, and off on low (blob shadows on low). Use a tight frustum around the car's neighbourhood,
  snapped to the texel grid so it doesn't shimmer. Filter with soft PCF, plus a 1-pixel penumbra widening by
  distance to the occluder for a soft, painterly edge.
- Diffuse: wrapped half-Lambert driven through a 1D **ramp texture** (a 256×1 strip per lighting preset).
  Use 3 soft bands: lit, terminator, core shadow. The ramp is art-directable.
- **Terminator warmth:** a narrow, saturated warm band where light turns to shadow, which reads as fake subsurface scattering and gives clay or toy plastic its richness.
- Shadow colour: shadowed albedo × the preset shadowColor (warm umber), plus a little sky-blue in the
  shadow core. Never multiply to grey.
- Sky fill: hemisphere sky/ground colours by normal.y. **Ground bounce:** apricot added to down-facing
  normals near the floor (height falloff × facing).
- Baked AO (the existing uv1 bakes) applies to the fill and bounce terms only, so the sun stays crisp.
- Rim light: a thin, view-dependent fresnel rim tinted by the sky. Stronger on the car and interactive objects,
  used as an affordance cue: hovering or nearing an interactive object raises its rim (ties to IxD).
- Stylised specular: a clamped, hard-edged highlight blob (smoothstep on N·H) for gold, glass, car paint and
  the "10". Matte everything else.
- Detail: triplanar noise breakup (≤ 4% value variation) so large surfaces never look flat-CG.
- Material variants from one shader: clay (default), paint (cart, signage), gold, glass (fake refraction from
  sky colour + fresnel + an inner gradient, no transmission), paper (a slight translucency boost), emissive (windows,
  portal, beacon) writing to an emissive MRT target for selective bloom.
- Palette-atlas colouring: a 64×8 palette texture; meshes pick colour by UV. One material instance per
  district → fewer draw calls. Keep the existing matcap path as the low-tier/WebGL2 fallback if ArenaShade
  measures too slow there.
- Cloud shadows: a scrolling, tiling noise texture projected along the sun direction that darkens the ground
  and objects (≤ 18% darkening, large soft shapes, about 0.6 m/s drift with the wind field). Off on low.
- Day-cycle presets as data (content/lighting.json): golden-hour (default), day, dusk, night (Decade Finale).
  Each preset sets sun dir/colour/intensity, sky colours, fog, shadow colour and bounce colour. Tween between them in 2 s.
- Re-grade: tone mapping AgX or Neutral (test both; pick by screenshot review), exposure, then an optional
  3D LUT grade node (warm highlights, slightly cool shadows, +8% saturation in mids).
Acceptance: every object shows a consistent sun direction, form shadow, terminator warmth and contact shadow;
the sandbox turntable reads as "premium painted toy", not "CG plastic"; ArenaShade ≤ 2 ms at 1080p high;
draw calls < 100; desktop 60 fps; low tier still ≥ 30 fps on the mobile profile.
```

### LD3 — Ground, terrain and paths (70% of the frame)
```
The floor sells the world. Replace the flat wash with:
- A terrain mesh (gentle 0–1.5 m undulation outside roads; flat drivable zones) authored in Blender with painted
  masks: grass, clay, stone paving, sand, flower beds. One splat/mask texture (KTX2) + palette colours in TSL.
- Roads: warm asphalt (#5B5550, not black) with a pale painted edge line and soft kerbs; the Deadline Loop gets
  dashed centre lines; Decade Drive gets inlaid year numbers in brass.
- Hand-laid stepping-stone tiles along footpaths (instanced, random model + jitter: our own take on "tiles").
- Floor typography: district names as inlaid paving letters (geometry or SDF decals), readable from the default camera.
- Edge of world: terrain rolls down into a soft haze "table edge" with fog, no hard cut.
- Car tracks: a 512² tracks render-target around the car; the terrain shader darkens it and the grass bends with it; fades over 8 s.
Acceptance: the ground shows ≥ 3 value steps in every bookmark; no tiling visible at default zoom.
```

### LD4 — Living nature: grass, foliage, wind, water
```
- Shared TSL wind field (direction, strength, noise) used by grass, foliage, flags, banners and particles.
- Grass: single-triangle blades in one geometry, looped around the camera focus (high: about 60k blades; medium: 25k;
  low: off → painted grass colour), tip colour gradient, pushed by the car via the tracks texture, shadow-aware.
- Trees: 3 stylised species (rounded canopy, columnar, flowering), instanced trunks + leaf-card canopies with an
  SDF/alpha-tested leaf texture; canopies near the car shrink or fade so the driver is never occluded.
- A reflecting pool at HQ and a small canal under Catalyst Bridge: stylised water (depth tint, animated normal,
  soft foam at edges from a distance-to-shore mask, fake reflection of sky colour; no SSR).
- Flowers and bushes as instanced clusters in district beds, using district accent colours.
Acceptance: the world moves gently at rest; GPU cost for nature ≤ 3 ms high / ≤ 1 ms medium; occlusion-free driving.
```

### LD5 — Hero assets and silhouettes (Blender 5.x)
```
Upgrade every greybox to final stylised art within budgets (props ≤ 5k, hero ≤ 50k, district ≤ 25k):
- Intro letters "PURSUIT ARENA": extruded from a licence-cleared bold rounded typeface, 30 cm bevel, ivory with a
  green top face; physics stays compound boxes. The "10": gold, chunky, with an engraved laurel band.
- Command Tower: a stepped, rounded glass-and-ivory tower with emissive window bands, a slowly rotating beacon ring
  and a rooftop garden; glass uses a cheap fake-refraction (env colour + fresnel), not transmission.
- Each district hero (doc 02) remodelled with one exaggerated signature shape plus secondary details (awnings, planters,
  benches, lamps, signage). Kit-bash shared pieces to save memory.
- The cart: add a seat-belted Pursuit Runner mannequin (a simple, friendly, original figure without a face or brand),
  rubber tyre sidewall detail via normal map, and emissive head/brake lights.
- Every asset: gltf-transform optimize --compress meshopt --texture-compress ktx2; Khronos validator; a row in
  docs/memory/assets.md (tris, textures, size, LODs).
Acceptance: each district reads in one glance from 40 m; budgets met; validator clean.
```

### LD6 — Camera language and cinematic moments
```
- Zone-aware camera angles: districts may define a camera preset (pitch, distance, FOV) eased in 2 s when entered
  (e.g. steeper over Decade Drive boards, lower and closer in the R&R Arena). This is our version of zone angles.
- Pan mode: drag on the ground to look around; any drive key eases back.
- Opening cinematic (skippable, ≤ 6 s): a crane-down from above HQ through morning haze → the reveal ring sweeps out
  from the RFP Gate, colouring the world from monochrome clay to full colour (a TSL reveal by distance) → the letters drop →
  the cart lands. Reduced-motion users get a 1 s cross-fade.
- Moment cams: stamp collected (0.8 s push-in + time slow 0.6×), Strike (orbit 90°), Dash finish (low hero angle),
  Decade Finale (rise to a wide night shot with fireworks over HQ). All are skippable by any input.
- Subtle camera life: 0.3° idle sway, landing dip, boost FOV +4° (existing), all scaled by reduced motion.
Acceptance: no motion sickness flags in the playtest; every cinematic interruptible within 100 ms.
```

### LD7 — Post-processing and lens
```
Write the post stack as our own TSL nodes in src/shaders/post/ (three's addon nodes are fine as building
blocks; check the current names and imports under three/addons/tsl/display before using them).
Optional high-tier additions, each judged by A/B screenshots and kept only if it clearly wins:
- Ambient occlusion pass (GTAO-style addon node) at half resolution, blended into the shadow colour, not black.
- Stylised outline: depth + normal edge detection, 1 px, coloured as a darker shade of the surface (not black),
  fading with distance. Use it on the car, props and hero landmarks only (stencil/ID mask), never on terrain.
- God rays from the sun through the HQ tower and trees (screen-space radial blur of a sun-occlusion mask,
  quarter resolution).
TSL RenderPipeline order: scene (MRT: colour, emissive, depth, normal) → [AO] → [outline] → selective bloom (emissive MRT, threshold 1,
strength 0.25–0.4, half-res) → tilt-shift DOF (screen-height-based blur, sharp band follows the car's screen Y;
off on touch/low) → height-and-distance fog (if not in materials) → colour grade (LUT) → vignette (0.25) →
film grain (0.03, animated) → chromatic aberration only at boost (≤ 0.002) → AA (SMAA high, FXAA medium) → output.
Quality gating per tier; each pass toggleable in #debug with its GPU ms shown.
Acceptance: total post ≤ 2.5 ms at 1080p high on the target laptop (≤ 3.5 ms with AO + outline + god rays);
the low tier keeps grade + FXAA only.
```

### LD8 — VFX finish and signature shaders
```
Signature shaders (our own TSL, each with a low-tier fallback, each in the sandbox first):
- Reveal: a world-space ring expands from the RFP Gate. Behind it, materials go from monochrome clay to full
  colour; on the ring itself, a thin emissive green edge plus rising paper-flake particles.
- Submission Portal: layered rings with domain-warped noise, scrolling energy bands, a fresnel shell, a refraction-like
  screen-UV distortion of what's behind it, and emissive output into the bloom MRT.
- Decade Drive arches: a light sweep that runs across the year numbers when the car passes (time-offset per arch).
- HQ glass: a fake interior (parallax "interior mapping" of a cube-room texture behind the windows), sky-gradient
  reflection by fresnel, and window lights that turn on in the dusk/night presets.
- Heat shimmer: screen-UV distortion behind the boost exhaust, masked to a small sprite.
- Holographic district signs: scanlines, a fresnel edge, flicker on approach, and a stable state after the stamp.
- Collectibles: glossy beads with a fake inner caustic (noise refracted by view direction) and an orbiting glint.
- Wind-driven cloth for flags and banners (vertex shader: a pinned edge, travelling sine plus noise from the wind field).
VFX restyle:
```
Restyle every pooled effect to the art direction (soft, round, warm, toy-like; no hard additive glare):
dust puffs coloured from the terrain under the wheel; skid marks into the tracks texture; boost = green ribbon
trail + heat shimmer; impact sparks by material class; collectible dots as glossy green beads with an orbiting
glint; golden dots with a slow god-ray sprite; stamp = an ink splash decal + a rising ring + a paper-confetti burst;
Decade Finale fireworks whose
shells form "10"; ambient dust motes in sun shafts; banners and flags cloth-like via vertex wind.
Acceptance: ≤ 1 ms VFX budget held; no GC spikes > 2 ms over a 5-minute drive.
```

### LD9 — Audio texture (real assets)
```
Replace procedural placeholders with licensed assets (CC0 or purchased; log in CREDITS.md):
- Vehicle: an engine loop set (idle/low/high crossfade), tyre roll on asphalt vs paving vs grass (surface from the
  terrain mask), suspension thumps, a boost whoosh, a two-tone horn, and a screech with cooldown.
- Impacts: per material class with randomised rate and volume and a minimum repeat delay.
- Ambience beds per district and a global wind bed tied to the wind field; birdsong in the golden-hour preset.
- Music: a 10th-anniversary theme with stems unlocked by passport progress; a sting for every badge (≤ 1.5 s).
- Spatialise everything (PannerNode HRTF on high, equal-power on low).
Acceptance: total audio ≤ 1.5 MB on the initial load (stream the music); no clipping at 12 voices; mute and sliders work.
```

### LD10 — UI finish and design system (Svelte 5 + Tailwind v4)
```
Rebuild every HTML overlay as Svelte 5 components styled with Tailwind v4, and make the UI feel like part of the
world, not a dashboard:
- Migration: port loader, start, HUD corners, minimap, toasts, content panel, Explore mode, passport screen, Esc
  menu, settings and credits one component at a time behind the bridge (src/ui/bridge.ts). Delete the old DOM
  module only when its Svelte twin passes the a11y and keyboard checks. 3D code never imports UI.
- Structure: src/ui/components/ (Chip, Panel, Sheet, Button, Toggle, Slider, Toast, ProgressGlyph, KeyHint),
  src/ui/screens/, src/ui/stores/ (derived from game events; persisted parts mirror the existing localStorage
  schema so nobody's progress resets).
- Tokens: define colour, type, spacing (8-pt), radius, shadow, blur and motion (durations 150/200/300 ms with one
  shared ease curve, also exported to the 3D tween library) in Tailwind's @theme; generate
  docs/memory/design-system.md from the same source so the two never drift.
- Type: scale 16/26/42/68 (φ) for display and 1.25 for UI; one self-hosted typeface family plus a display face for titles.
- Motion: Svelte transitions for UI (fly/scale/fade at token durations). All honour prefers-reduced-motion
  (instant or opacity-only).
- HUD: translucent warm-glass chips (backdrop-blur, 1 px light border), smaller, auto-hiding after 4 s; the passport
  ring becomes a "10"-shaped progress glyph; the minimap becomes a stylised compass medallion.
- In-world labels: district names, ENTER hints and instructions rendered as 3D/SDF text on the ground (our take on
  the reference's in-world labels), with the HTML overlay kept for accessibility (aria-live mirrors).
- Area interaction: a floor ring fill + a vertical gradient "fence" that pops up with an overshoot when interacting.
- Panels: 61.8/38.2 layout, district colour header, image gallery with blur-up placeholders, 200 ms eased transitions.
- Start screen in-world: the "10" fills with green as assets load, then a floor "Press Enter / Tap to start" label.
Acceptance: Lighthouse a11y 100; contrast AA; keyboard path intact; the UI covers ≤ 8% of the screen while
driving; Svelte + Tailwind add ≤ 25 KB gz total; the JS budget (≤ 300 KB gz excluding three) holds; no
saved progress lost across the migration.
```

### LD11 — Performance, loading and ship
```
- Loading: the hero chunk (base terrain + HQ + RFP Gate + cart + core audio) ≤ 5 MB; districts stream by distance with
  a warm "unfold" reveal; preload with <link rel=preload as=fetch crossorigin>.
- KTX2 everywhere (UASTC for masks/AO, ETC1S for colour), meshopt for meshes, Brotli-friendly build, immutable cache headers
  documented for hosting.
- Adaptive quality: start from a GPU/device heuristic, then watch live fps (3-flip hysteresis); tiers gate shadows,
  grass density, DOF, bloom, DPR (cap 2 high, 1.5 low).
- Dispose on district unload (verify renderer.info stays flat over 10 minutes).
- Final art review: compare LD0 vs LD11 shots side by side in docs/pursuit-arena/lookdev/REVIEW.md, with a checklist
  scored 1–5: composition, value hierarchy, palette discipline, lighting consistency, material richness, motion life,
  readability, UI integration, performance.
Acceptance: all budgets green on desktop and mobile profile; review average ≥ 4.5 / 5.
```

---

## PART 3 — Quality bar checklist (use in every review)
1. **Readability:** the car and the next objective are the most contrasted elements in every frame.
2. **Light logic:** one sun direction everywhere; shadows warm; contact shadows under everything that touches the ground.
3. **Material richness:** no flat untextured planes larger than 2 m² in view; every surface has a gradient, AO or a detail mask.
4. **Silhouettes:** every district is identifiable by shape alone (a squint test on a greyscale screenshot).
5. **Motion life:** something moves gently in every frame at rest.
6. **Feedback:** every input has a sound, a motion and a visual answer within 100 ms.
7. **Restraint:** brand green ≤ 15%, gold only for decade moments, and bloom only on emissives.
8. **Performance:** the budgets table is green, or the phase is not done.
