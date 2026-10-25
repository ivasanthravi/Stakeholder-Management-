// Calendar-day arithmetic for due dates (`YYYY-MM-DD`). Server-side surfaces (signals, briefings, copilot) all count
// days the same way, so one record never reads "7 days overdue" in one place and "8" in another.
// The server has no user time zone, so "today" is the UTC date.
const DAY = 86_400_000

export const utcToday = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

/** Whole calendar days from today to `iso`: 0 = due today, -3 = three days overdue, 2 = due in two days. */
export function daysFromToday(iso: string, now = Date.now()) {
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(utcToday(now))) / DAY)
}
