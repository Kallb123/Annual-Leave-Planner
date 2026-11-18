/**
 * Timezone-safe calendar date helpers.
 *
 * Every date in the app is a plain calendar date represented as an ISO string
 * (`YYYY-MM-DD`). We never use local-time `Date` objects for domain logic,
 * because they shift across DST boundaries and user timezones. Arithmetic is
 * done in UTC and converted straight back to an ISO string.
 *
 * ISO strings sort lexicographically, so `a < b` compares dates correctly.
 */

export type IsoDate = string

/** Month is 1-based (1 = January) throughout the app. */
export interface DateParts {
  year: number
  month: number
  day: number
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): value is IsoDate {
  const m = ISO_RE.exec(value)
  if (!m) return false
  const [, y, mo, d] = m.map(Number)
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

export function parseIso(date: IsoDate): DateParts {
  const m = ISO_RE.exec(date)
  if (!m) throw new Error(`Invalid ISO date: ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function toIso(year: number, month: number, day: number): IsoDate {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

function toUtcMs(date: IsoDate): number {
  const { year, month, day } = parseIso(date)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMs(ms: number): IsoDate {
  const d = new Date(ms)
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * 86_400_000)
}

/** 0 = Sunday … 6 = Saturday (matches `Date#getDay`). */
export function dayOfWeek(date: IsoDate): number {
  return new Date(toUtcMs(date)).getUTCDay()
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Inclusive list of every date from `start` to `end`. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Today's date in the user's local timezone, as an ISO date. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Column headers for a Monday-first week. */
export const WEEKDAY_INITIALS_MON_FIRST = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const
