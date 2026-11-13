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
