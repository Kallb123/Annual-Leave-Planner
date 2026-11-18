import { addDays, daysInMonth, parseIso, toIso, type IsoDate } from './dates'
import type { DateRange, Settings } from './types'

type StartSettings = Pick<Settings, 'leaveYearStartMonth' | 'leaveYearStartDay'>

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

/** Human label, e.g. "2026" for a calendar year or "2026/27" otherwise. */
export function leaveYearLabel(range: DateRange): string {
  const start = parseIso(range.start)
  const end = parseIso(range.end)
  if (start.year === end.year) return String(start.year)
  return `${start.year}/${String(end.year).slice(-2)}`
}
