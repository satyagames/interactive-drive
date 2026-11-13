/**
 * The arena seed's `feeds` (birthdays, service awards, events): small lists
 * the Pursuits team edits in content/arena.seed.json without touching code
 * (docs/content-editing-guide.md). A station shows one by naming it in its
 * `feed` field; the station panel renders the entries these return.
 *
 * Dates are compared in the visitor's local time:
 *   birthdays  "--MM-DD" (month and day only, never a year of birth)
 *   events     "YYYY-MM-DD"; past events drop off on their own
 */
const pad = (n) => String(n).padStart(2, '0')

export function monthDay(date = new Date()) {
  return `--${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isoDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today's birthdays, or failing that this month's (sorted by day). */
export function birthdays(feeds, now = new Date()) {
  const list = feeds?.birthdays ?? []
  const today = monthDay(now)
  const todays = list.filter((b) => b.date === today)
  if (todays.length) return { scope: 'today', entries: todays }
  const month = today.slice(0, 5)
  return { scope: 'month', entries: list.filter((b) => b.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)) }
}

export function hasBirthdayToday(feeds, now = new Date()) {
  return (feeds?.birthdays ?? []).some((b) => b.date === monthDay(now))
}

/** Events from today on, soonest first. */
export function upcomingEvents(feeds, now = new Date()) {
  const today = isoDay(now)
  return (feeds?.events ?? []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
}

/** Service awards, longest service first. */
export function serviceAwards(feeds) {
  return [...(feeds?.serviceAwards ?? [])].sort((a, b) => b.years - a.years)
}
