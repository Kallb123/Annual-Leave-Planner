import { addDays, dayOfWeek, daysBetween, type IsoDate } from './dates'
import type { Settings } from './types'

/** The settings that decide which days a person works. */
export type WorkPattern = Pick<Settings, 'workingDays' | 'workingDaysWeek2' | 'fortnightStart'>

/** The Monday on or before `date`. */
export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7))
}

/** Which week of the fortnight `date` falls in, counting Monday-first weeks from `fortnightStart`'s week (works before the anchor too). */
export function fortnightWeek(date: IsoDate, fortnightStart: IsoDate): 1 | 2 {
  const weeks = Math.round(daysBetween(mondayOf(fortnightStart), mondayOf(date)) / 7)
  // `%` keeps the sign of the dividend, so fold negatives into 0 or 1.
  return (((weeks % 2) + 2) % 2 === 0 ? 1 : 2)
}

/** The working days that apply in `date`'s week. */
export function workingDaysFor(pattern: WorkPattern, date: IsoDate): readonly number[] {
  if (pattern.workingDaysWeek2 && fortnightWeek(date, pattern.fortnightStart) === 2) return pattern.workingDaysWeek2
  return pattern.workingDays
}

/** True if `date` is one of the pattern's working days. */
export function worksOn(pattern: WorkPattern, date: IsoDate): boolean {
  return workingDaysFor(pattern, date).includes(dayOfWeek(date))
}

/** `fortnightStart` that makes `today`'s week be week `week`: Monday of today's week for 1, the Monday before that for 2. */
export function fortnightStartFor(today: IsoDate, week: 1 | 2): IsoDate {
  const monday = mondayOf(today)
  return week === 1 ? monday : addDays(monday, -7)
}
