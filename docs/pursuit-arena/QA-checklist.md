# Pursuit Arena — QA checklist

Run before every hand-over. Status as of **Phase 11 (2026-10-25)**:
✅ passed · ⚠️ passed with a caveat · ❌ open, with an owner · ⏳ not testable here, with an owner.

Owners are roles, not people: **Dev** (whoever maintains this repo),
**COE content** (the USI Pursuits COE content owner), **Brand** (Deloitte brand
approval), **QA-Mac** (anyone with a Mac + iPhone), **QA-Android** (anyone
with an Android phone), **QA-laptop** (anyone with a 2020-era
integrated-graphics laptop).

How to re-run the automated parts: see "Re-running" at the end.

## 1. Build and tooling

| Check | Status | Evidence |
|---|---|---|
| `npm run build` | ✅ | Production build passes |
| `npm run content:check` | ✅ | 43 content nodes valid; 40 still placeholder (expected until content arrives) |
| `npm run probe:feel` (car feel vs the reference) | ✅ | All feel targets within tolerance |
| `npm run art:build` (gen → polish → validate → export → cart) | ✅ | All budgets pass; 43/43 content areas |
| Schema rejects bad content | ✅ | Wrong feed name, a birthday with a year, non-integer award years and an impossible event date each fail with a precise message |

## 2. Content and IA (doc 05 §6)

| Check | Status | Evidence |
|---|---|---|
| Every content node opens by driving into its area | ✅ | 43/43: car dropped in each `area_`, panel opened by dwell with the right title |
| Every content node is in Explore | ✅ | 43 Explore entries = 43 content ids |
| Placeholder content visibly marked | ✅ | "Content coming soon" on panels; "sample" on placeholder feed entries; "coming soon" on team credits |
| Feeds render (birthdays, service awards, events) | ✅ | Birthdays: this month's sample entry, tagged "sample"; awards / events: friendly empty states |
| Real content supplied | ❌ | **COE content**: station text, images, timeline years, leader welcome + photo, birthdays / awards / events (docs/content-editing-guide.md) |
| Brand assets and palette confirmed | ❌ | **Brand**: approved logo in `public/brand/`, self-hosted font files, confirm #86BC25 and the five arena matcap colours |

## 3. Gameplay

| Check | Status | Evidence |
|---|---|---|
| All 17 badges earnable through the real detection paths | ✅ | `runGameTest` from a clean store: 17/17, 11 stamps, rank Pursuit Legend, 5,175 XP |
| Progress persists; two-step reset | ✅ | Verified in Phase 6; this run backed up and restored a store across reloads |
| Deadline Dash start → finish | ✅ | Covered by the badge test (Deadline Hero) |
| Props settle and sleep, nothing falls through the floor | ✅ | Phase 7: every district visited, all props asleep within 3 s, none below the floor |

## 4. Inputs

| Check | Status | Evidence |
|---|---|---|
| Keyboard driving: W/↑, S, A/D, Shift, Space, Ctrl | ✅ | Held keys: forward 13.7 m/s, reverse −14.1, steer ±0.53, boost, brake |
| Keyboard actions: C, H, R, P, M, Esc, Enter | ✅ | Real key presses: camera toggles, horn hop (5.9 m/s up), respawn to nearest spawn, Passport opens, mute toggles, menu opens, Enter on Start starts |
| Gamepad (standard mapping) | ⚠️ | Software stand-in only (no physical pad here): RT drives, stick steers, X boost, B brake, Y camera, D-pad up Passport, Menu opens menu. Physical-pad pass **QA-Mac / QA-Android** (any pad) |
| Gamepad can navigate the menu | ❌ | The menu opens, but focus can't be moved with the pad. **Dev** (focus-navigation layer) |
| Touch: joystick, buttons, menu, panels at phone size | ✅ | 375 × 812 emulation: the joystick drags the car forward, respawn tap works, the Menu button opens the menu; Phase 9 checked 360 px |
| Touch on real devices | ⏳ | **QA-Mac** (iPhone Safari), **QA-Android** (Chrome) |

## 5. Browsers and devices

