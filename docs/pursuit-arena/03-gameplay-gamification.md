# 03 — Gameplay and gamification

## 1. Core loops
- **Second-to-second**: drive, drift, boost, smash props. The car must feel good in an empty field (doc 01).
- **Minute-to-minute**: arrive at a district → reveal animation → Enter areas → content panel → stamp.
- **Session**: fill the **Pursuit Passport**, collect dots, beat the **Deadline Dash**, unlock skins.
- **Return visits**: birthdays of the day, new "What's new" content, and a leaderboard of personal bests.

## 2. Systems
### 2.1 Pursuit Passport (main progression)
- 11 stamps: 6 territories plus 5 pillars. You earn a stamp by entering the district's **Gateway Area** and opening at least one content panel.
- The HUD passport icon fills segment by segment. The full passport triggers the **Decade Finale**: fireworks over HQ, the "10" monument glows, the credits roll on the floor, and the title "Pursuit Legend" appears.

### 2.2 Ranks (XP)
XP sources: stamp +100, content panel first-open +20, green dot +5, golden dot +50, shuriken +75, badge +150.
Ranks: **Bid Rookie** (0) → **Proposal Writer** (300) → **Solution Shaper** (800) → **Pursuit Lead** (1500) → **Win Strategist** (2500) → **Pursuit Legend** (full passport).

### 2.3 Collectibles
| Item | Count | Placement | Feedback |
|---|---|---|---|
| Green Dots | 100 | along racing lines and jump arcs | pentatonic chime rising with combo; magnet within 2 m |
| Golden Decade Dots | 10 | one per Decade Drive arch | big chime; the milestone board animates |
| Proposal Ninja Shuriken | 8 | hidden: on a rooftop via a ramp, under the bridge, inside the "0" loop… | whoosh; Dojo counter |

### 2.4 Deadline Dash (time trial)
1. Start at the RFP Gate pad → 3-2-1 countdown.
2. The objective chain is picked at random each run: **Qualify** checkpoint (one territory gateway) → **Write** (Toolkit or Studio) → **Review** (another territory) → **Submit** at the HQ Submission Portal.
3. A compass arrow points to the next checkpoint. Time penalties: +2 s per heavy collision ("scope creep").
4. Medals: Gold under 75 s, Silver under 100 s, Bronze under 130 s (tune in playtest). Personal best is saved locally. An optional shared leaderboard is a later phase that needs a backend and approval.
5. Finish: "SUBMITTED ✓ 2 min before deadline" with a confetti burst.

### 2.5 Mini-games (from doc 02)
Chart Stack (Audit), Coin Run (Tax), Idea Spark (Consulting), Pace Lap (PACE), Paint Trail (Studio, a sandbox), Bridge Run (Catalyst), Strike a Win (R&R), Red Tape Wall (Toolkit). Each awards one badge.

### 2.6 Achievements (badges)
First Drive · Decade Historian (all 10 golden dots) · Variance Found · Coin Collector · Bright Idea · Pole Position · Across Time Zones · Bright Strike · Red Tape Cutter · Proposal Ninja · Social Butterfly (open all 4 Culture stations) · Lifelong Learner · Toolkit Pro · Loop the 0 · Airtime (more than 2 s in the air) · Deadline Hero (Gold Dash) · Pursuit Legend.

### 2.7 Easter eggs
- **Konami code** (↑↑↓↓←→←→BA) → the cart turns into the golden "Decade Edition" with a trail of tiny 10s.
- Honk 10 times at HQ → the tower beacon flashes Morse "10".
- Drive through the "0" loop 10 times → hidden "v_final_FINAL_v10.pptx" trophy drops.

### 2.8 Skins (unlockables)
Default green, Ninja (shuriken), Golden Decade (Konami or full passport), Studio Paint-splash (Paint Trail 60 s).

## 3. Persistence and privacy
- `localStorage` (try/catch wrapped) holds passport, XP, badges, PBs, skin and settings. Provide "Reset progress".
- No analytics or network without explicit approval (AGENTS.md rule). If a leaderboard is approved later, use the firm-approved hosting and SSO; never collect personal data by default.

## 4. Onboarding and accessibility of play
- First 30 s: floor-painted key hints near spawn, the intro letters to bump into, and a single "Drive to the HQ" goal arrow.
- **Explore mode (no driving)**: a menu listing all districts and stations. Clicking one flies the camera there and opens the panel. This is required for accessibility and for executives in a hurry.
- Respects `prefers-reduced-motion` (no camera shake or fireworks flashing; reduced confetti).
