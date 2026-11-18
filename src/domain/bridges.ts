import { addDays, parseIso, MONTH_NAMES, type IsoDate } from './dates'
import { classifyDay, formatDays } from './allowance'
import type { BankHolidayIndex } from './bankHolidays'
import type { CompanyDayIndex } from './companyDays'
import type { DateRange, LeaveEntries } from './types'
import type { WorkPattern } from './workPattern'

/**
 * "Bridge" suggestions: short runs of working days sitting between days off,
 * where booking a few days of leave gives a much longer break.
 *
 * Rules (all based on `classifyDay`, so part-time patterns and company days
 * are respected):
 *
 * - A day is **off** if it is not a working day (non-working, bank holiday or
 *   company day) or the user has already booked it as a FULL day of leave.
 *   A half-booked day is NOT off: it is still a candidate and only needs the
 *   other half.
 * - A **bridge** is a maximal run of 1..`maxLeaveDays` consecutive candidate
 *   days (working days that are not fully booked) with off days directly on
 *   both sides. "Maximal" means the run is never a slice of a longer run.
 * - At least one of the two surrounding off-blocks must contain a bank holiday
 *   or company day, otherwise every short working week between two weekends
 *   (for example Mon-Wed for a part-timer) would count as a bridge.
 * - `totalDaysOff` is the length of the whole contiguous off streak once the
 *   run is booked: the run plus the off-blocks either side, which are walked
 *   outwards through consecutive off days, even beyond the leave year.
 * - Only runs lying entirely inside `range` and not starting before `today`
 *   are suggested.
 */
export interface Bridge {
  /** First and last day of the run to book. */
  start: IsoDate
  end: IsoDate
  /** Every day of the run, in order. */
  dates: IsoDate[]
  /** Days of leave to book: 1 per day, 0.5 for a day already half booked. */
  leaveDays: number
  /** First and last day of the whole streak off, once the run is booked. */
  offStart: IsoDate
  offEnd: IsoDate
  /** Length in days of that streak. */
  totalDaysOff: number
}

export interface FindBridgesInput {
  /** The leave year (or any range) to suggest within. */
  range: DateRange
  /** Runs starting before this date are left out. */
  today: IsoDate
  settings: WorkPattern
  leave: LeaveEntries
  holidays: BankHolidayIndex
  companyDays: CompanyDayIndex
  /** Longest run, in days, to suggest. Default 4. */
  maxLeaveDays?: number
}

export const DEFAULT_MAX_BRIDGE_DAYS = 4

/** Safety cap when walking an off-block outwards (a year's worth is plenty). */
const MAX_WALK = 366

/** Suggestions, best first: most days off per leave day, then longest break, then earliest. */
export function findBridges(input: FindBridgesInput): Bridge[] {
  const { range, today, settings, leave, holidays, companyDays, maxLeaveDays = DEFAULT_MAX_BRIDGE_DAYS } = input

  const kind = (d: IsoDate) => classifyDay(d, settings, holidays, companyDays)
  const isCandidate = (d: IsoDate) => kind(d) === 'working' && leave[d] !== 'full'

  /** Walk outwards from `from` (an off day) in direction `step`. */
  const walkOff = (from: IsoDate, step: 1 | -1) => {
    let edge = from
    let length = 0
    let special = false
    while (length < MAX_WALK && !isCandidate(edge)) {
      const k = kind(edge)
      if (k === 'bank-holiday' || k === 'company-day') special = true
      length += 1
      edge = addDays(edge, step)
    }
    return { edge: addDays(edge, -step), length, special }
  }

  const out: Bridge[] = []
  let d = range.start
  while (d <= range.end) {
    // Only start at the first day of a run. A run that began before the range is skipped whole.
    if (!isCandidate(d) || isCandidate(addDays(d, -1))) {
      d = addDays(d, 1)
      continue
    }
    // Collect the run, stopping one past the limit: that's enough to know it's
    // too long, and it keeps the loop bounded (e.g. a seven-day working week
    // in a year with no bank holiday data would otherwise never end a run).
    // The scan then resumes mid-run, where the "start of a run" check skips on.
    const dates: IsoDate[] = []
    let next = d
    while (dates.length <= maxLeaveDays && isCandidate(next)) {
      dates.push(next)
      next = addDays(next, 1)
    }
    const runEnd = addDays(next, -1)
    if (dates.length <= maxLeaveDays && runEnd <= range.end && d >= today) {
      const before = walkOff(addDays(d, -1), -1)
      const after = walkOff(next, 1)
      if (before.special || after.special) {
        out.push({
          start: d,
          end: runEnd,
          dates,
          leaveDays: dates.reduce((n, date) => n + (leave[date] === 'half' ? 0.5 : 1), 0),
          offStart: before.edge,
          offEnd: after.edge,
          totalDaysOff: before.length + dates.length + after.length,
        })
      }
    }
    d = next
  }

  return out.sort(
    (a, b) =>
      b.totalDaysOff / b.leaveDays - a.totalDaysOff / a.leaveDays ||
      b.totalDaysOff - a.totalDaysOff ||
      a.start.localeCompare(b.start),
  )
}

/** "22 Dec", "22–24 Dec" or "30 Nov – 2 Dec". */
export function formatBridgeDates(start: IsoDate, end: IsoDate): string {
  const s = parseIso(start)
  const e = parseIso(end)
  const mon = (m: number) => MONTH_NAMES[m - 1].slice(0, 3)
  if (start === end) return `${s.day} ${mon(s.month)}`
  if (s.month === e.month && s.year === e.year) return `${s.day}–${e.day} ${mon(s.month)}`
  return `${s.day} ${mon(s.month)} – ${e.day} ${mon(e.month)}`
}

/** "Book 3 days, get 10 days off" */
export function bridgeSummary(b: Bridge): string {
  return `Book ${formatDays(b.leaveDays)}, get ${b.totalDaysOff} days off`
}
