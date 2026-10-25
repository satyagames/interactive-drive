# Editing Pursuit Arena's content

For the USI Pursuits COE team: how to change what the arena says — station
text, pictures, links, the timeline, birthdays, service awards, events and
"What's new" — **without touching any code**.

Everything you'll edit lives in two text files:

| File | What's in it |
|---|---|
| `content/arena.seed.json` | Everything about the arena: every station's title, text, pictures and links; the leader's welcome; the 10-year timeline; the birthdays, service-award and events lists |
| `content/ui.json` | Interface wording: menu labels, hints, badge names, messages |

Pictures go in the folder `public/content/`.

> **Rules that always apply**
> - Never put a person's name, photo, achievement, metric or date in the
>   arena unless it's real and they (or the owner of that information) have
>   agreed to it.
> - Use only approved Deloitte brand assets. The logo goes in `public/brand/`
>   and only from the approved file.
> - Anything not yet final stays marked `"status": "placeholder"`, which shows
>   a visible "Content coming soon" or "sample" tag. Change it to `"final"`
>   only once the content is real and approved.

## 1. Before you start

- Open the files in **Visual Studio Code** (free). Because each file names
  its rule file (`"$schema"` on its first lines), VS Code underlines mistakes
  as you type — a missing comma, a misspelt field, a date in the wrong format.
- Change the **text inside the quotes** only. Keep every `"key":`, comma,
  bracket and brace as it is.
- **Never change an `"id"`.** Ids are how the 3D world finds a station
  (a station with id `culture_1` is opened by the floor area named
  `area_culture_1`). Renaming one disconnects it.

## 2. Edit a station

Every station looks like this (this is "Birthdays" in Culture Commons):

```json
{
  "id": "culture_1",
  "title": "Birthdays",
  "body": "Content to be supplied by the USI Pursuits COE team.",
  "image": "content/placeholder.svg",
  "links": [],
  "feed": "birthdays",
  "status": "placeholder"
}
```

| Field | What to put there |
|---|---|
| `title` | The station's heading. Keep it short. |
| `body` | The text. Plain text; a few sentences read best in the panel. |
| `image` | One picture: a file you put in `public/content/`, written as `content/<file name>`. PNG, JPG, WebP or SVG. Keep pictures under ~300 KB (a 1200 px wide JPG is plenty). |
| `images` | Instead of `image`, several pictures make a swipeable gallery: `"images": ["content/a.jpg", "content/b.jpg"]` |
| `links` | Buttons that open in a new tab: `[{ "label": "Proposal guide", "url": "https://..." }]`. Only `https://` or `mailto:` addresses. |
| `roles` | Optional lines under the title, e.g. a team lead: `[{ "name": "…", "role": "Team lead" }]`. Only with that person's consent. |
| `feed` | Optional: show one of the lists from section 4 in this panel. Only on the stations that already have it unless a developer agrees. |
| `status` | `"placeholder"` until the content is real and approved, then `"final"`. |

**"What's new"** is the L&D station `lnd_2`. Update its `body` (and `image`
and `links`) whenever there's news.

**The leader's welcome** is under `hq` → `leader`: `welcome` and `photo`.
Both need the leader's approval before `status` becomes `"final"`.

## 3. The 10-year timeline (Decade Drive)

Under `timeline` there is one entry per year, `year_1` to `year_10`:

```json
{ "id": "year_1", "label": "Year 1", "year": null, "title": "Milestone 1",
  "caption": "To be supplied.", "image": "content/placeholder.svg", "status": "placeholder" }
```

Set `year` to the real calendar year (a number such as `2016`, no quotes),
and fill in `title`, `caption` and `image`. Leave `year` as `null` until the
real year is confirmed — never guess.

## 4. Birthdays, service awards and events

These lists live at the bottom, under `feeds`. You can add or remove entries
freely; the panels and effects update themselves.

### Birthdays → the "Birthdays" station (Culture Commons)

```json
"birthdays": [
  { "name": "First name or display name", "date": "--03-14", "status": "final" }
]
```

- `date` is **month and day only**, written `--MM-DD` (two dashes first):
  `--03-14` is 14 March. A year of birth is rejected on purpose.
- The panel shows **today's** birthdays, or this month's if nobody's birthday
  is today. On the day, opening the station also fires a confetti cannon.
- Only add people who have agreed to have their birthday shown.

### Service awards → the "Service awards" station (Culture Commons)

```json
"serviceAwards": [
  { "name": "Display name", "years": 10, "status": "final" }
]
```

`years` is a whole number (5, 10, 15, 20, …). Longest service is listed first.

### Events → "Upcoming events & activities" (Innovation Lab)

```json
"events": [
  { "title": "Proposal Writing Masterclass", "date": "2026-11-12", "time": "15:00 IST",
    "place": "Hyderabad, Training Room 3",
    "link": { "label": "Register", "url": "https://..." }, "status": "final" }
]
```

- `date` is `YYYY-MM-DD`. Past events disappear on their own, so there's no
  need to delete them straight away.
- `time`, `place` and `link` are optional.

## 5. Interface wording (`content/ui.json`)

Menu items, hints, badge names and descriptions, messages. Change the text in
quotes; keep the `{braces}` — `{xp}`, `{title}` and the like are filled in by
the game.

## 6. Check it, then publish it

Content is built into the arena, so after editing someone with the project
set up (Node.js installed) runs, from the project folder:

```bash
npm run content:check
```

That checks both files against their rules and that every picture exists.
It names the exact line of any problem. Then:

```bash
npm run package:share
```

This builds the arena and writes `pursuit-arena-share.zip`. Unzip it
anywhere and double-click **Start Pursuit Arena** (`.bat` on Windows,
`.command` on Mac). It runs on that computer only and needs no internet. To
look at changes while editing, run `npm run dev` instead: the page reloads
on every save, and content mistakes appear in the browser console.

## 7. Quick reference — what not to do

| Don't | Why |
|---|---|
| Change an `"id"` | The 3D area for it stops working |
| Delete a station | Its area in the world stays, and opens nothing. Mark it `placeholder` and ask a developer instead. |
| Add new fields | They are rejected by `content:check` |
| Link to `http://` pages or files on a shared drive | Only `https://` and `mailto:` are allowed, and they open in a new tab |
| Put a year of birth in a birthday | Not stored, by design |
| Invent a name, number or date to fill a gap | Leave it `placeholder`; the arena shows "coming soon" |
