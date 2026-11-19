import { addDays, daysInMonth, parseIso, toIso, type IsoDate } from './dates'
import type { DateRange, LeaveYearStart } from './types'

type StartSettings = LeaveYearStart

/** The date a leave year beginning in `year` starts on. */
export function leaveYearStartIn(year: number, settings: StartSettings): IsoDate {
  const month = settings.leaveYearStartMonth
  const day = Math.min(Math.max(1, settings.leaveYearStartDay), daysInMonth(year, month))
  return toIso(year, month, day)
}

/** The leave year that begins in calendar year `year`. */
export function leaveYearStartingIn(year: number, settings: StartSettings): DateRange {
  return {
    start: leaveYearStartIn(year, settings),
    end: addDays(leaveYearStartIn(year + 1, settings), -1),
  }
}

/** The leave year that contains `date`. */
export function leaveYearContaining(date: IsoDate, settings: StartSettings): DateRange {
  const { year } = parseIso(date)
  const startYear = date >= leaveYearStartIn(year, settings) ? year : year - 1
  return leaveYearStartingIn(startYear, settings)
}

/**
 * The leave year `offset` years forward/back from the one containing `today`.
 * Everyone's "this year" is the leave year they are in today, whatever its start date.
 */
export function leaveYearAtOffset(today: IsoDate, offset: number, settings: StartSettings): DateRange {
  const current = leaveYearContaining(today, settings)
  return leaveYearStartingIn(parseIso(current.start).year + offset, settings)
}

/** Every leave year (for this start date) that overlaps `range`, in order. */
export function leaveYearsOverlapping(range: DateRange, settings: StartSettings): DateRange[] {
  const out: DateRange[] = []
  let year = leaveYearContaining(range.start, settings)
  while (year.start <= range.end) {
    out.push(year)
    year = leaveYearStartingIn(parseIso(year.start).year + 1, settings)
  }
  return out
}

/** Human label, e.g. "2026" for a calendar year or "2026/27" otherwise. */
export function leaveYearLabel(range: DateRange): string {
  const start = parseIso(range.start)
  const end = parseIso(range.end)
  if (start.year === end.year) return String(start.year)
  return `${start.year}/${String(end.year).slice(-2)}`
}