| Check | Status | Evidence |
|---|---|---|
| Chrome (desktop) | ✅ | Chrome 155 headless + the in-app browser: boot, Start, drive, menu, no errors |
| Edge (desktop) | ✅ | Edge 156 headless: same, no errors |
| Firefox | ⏳ | Not installed here. **QA-Mac** or **Dev** |
| Safari (macOS) | ⏳ | Needs a Mac (WebGL2 + the audio fallbacks `webkitAudioContext` / `setPosition` untested). **QA-Mac** |
| iOS Safari, Android Chrome | ⏳ | **QA-Mac**, **QA-Android** (check: touch pad shows, bottom-sheet panels, audio starts on Start, 30+ fps) |
| 60 fps on the 2020 integrated-GPU laptop target | ⏳ | Measured only on an RTX 4080 SUPER (60 fps, p99 16.9 ms). **QA-laptop**: try High, then Medium and Low from Menu → Graphics |

## 6. Accessibility

| Check | Status | Evidence |
|---|---|---|
| Lighthouse accessibility ≥ 95 on the menu screens | ✅ | 100 on all ten steps (load, Start, menu + 4 views, Passport, Sound, a station panel with a feed) at 1280 px; Phase 9: 100 at 360 px |
| Full keyboard operation | ✅ | Phase 9 keyboard paths; focus returns to the game canvas after closing menu screens |
| Reduced motion | ✅ | Edge with `prefers-reduced-motion: reduce`: boots, no errors; Phase 7 checks (no camera kick, no speed lines, less confetti) |
| `aria-live` announcements (stamps, badges, mute) | ✅ | Toasts region + announcer (Phases 6, 8) |
| Screen-reader pass (NVDA / VoiceOver) | ⏳ | **QA-Mac** (VoiceOver), **Dev** (NVDA) |

## 7. Performance budgets (rule 5)

| Check | Status | Evidence |
|---|---|---|
| First load < 10 MB | ✅ | 7.8 MB raw, 5.3 MB gzipped; the outer ring streams 1.2 MB later |
| < 150 draw calls, < 250k triangles in view | ✅ | Worst 117 calls, 85k triangles over 101 positions |
| VFX < 1 ms, no GC spikes > 2 ms | ✅ | Phase 7 measurements |
| Dynamic bodies sleep when idle | ✅ | Phase 7 |

## 8. Offline share package

| Check | Status | Evidence |
|---|---|---|
| `npm run package:share` works on Windows | ✅ | Fixed this phase (it used to need `npm` and `zip` on PATH as plain executables). Writes `share/` (9.3 MB) and `pursuit-arena-share.zip` (4.9 MB) |
| Zip extracts intact | ✅ | Windows' own extraction gives a folder identical to `share/`; the Mac launcher is stored executable (`-rwxr-xr-x`) |
| Runs offline | ✅ | Both bundled servers (`serve.py` via `py -3`, `serve.mjs` via Node) served the unzipped folder; Chrome and Edge ran it with every off-machine request blocked: **0 off-machine requests**, no errors |
| Windows launcher picks a working runtime | ✅ | The Microsoft Store `python` stub (exit 9009) is skipped; `py -3` is used, Node as the fallback |
| Mac launcher on a real Mac | ⏳ | **QA-Mac**: unzip, double-click `Start Pursuit Arena.command` (first time: right-click → Open, because it's unsigned) |

## Open items (owners)

1. **COE content**: all station content, images, timeline years, leader welcome + photo, feeds.
2. **Brand**: approved logo, self-hosted fonts, confirmed palette (including the five Phase 10 matcap colours).
3. **QA-laptop**: frame rate on the target laptop, per quality tier.
4. **QA-Mac**: Safari, iOS Safari, VoiceOver, the Mac launcher, real touch.
5. **QA-Android**: Android Chrome, real touch.
6. **Dev**: gamepad menu navigation; KTX2 textures once `toktx` is installed (JPEG bakes are within budget meanwhile); Firefox pass; NVDA pass; real audio files (`public/audio/MANIFEST.md`) once supplied.
7. **Dev + COE**: the placeholder theme and sounds are synthesised; replace with commissioned audio (`CREDITS.md` logs each file).

## Re-running

- **Content**: `npm run content:check`.
- **Every content node / every badge**: dev server, `#debug`. **Debug → Run badge test** runs the badge path from a clean store (back up first: it wipes progress). The area sweep is a console snippet; see the Phase 11 CHANGELOG entry.
- **Accessibility**: Lighthouse user flow over the menu screens (Chrome DevTools → Lighthouse → "Timespan" / "Snapshot" for each screen, or the Lighthouse Node API).
- **Offline**: `npm run package:share`, unzip, turn Wi-Fi off (or unplug), double-click the launcher. (DevTools' "Offline" mode won't do: it blocks the local server too.)
