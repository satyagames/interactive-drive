# 10 — Bringing the 2D site into the 3D arena

The 2D PursuitArena is the community's living archive: 103 colleagues, 27 photo albums, 13 newsletter issues,
20 Deloitte Chronicles champions, wins and recognition numbers, guides and 40+ tool links. This plan maps it onto the
3D arena in two layers:

1. **Layer 1, done in this pass:** every station panel now carries real copy, rosters, metrics, links, PDFs and images.
2. **Layer 2, next:** the same data drives 3D objects, so the world itself shows the numbers, the people and the stories.

## 1. Layer 1: what each station now shows
| Arena station | 2D source | Now in the panel |
|---|---|---|
| RFP Gate → How to drive | Home: Percy's welcome | Percy greeting + banner above the driving controls |
| HQ → Our COE at a glance | Home: welcome, services, Pursuit Wins | Welcome copy, menu of services, FY26 and FY25 win snapshots, team-faces banner |
| HQ → Leadership | Our team cards + leadership visit | 5 leaders (SVP, 2 AVPs, Strategic segment), Nov leadership-visit workshops, photo |
| Audit / Tax / Consulting / PACE / Studio stations | Our team page | Service description + roster (name · designation · tag) for high/medium-confidence members |
| Israel Catalyst Team | Our team page | Service line only: the roster is not identifiable in the export |
| Innovation → Upcoming events | Innovation | Innovation Lab survey link, "Design Alchemy S2 M2" teaser, banner |
| Innovation → The Intelligence Update | Innovation + 13 PDFs | Description + all 13 issues (Jun 2024 to Jun 2025) as PDFs |
| Innovation → Behind-the-scenes! | Innovation + IStory 1–5 | Copy, 5 tip titles with authors, 5 tip pages as a gallery |
| Innovation → Proposal Ninjas | Innovation | Call for ideas + Innovate to Evolve contacts |
| R&R → applauD | R&R | Recognition copy, Thank It Forward stats (4 / 41 / 72), CoinD link, banner |
| R&R → Reward and Excellence | R&R | Copy, Bravo Bulletin, SwagTags photos |
| R&R → BrightStar Awards | R&R | Q4 FY25 copy, nomination guidance, six category counts |
| Culture → Deloitte Chronicles | Culture | Latest episode + 20 champions featured, 3 issue covers |
| Culture → Insiders' Scoop | Culture + albums | Copy, latest covers, 12 album highlights, list of all albums |
| Culture → Birthdays / Service Anniversary | Culture | Copy and banner. **Names live only inside images**: needs a feed from the team |
| L&D → What we did / What's new / Metrics | L&D | Leadership-visit testimonials, design library, Science of Winning, CE guide PDF, 870 / 26 / 30 hours, 9 learning links |
| Toolkit → all four | Toolkit | 5 guides as PDFs (time reporting, T&E, FY27 bare minimum, PCoE guidance Sep 2026, style guide), 32 quick links, site-contact mailto |

Not shown in the arena, on purpose: emails (backup only), bio PDFs and their personal answers, "Did you know?" personal
fun facts, the 2020 skills survey (aggregates only), and low-confidence or unassigned team placements.

## 2. Layer 2: content-driven 3D (the next build phase)
Principle: **the data shapes the world.** Every object below reads `content/arena.seed.json` or `docs/content-backup/data/*.json`
at load, so the team updates JSON and the world changes with it.

### 2.1 Percy and the blob family (signature)
- **Percy**: a 3D version of the community's own mascot at the RFP Gate. A low-poly soft blob (≤ 1.5k tris), with a doodle face as a decal and squash-and-stretch idle. He turns to face the car, waves when you are near, and his speech bubble (HTML overlay, accessible) gives the greeting from the site.
- **Blob buddies, one per district**, in the 2D palette colours and holding their 2D props: R&R purple and orange with a trophy, L&D green and pink with a pencil, Toolkit with a notebook, Innovation with a laptop, Culture with a party hat. They give the next-objective hint ("Next stamp: …").
- Konami easter egg: all the blobs do a celebration hop. Decade Finale: blobs gather at HQ.
- Art: original models built from the 2D banners (doc 08). Matcap or ArenaShade "clay", 2 materials each, instanced where repeated.

### 2.2 HQ: numbers you can see
- **Pursuit Wins board**: a split-flap scoreboard on the tower plaza that flips between FY26 ($47M win revenue · $260M TCV · 240 pursuits) and FY25 ($35M · $310M · 275). Labels say "site snapshot" (the numbers are not decade totals).
- **Leadership balcony**: five name plaques from the Leadership roster. Photos only after consent.

