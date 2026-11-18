import data from '../data/bank-holidays.json'
import type { IsoDate } from './dates'
import type { BankHoliday, DateRange, Region } from './types'

/**
 * Shape of `src/data/bank-holidays.json`: a trimmed copy of
 * https://www.gov.uk/bank-holidays.json, refreshed by
 * `scripts/update-bank-holidays.mjs`.
 */
export interface BankHolidayData {
  source: string
  fetchedAt: string | null
  divisions: Record<Region, BankHoliday[]>
}

const bundled = data as BankHolidayData

export type BankHolidayIndex = Map<IsoDate, string>

export function bankHolidayIndex(
  region: Region,
  source: BankHolidayData = bundled,
): BankHolidayIndex {
  return new Map(source.divisions[region].map((h) => [h.date, h.title]))
}

/** First and last dates the dataset has bank holidays for, for this region. */
export function coverage(region: Region, source: BankHolidayData = bundled): DateRange | null {
  const dates = source.divisions[region].map((h) => h.date).sort()
  if (dates.length === 0) return null
  return { start: dates[0], end: dates[dates.length - 1] }
}

/**
 * Whether the dataset covers every calendar year touched by `range`.
 * GOV.UK publishes whole years, so checking years (not days) is enough.
 */
export function coversRange(range: DateRange, region: Region, source = bundled): boolean {
  const c = coverage(region, source)
  if (!c) return false
  return c.start.slice(0, 4) <= range.start.slice(0, 4) && c.end.slice(0, 4) >= range.end.slice(0, 4)
}
