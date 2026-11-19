import { addDays, daysBetween, type IsoDate } from './dates'
import { classifyDay } from './allowance'
import type { BankHolidayIndex } from './bankHolidays'
import type { CompanyDayIndex } from './companyDays'
import type { DateRange, LeaveEntries } from './types'
import type { WorkPattern } from './workPattern'

/**
 * The longest stretch of a leave year without a week off.
 *
 * - A day is **off** if it is not a working day (non-working, bank holiday or
 *   company day) or it is booked as a FULL day of leave, as in `findBridges`.
 * - A **week off** is a run of at least `minBreakDays` (default 7) consecutive
 *   off days. Runs are walked past the leave year's edges, so a Christmas break
 *   that spills into the next year is measured in full.
 * - A **stretch** is the days between two weeks off, or between the leave year's
 *   start or end and the nearest week off. With no week off at all, it is the
 *   whole leave year.
 */
export interface LongestStretch {
  /** First and last day of the stretch, inside the leave year. */
  start: IsoDate
  end: IsoDate
  /** Length in days, inclusive. */
  days: number
  /** False when no week off falls in the leave year, so the stretch is the whole year. */
  hasWeekOff: boolean
}

export interface LongestStretchInput {
  range: DateRange
  settings: WorkPattern
  leave: LeaveEntries
  holidays: BankHolidayIndex
  companyDays: CompanyDayIndex
  /** Consecutive days off that count as a week off. Default 7. */
  minBreakDays?: number
}

export const DEFAULT_MIN_BREAK_DAYS = 7

/** Safety cap when walking a break outwards past the leave year. */
const MAX_WALK = 366

/** The longest stretch without a week off, or null when weeks off leave no gap at all. Earliest wins a tie. */
export function longestStretchWithoutWeekOff(input: LongestStretchInput): LongestStretch | null {
  const { range, settings, leave, holidays, companyDays, minBreakDays = DEFAULT_MIN_BREAK_DAYS } = input
  const isOff = (d: IsoDate) => classifyDay(d, settings, holidays, companyDays) !== 'working' || leave[d] === 'full'

  /** Weeks off touching the leave year, as [start, end] clipped to it. */
  const breaks: [IsoDate, IsoDate][] = []
  let d = range.start
  while (d <= range.end) {
    if (!isOff(d)) {
      d = addDays(d, 1)
      continue
    }
    let start = d
    for (let i = 0; i < MAX_WALK && isOff(addDays(start, -1)); i++) start = addDays(start, -1)
    let end = d
    for (let i = 0; i < MAX_WALK && isOff(addDays(end, 1)); i++) end = addDays(end, 1)
    if (daysBetween(start, end) + 1 >= minBreakDays) {
      breaks.push([start < range.start ? range.start : start, end > range.end ? range.end : end])
    }
    d = addDays(end, 1)
  }

  let best: LongestStretch | null = null
  const consider = (start: IsoDate, end: IsoDate) => {
    if (end < start) return
    const days = daysBetween(start, end) + 1
    if (!best || days > best.days) best = { start, end, days, hasWeekOff: breaks.length > 0 }
  }

  let from = range.start
  for (const [start, end] of breaks) {
    consider(from, addDays(start, -1))
    from = addDays(end, 1)
  }
  consider(from, range.end)
  return best
}

/** "5 days" under a fortnight, else whole weeks rounded down, e.g. "12 weeks". */
export function formatStretchLength(days: number): string {
  if (days < 14) return days === 1 ? '1 day' : `${days} days`
  return `${Math.floor(days / 7)} weeks`
}

/** The middle day of a stretch, where a week off would split it most evenly. */
export function stretchMidpoint(stretch: Pick<LongestStretch, 'start' | 'days'>): IsoDate {
  return addDays(stretch.start, Math.floor((stretch.days - 1) / 2))
}
