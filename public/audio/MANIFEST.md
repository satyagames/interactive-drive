# Audio manifest

Every sound Pursuit Arena needs (doc 05 §3). **None of these files exist
yet**: each is synthesised in the browser by `src/audio/` (oscillators and
filtered noise) until real audio is supplied. When a file arrives, drop it
here, log it in `CREDITS.md`, and swap the matching synth voice for a buffer
player. The event wiring, voice limit, mixer and unlock logic stay as they are.

Format: Ogg Vorbis (`.ogg`) with an `.m4a` (AAC) twin for Safari, 44.1 or
48 kHz, mono unless noted, normalised to -1 dBFS peak, loops cut on zero
crossings. Budget: under 3 MB total, so they can stream after the first
load (rule 5's 10 MB first load).

"Licence source" is where a file should come from. **Commissioned** means
made for this project, with rights assigned to Deloitte. **CC0** means a CC0
library (e.g. Freesound filtered to CC0, or Sonniss GDC bundles under their
royalty-free licence), with the exact URL and author logged in `CREDITS.md`.
Nothing under an attribution-required or non-commercial licence.

| File | Use | Synth stand-in | Licence source |
|---|---|---|---|
| `engine_idle.ogg` | engine layer, low speed (loop) | `engine.js` layer 1 | CC0 or commissioned |
| `engine_mid.ogg` | engine layer, mid speed (loop) | `engine.js` layer 2 | CC0 or commissioned |
| `engine_high.ogg` | engine layer, top speed (loop) | `engine.js` layer 3 | CC0 or commissioned |
| `turbo_whine.ogg` | boost layer (loop) | sine whine + hiss | CC0 |
| `tyre_skid.ogg` | skid (loop) | band-passed noise | CC0 |
| `road_roll.ogg` | rolling rumble (loop) | low-passed brown noise | CC0 |
| `land_thud_{1..3}.ogg` | landing | sine drop + noise | CC0 |
| `impact_metal_{1..4}.ogg` | impacts, `sfx: metal` | inharmonic partials | CC0 |
| `impact_wood_{1..4}.ogg` | `sfx: wood` | knock + noise | CC0 |
| `impact_paper_{1..4}.ogg` | `sfx: paper` | high-passed swish | CC0 |
| `impact_plastic_{1..4}.ogg` | `sfx: plastic` | tick | CC0 |
| `impact_brick_{1..4}.ogg` | `sfx: brick` | thump | CC0 |
| `impact_rubber_{1..4}.ogg` | `sfx: rubber` | boing | CC0 |
| `chime_c5.ogg` | dot pickup, repitched up the pentatonic scale | bell (sine + octave) | commissioned |
| `chime_golden.ogg` | golden dot chord | C-E-G-C bells | commissioned |
| `shuriken_shing.ogg` | shuriken pickup | noise sweep + glide | CC0 |
| `stamp_thunk.ogg` | passport stamp | sine drop + noise | CC0 |
| `crowd_cheer.ogg` | stamp, Strike a Win, finale | swelling noise | CC0 |
| `beep_count.ogg`, `beep_go.ogg` | Dash countdown | square beeps | commissioned |
| `fanfare_submitted.ogg` | Dash finish | brass arpeggio | commissioned |
| `fanfare_finale.ogg` | Decade Finale (stereo) | brass + cheer | commissioned |
| `ui_badge.ogg`, `ui_rank.ogg`, `ui_open.ogg` | badge, rank, station open | arpeggios, blip | commissioned |
| `horn_dotdot.ogg` | horn | two-tone square | commissioned |
| `amb_wind.ogg` | arena air (stereo loop) | brown noise | CC0 |
| `amb_hq_office.ogg` | HQ office hum (loop) | brown noise + low pad | CC0 |
| `amb_studio_{pencil,keys}_{1..4}.ogg` | Studio grains | noise grains | CC0 |
| `amb_speedway.ogg`, `car_pass_{1..3}.ogg` | PACE bed + passes | band-passed noise, saw glide | CC0 |
| `amb_crowd.ogg`, `applause_{1..3}.ogg` | R&R | band-passed noise | CC0 |
| `amb_park_birds_{1..6}.ogg`, `amb_park_music.ogg` | Culture | chirps, soft pad | CC0 / commissioned (music) |
| `amb_innovation_pad.ogg` | Innovation (loop) | detuned saw pad | commissioned |
| `page_turn_{1..4}.ogg` | L&D | noise sweep | CC0 |
| `theme_{keys,bass,drums,lead}.ogg` | the 10th-anniversary theme stems, same length and tempo, stereo loops | `music.js` sequencer (108 bpm, 8 bars) | **commissioned** (the theme is the COE's own) |

Ambiences for the RFP Gate, Decade Drive, Audit, Tax, Consulting, Catalyst
and Toolkit are not in doc 05 and are silent. They need a sound-design
decision from the team first.