### 2.3 Team territories: people as architecture
- **People of Pursuits wall** at each territory gateway: one engraved name tile per roster member (instanced, a single draw call), with designation underneath. Static and respectful: name tiles are never physics props.
- **Lit windows = team size**: each landmark lights one window per member, so team size reads from across the map.
- **Studio follow-the-sun clock**: a two-faced shift clock that lights Shift 1 or Shift 2 based on current IST (Design Studio's follow-the-sun model).
- **Research Insight Library**: book towers labelled with the research services (competitor analysis, track packs, ContactNet, RFP response search…).

### 2.4 Innovation Lab
- **Intelligence Update newsstand**: 13 issue covers (rendered from page 1 of each PDF into one texture atlas). Enter opens the issue. The newest is on top, with a "NEW" glow when a new file is added.
- **Behind-the-scenes pin board**: the 5 tip pages as pinned cards that flutter in the wind field.
- **Ninja Dojo**: the existing shuriken hunt, plus the Innovate to Evolve contacts on the dojo noticeboard.

### 2.5 R&R Arena
- **Thank It Forward trophy piles**: instanced physics trophies, with one per award (Spot 72, Applause 41, Outstanding 4), dropped into three glass bins. Data-driven and knockable, so the counts are fun to touch.
- **BrightStar constellation**: six star sculptures scaled by category count (Team Terrific 16 is the giant), with a name label on each.
- **applauD wall**: the clapping-hands mural from the 2D banner; driving past triggers a short applause SFX.

### 2.6 Culture Commons
- **Memory Lane gallery**: 27 photo frames along a curved path, one per album, with the album cover as texture (atlas streamed only when you are within 40 m). Enter opens the album gallery.
- **Chronicles newspaper kiosk**: the 20 champions' names roll on a ticker. The latest episode's cover sits in the kiosk window.
- **Insiders' Scoop cart**: cycles the latest covers and opens Photo Mode.
- Birthday cake carousel and service-anniversary pillars light up from the feeds once the team supplies them.

### 2.7 L&D Campus and Toolkit Depot
- **Learning bar garden**: three planted bars whose heights are the 870 / 26 / 30 hours (log-scaled, labelled).
- **Design library shelf**: books from the "Explore the world of design" post.
- **Signpost forest (Toolkit)**: one fingerpost per quick link (32), grouped by Find it fast / Function / Others. Enter opens the link. The PDFs appear as giant binders on the toolbox shelves.

### 2.8 Decade Drive
Use the draft milestones in doc 09 (2018–2026 archive evidence) only after the team confirms Years 1–10. Until then, the arches show the year label and "Your milestone here".

## 3. Gamification hooks (meaningful, not clicky)
| Hook | Rule | Reward |
|---|---|---|
| Meet the team | Open all six territory rosters | Badge "People of Pursuits" |
| Read the room | Open 3 Intelligence Update issues | Badge "Gen AI Insider" |
| Champion hunt | Find the 20 Chronicles champions' name plates hidden around the arena (one per plate) | Badge "Chronicles Collector" |
| Thank it forward | Knock over all 117 R&R trophies | Badge "Spot On" (the existing Strike-a-Win style) |
| Memory Lane | Visit 10 photo albums | Badge "Memory Maker" |
Rules live in `content/arena.seed.json → gamification` (project rule §9). Link clicks never award XP.

## 4. Budgets
- Panels: images 2.1 MB and PDFs 10.7 MB, all lazy (none in the first load). JS unchanged.
- Layer 2 additions: ≤ 25 draw calls (instancing: name tiles, trophies, frames, signposts), ≤ 40k tris, texture atlases ≤ 2 × 2048² KTX2, streamed per district.

## 5. Privacy and consent checklist
- [ ] Confirm each person may appear by name and designation in the arena (`data/people.csv → show_in_arena_consent`).
- [ ] Photos of people (albums, banners) only with the site owners' OK for the 3D experience.
- [ ] Internal documents (time reporting, T&E guide, bare minimums, style guide) stay inside the firm: host the build internally only.
- [ ] Keep the repo private (it now contains internal content). Email-bearing backup files are git-ignored.

## 6. Open questions for the Pursuits team
1. Confirm the team rosters, starting with the 17 unassigned colleagues and the Israel Catalyst Team (`data/people.csv`).
2. Supply this year's birthdays and service anniversaries (month-day only) for the feeds.
3. Confirm Years 1–10 for the Decade Drive (founding year and one milestone per year).
4. OK to use Percy and the blob family as 3D characters?

## 7. Claude Code prompt for Layer 2
```
Read CLAUDE.md, docs/content-backup/00-README.md, 08-brand-and-mascots.md, 10-3d-integration-plan.md and
docs/pursuit-arena/10-aaa-lookdev-prompt.md. Implement Layer 2 (§2 of the integration plan) as phase LD-C, one
district per commit, in this order: Percy at the RFP Gate → HQ wins board → team People-of-Pursuits walls → R&R
trophies and BrightStar → Culture Memory Lane → Innovation newsstand → L&D garden → Toolkit signposts.
Rules: every object reads its data from content JSON (no hard-coded copy or numbers); instanced geometry; textures
streamed per district; respect privacy rules in §5; add the §3 badges to the gamification data; keep feel-probe,
content:check and build green; measure draw calls and GPU ms per district and record them in docs/memory/progress.md.
Model Percy and the blobs as original low-poly characters from the 2D banners (doc 08), via blender/scripts.
```
