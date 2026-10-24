# 05 — VFX, SFX, IxD, UI, IA and visual design

## 1. Visual language
- **Palette**: Deloitte Green `#86BC25` (accent, ≤ 15% of the frame), Black `#000000` (type, outlines), White and warm/cool neutrals (`#F4F2EC`, `#DADFE3`), plus district accents (desaturated, within the brand family):
  Audit teal `#0D8390`, Tax blue `#00A3E0`, Consulting dark green `#26890D`, PACE amber `#ED8B00`, Studio `#62B5E5`, Catalyst `#007680`; pillars: Innovation cyan, R&R gold `#E3B505`, Culture coral, L&D violet, Toolkit slate. **Confirm the exact values with the Deloitte brand guidelines before release.**
- **Type**: the team's approved web typeface, self-hosted, or Open Sans as a self-hosted fallback. In-world type is extruded or painted on the floor in large uppercase.
- **Lighting look**: matcaps plus baked AO plus floor gradient plus blob shadows, as in the reference. Optional "Golden Hour" mode tints the matcaps warm and turns on lamp-post emissives (activated at the Decade Finale).

## 2. VFX (all pooled and instanced; under 1 ms per frame total)
| Effect | Trigger | Technique |
|---|---|---|
| Tyre dust puffs | wheel slip above threshold or landing | instanced billboard sprites, 64-pool, fade/scale |
| Boost speed lines and exhaust | Shift | screen-space streak quads plus small green flame sprites |
| Skid marks | drift | ring-buffer ribbon mesh decal on the floor, fades over 6 s |
| Paint trail | Studio district | same ribbon in green; fades over 10 s |
| Impact sparks / paper flutter | collision by `sfx` class | metal → sparks; paper → flutter sheets; brick → red chips |
| Collectible sparkle and magnet | idle / within 2 m | vertex-shader bob plus spin, fresnel rim, pickup burst plus a "+5" floater |
| Area ring fill | entering `area_*` | floor ring shader with a progress uniform (reference pattern), plus a key hint `ENTER` |
| District reveal | first arrival | props drop with a stagger and bounce (GSAP-like custom tween); landmark scale-in with overshoot |
| Stamp | passport stamp | 3D stamp slams onto the floor, a green ink-splash decal, and a light pillar for 2 s |
| Confetti | Strike, Dash finish, birthdays | instanced quads with physics-lite (gravity plus drag), 400 max |
| Decade Fireworks | full passport, Konami | GPU particles in shells shaped like "10" and dots |
| Submission Portal | always | rotating rings, scrolling-UV energy shader, bloom (the only bright emissive) |
| Camera FX | boost, landing | FOV kick ±4°, micro-shake (disabled with reduced motion) |

Bloom: enable it only for emissive layers (selective bloom via a layer mask). See the existing `config.js` note on why global bloom fails with matcaps.

## 3. SFX and music (Web Audio; files in `public/audio/`, licence-logged in `CREDITS.md`)
- **Engine**: 2–3 looping layers (idle, mid, high) crossfaded by speed; pitch 0.8 → 1.8 by speed; gain plus throttle; boost adds a turbo whine layer.
- **Tyres**: skid loop with gain from slip amount. Landing thud scaled by vertical velocity.
- **Impacts**: choose a sample set by the `sfx` material class (paper, wood, metal, plastic, brick, rubber); volume and pitch from impact velocity; rate-limited to 1 per body per 80 ms and 12 voices max.
- **UI and game**: pickup chimes on a C-major pentatonic scale that climbs with the combo; golden dot = chord; stamp = ink "thunk" plus crowd cheer; countdown beeps; "submitted" fanfare; horn = two-tone "dot-dot".
- **Ambience** (`sfx_` emitters, PannerNode, distance-faded): HQ office hum; Studio pencil scratches and soft keyboard; Speedway distant engines; R&R crowd murmur and applause; Culture park birds and soft music; Innovation synth pad; L&D page turns.
- **Music**: one 10th-anniversary theme with stems (drums, bass, keys, lead). Stems unlock as the passport fills (adaptive music). Ducks under panels.
- Global mixer: Master / Music / SFX / Ambience sliders, a mute key `M`, and audio starts only after the first user gesture.

## 4. IxD (interaction design)
- Input: keyboard (WASD/arrows, Shift boost, Space brake, R reset, H horn, C camera, M mute, P passport, Esc menu, Enter interact), gamepad (Gamepad API), touch (left joystick, right boost/brake/interact).
- **Area interaction**: enter the zone → ring fills over 0.4 s → the ENTER hint appears → press Enter, tap, or stand still for 1.5 s → the panel opens and the car is gently held with a soft brake.
- Panels never block driving for more than one keypress; Esc closes them. Leaving the area auto-closes them after 1 s.
- Feedback for every action within 100 ms (sound plus motion).

## 5. UI (HUD and screens), minimal like the reference
- **Loading**: a black screen; the big "10" fills with Deloitte green as the assets load. Under it: "USI Pursuits COE · 10 Years". Then a **Start** button (also the audio unlock).
- **HUD** (corners, auto-hide after 4 s idle while driving): top-left passport ring (11 segments) plus rank; top-right dots count and settings gear; bottom-centre the contextual hint; bottom-right a compass/minimap (circular, rotates with the camera yaw, showing district icons and the next objective).
- **Content panel**: a right-side drawer on desktop and a bottom sheet on mobile. Header (district colour), title, team lead/role lines, image/gallery, body, links (open in a new tab), and a "Stamp collected" toast.
- **Menu (Esc)**: Resume · Explore mode (list) · Passport & badges · Controls · Audio · Graphics (Low/Med/High) · Reset progress · Credits.
- **Accessibility**: WCAG 2.2 AA contrast on panels; all UI reachable by keyboard; `aria-live` announcements for stamps and badges; reduced-motion support; captions on video; text never baked into textures for panel content.

## 6. Information architecture (maps the brief to the world)
```
Pursuit Arena
├── HQ — Command Tower
│   ├── Leader: Vineet K. Arora, SVP — USI Pursuits COE Lead (welcome)
│   ├── 10 Years timeline (Decade Drive)
│   └── Submission Portal (Deadline Dash finish)
├── I. Our Team (inner ring)
│   ├── Audit → Managers · Designers · Researchers
│   ├── Tax → Managers · Designers
│   ├── Consulting Services → Designers
│   ├── PACE → Managers · Designers
│   ├── Pursuit Studio → Designers
│   └── Israel Catalyst Team
├── II. Innovation Lab → Upcoming events & activities · The intelligent update · Behind the scenes · Calling all Proposal ninjas
├── III. R&R Arena → ApplauD · Reward and Excellence · Bright Star Awards
├── IV. Culture Commons → Birthdays · Service awards · Deloitte Chronicles · Insider Scoop
├── V. L&D Campus → What we did · What's new · Metrics and useful links
└── VI. Toolkit Depot → Time reporting guidance · Proposal writing guide · Quick links · Site contact
```
The same tree drives three things: the 3D placement (`area_` ids), the Explore-mode menu, and the Passport.
