/** Largest number of days a day-count setting may hold. */
export const MAX_DAY_COUNT = 366

export type DayCountResult = { ok: true; value: number } | { ok: false; error: string }

/**
 * Parse and validate text typed into a "number of days" field.
 *
 * Valid values are 0 to 366 inclusive. Valid values are rounded to the nearest
 * half day using `Math.round(n * 2) / 2`, the same rule as `toHalf` in
 * plannerState, so ties round up (0.25 -> 0.5, 25.25 -> 25.5, 25.3 -> 25.5, 25.2 -> 25).
 * Range checks use the typed value, so 366.2 is rejected rather than rounded.
 */
export function parseDayCount(text: string): DayCountResult {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, error: 'Enter a number of days.' }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return { ok: false, error: 'Enter a number, for example 25 or 25.5.' }
  }
  const n = Number(trimmed)
  if (n < 0) return { ok: false, error: 'Days cannot be negative.' }
  if (n > MAX_DAY_COUNT) return { ok: false, error: `Days cannot be more than ${MAX_DAY_COUNT}.` }
  return { ok: true, value: Math.round(n * 2) / 2 }
}
