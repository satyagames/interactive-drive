# CLAUDE.md — Pursuit Arena (Deloitte USI Pursuits COE · 10 Years)

@AGENTS.md

## What we are building
"Pursuit Arena": a drive-around 3D world celebrating 10 years of the Deloitte USI Pursuits COE.
The visitor drives a small arcade car around a stylised arena and explores the Pursuits HQ, six
team territories and five "pillar" districts (Innovation, R&R, Culture, L&D, Toolkit), with
gamification layered on top.

Driving feel, camera and world-interaction mechanics must match **https://2019.bruno-simon.com/**
(Bruno Simon's 2019 folio). Map, story, content, 3D objects, VFX and SFX are **ours**.

## Source-of-truth docs (read the relevant ones before each phase)
- `docs/pursuit-arena/01-reference-analysis.md`: deconstruction of the 2019 site and the vehicle/camera spec to match
- `docs/pursuit-arena/02-story-and-map.md`: story, arena layout with coordinates, territories, and the static/dynamic object lists
- `docs/pursuit-arena/03-gameplay-gamification.md`: loops, passport, collectibles, time trial, achievements
- `docs/pursuit-arena/04-blender-pipeline.md`: Blender 5.x modelling plus export rules, asset list and budgets
- `docs/pursuit-arena/05-vfx-sfx-ui.md`: VFX, SFX, IxD, UI, IA and the visual language
- `docs/pursuit-arena/06-phased-prompts.md`: the phase-by-phase build plan with acceptance criteria
- `content/arena.seed.json`: all arena content (IA) and the trigger-id mapping

## Hard rules
1. **Reimplement, never copy.** You may read the open-source folio-2019 repo to understand mechanics
   (check its LICENSE first). Do not copy its models, textures, sounds, fonts, images or text into this
   repo. Write our own code against our own architecture (Rapier, not cannon).
2. Keep the existing architecture and conventions from AGENTS.md: factory modules, `src/config.js`
   tunables, `collision_` / `spawn_` / `trigger_` Blender prefixes, no CDN or runtime network calls,
   relative asset paths, and accessible HUD.
3. All content strings come from `content/*.json`; never hard-code copy in JS.
   Content marked `"status": "placeholder"` must stay visibly marked until the Pursuits team supplies it.
   Never invent people's names, achievements, metrics or dates.
4. Brand: Deloitte Green `#86BC25` on black/white/neutral greys. Use the logo only from an approved asset
   supplied by the team (`public/brand/`). Use self-hosted fonts only.
5. Performance budget: 60 fps on a 2020 integrated-GPU laptop, under 150 draw calls and 250k triangles in view,
   under 10 MB first load (districts may stream later), and every dynamic body set to sleep when idle.
6. Every phase ends with `npm run build`, a manual drive-test checklist, and a short CHANGELOG entry.
7. When a decision is ambiguous and expensive to redo, stop and ask; otherwise choose, note it, and continue.
