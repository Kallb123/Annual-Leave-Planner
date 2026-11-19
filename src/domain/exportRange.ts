import { daysInMonth, MONTH_NAMES, parseIso, toIso } from './dates'
import type { DateRange } from './types'

/**
 * A whole-month span chosen for the PNG export, e.g. April 2026 to March 2027.
 * Month is 1-based, like everywhere else in the app.
 */
export interface YearMonth {
  year: number
  month: number
}

export interface MonthSpan {
  start: YearMonth
  end: YearMonth
}

/** Keeps the exported image a sensible size (three years at four months a row). */
export const MAX_EXPORT_MONTHS = 36

/** The months a date range touches, e.g. a 15 Sep – 14 Sep leave year gives Sep – Sep. */
export function monthsOfRange(range: DateRange): MonthSpan {
  const s = parseIso(range.start)
  const e = parseIso(range.end)
  return { start: { year: s.year, month: s.month }, end: { year: e.year, month: e.month } }
}

/** The 1st of the start month to the last day of the end month. */
export function rangeOfMonths(span: MonthSpan): DateRange {
  const { start, end } = span
  return { start: toIso(start.year, start.month, 1), end: toIso(end.year, end.month, daysInMonth(end.year, end.month)) }
}

/** Months in the span, inclusive; zero or less when the end is before the start. */
export function monthCount(span: MonthSpan): number {
  return (span.end.year - span.start.year) * 12 + (span.end.month - span.start.month) + 1
}

export function sameMonthSpan(a: MonthSpan, b: MonthSpan): boolean {
  return (
    a.start.year === b.start.year &&
    a.start.month === b.start.month &&
    a.end.year === b.end.year &&
    a.end.month === b.end.month
  )
}

/** Why the span can't be exported, or null when it can. */
export function monthSpanError(span: MonthSpan): string | null {
  const valid = (ym: YearMonth) =>
    Number.isInteger(ym.year) && ym.year >= 1000 && ym.year <= 9999 && Number.isInteger(ym.month) && ym.month >= 1 && ym.month <= 12
  if (!valid(span.start) || !valid(span.end)) return 'Choose a month and a four-digit year for both ends.'
  const count = monthCount(span)
  if (count < 1) return 'The end month must be the same as or after the start month.'
  if (count > MAX_EXPORT_MONTHS) return `Choose ${MAX_EXPORT_MONTHS} months or fewer.`
  return null
}

const short = (month: number) => MONTH_NAMES[month - 1].slice(0, 3)

/** "Apr 2026 – Mar 2027", "Jan – Dec 2026", or "May 2026" for a single month. */
export function formatMonthSpan(span: MonthSpan): string {
  const { start, end } = span
  if (start.year === end.year && start.month === end.month) return `${short(start.month)} ${start.year}`
  if (start.year === end.year) return `${short(start.month)} – ${short(end.month)} ${end.year}`
  return `${short(start.month)} ${start.year} – ${short(end.month)} ${end.year}`
}

/** Filename-safe form, e.g. "2026-04-to-2027-03" or "2026-05". */
export function monthSpanSlug(span: MonthSpan): string {
  const ym = ({ year, month }: YearMonth) => `${year}-${String(month).padStart(2, '0')}`
  return monthCount(span) === 1 ? ym(span.start) : `${ym(span.start)}-to-${ym(span.end)}`
}
