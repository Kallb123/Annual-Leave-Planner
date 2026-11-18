import type { WorkPattern } from '../domain/workPattern'

/** Small display helpers shared by the rail and summary components. */

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Mon–Fri", "Mon–Thu" or "Mon, Wed, Fri" (weeks start on Monday). */
export function workingDaysLabel(days: readonly number[]): string {
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d))
  if (ordered.length === 0) return 'No working days'
  if (ordered.length === 7) return 'Every day'
  const contiguous = ordered.every((d, i) => i === 0 || d === (ordered[i - 1] + 1) % 7)
  if (contiguous && ordered.length > 2) return `${DAY_SHORT[ordered[0]]}–${DAY_SHORT[ordered[ordered.length - 1]]}`
  return ordered.map((d) => DAY_SHORT[d]).join(', ')
}

/** "Mon–Fri" for a weekly pattern, "Mon–Fri / Mon–Thu" for a fortnightly one. */
export function workPatternLabel(pattern: WorkPattern): string {
  const week1 = workingDaysLabel(pattern.workingDays)
  return pattern.workingDaysWeek2 === null ? week1 : `${week1} / ${workingDaysLabel(pattern.workingDaysWeek2)}`
}

/** Share of the entitlement, as a CSS width, clamped to 0–100%. */
export const share = (n: number, of: number) => `${of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0}%`
