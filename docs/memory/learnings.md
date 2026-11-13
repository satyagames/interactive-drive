# Learnings

- The Zoomforth export embeds all page data in `window.serverData` inside index.html (double-encoded JSON). Copy is in
  `tile_caption`, not `caption`; asset filenames and upload dates are in `assetsByIdent`. Section membership is NOT
  in the export (subpages loaded at runtime): only the home page is pre-rendered.
- Each person on the Our team page = a bio-PDF tile (its thumbnail is the "photo") + a text card. Bio thumbnails show
  personal details, so never use them as profile images.
- "CoP Profile | A&A / Tax / Advisory / Deloitte Private" in bio PDFs is the most reliable function signal. Shift 1/2
  tags mark the follow-the-sun Pursuits Design Studio. PACE = the agile, cross-functional pursuit team.
- In the linked-computer shell, files in connected folders cannot be deleted; write temp files to the system temp dir.
  The Windows node_modules cannot run vite in the Linux shell: build from a copy with its own `npm ci`.
- The iso camera has a fixed bearing (`settings.isoCamera.azimuth`), so floor text and standing plates should be
  oriented to it (`labels.js viewYaw`), not to the district frame, or they read sideways on screen.
- Pillar gateways sit right on the Outer Loop road: anything "in front of the gate" lands on the road. Place
  exhibits inside the plaza or check with `showcase.checkPlacement()` / a raycast sweep.
- Prop batches (`dynamicProps`) are never frustum-culled: keep per-prop triangle counts small when adding many.
- A hidden Browser pane pauses requestAnimationFrame: debug tests that await frames hang until the pane is shown.
- Shelf-packed atlases overflow fast when mixing wide headers and small tiles: pack headers first.
- Zoomforth: every section numbers its tiles 0..N; the cards created in one batch with (or just after) a team
  heading, filling that section's free positions, are that team. Several headings can share one section.
- Coplanar label quads z-fight at the iso camera distance: use polygonOffset on overlay materials, never mm lifts.
- Judge smoothness with synthetic uneven frames through `__proto.loop.step(dt)` (headless GPU is too slow for
  real-time tests); exclude camera-zone transitions from the measurement.
- Dev bundle with `__proto`: `NODE_ENV=development npx vite build --mode development`.
- Label lifts (12-40 mm) only z-fight at distance: sweep for flicker at max zoom as well as the default, and always
  run a control (depth offsets off) to prove the sweep can see fighting at all.
- A CV over a window still settling (the camera look-ahead, rate 3/s) measures the trend, not judder: use
  frame-to-frame differences for the camera.
- Synthetic `PointerEvent`s with `pointerId: 1, pointerType: 'mouse'` and `KeyboardEvent`s on `window` drive the
  real pan and key paths; with `post.render` stubbed the whole nav test runs in about 4 s.
- Rapier shape queries do not see colliders added since the last `world.step`: step before searching for clear
  spots right after districts stream in.
- A flicker "control" must plant a known coplanar pair; removing depth offsets proves nothing once depth
  precision is good. Identical coplanar quads do not fight: turn one so its depth rounds differently.
- Overlapping boxes of the same material still flicker: their AO bakes differ on the shared faces (HQ "1").
- Shell heredocs fail in this environment when the text has an odd number of apostrophes: write patch scripts
  with the Write tool instead.
- A key in `KEY_MAP` that should fire once must also be in `EDGE_ACTIONS`, or `input.consume` never sees it.
