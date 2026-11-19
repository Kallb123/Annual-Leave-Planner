import { describe, expect, it } from 'vitest'
import {
  formatMonthSpan,
  MAX_EXPORT_MONTHS,
  monthCount,
  monthSpanError,
  monthSpanSlug,
  monthsOfRange,
  rangeOfMonths,
  sameMonthSpan,
  type MonthSpan,
} from './exportRange'

const span = (sy: number, sm: number, ey: number, em: number): MonthSpan => ({
  start: { year: sy, month: sm },
  end: { year: ey, month: em },
})

describe('monthsOfRange', () => {
  it('gives the months a calendar-year range touches', () => {
    expect(monthsOfRange({ start: '2026-01-01', end: '2026-12-31' })).toEqual(span(2026, 1, 2026, 12))
  })

  it('handles a mid-month leave year that starts and ends in the same month name', () => {
    expect(monthsOfRange({ start: '2026-09-15', end: '2027-09-14' })).toEqual(span(2026, 9, 2027, 9))
  })

  it('handles a single-day range', () => {
    expect(monthsOfRange({ start: '2026-05-10', end: '2026-05-10' })).toEqual(span(2026, 5, 2026, 5))
  })
})

describe('rangeOfMonths', () => {
  it('runs from the 1st to the last day of the end month', () => {
    expect(rangeOfMonths(span(2026, 4, 2027, 3))).toEqual({ start: '2026-04-01', end: '2027-03-31' })
  })

  it('ends on 29 Feb in a leap year and 28 Feb otherwise', () => {
    expect(rangeOfMonths(span(2028, 1, 2028, 2)).end).toBe('2028-02-29')
    expect(rangeOfMonths(span(2027, 1, 2027, 2)).end).toBe('2027-02-28')
    expect(rangeOfMonths(span(2100, 2, 2100, 2)).end).toBe('2100-02-28')
    expect(rangeOfMonths(span(2000, 2, 2000, 2)).end).toBe('2000-02-29')
  })

  it('handles a single month and a year boundary', () => {
    expect(rangeOfMonths(span(2026, 6, 2026, 6))).toEqual({ start: '2026-06-01', end: '2026-06-30' })
    expect(rangeOfMonths(span(2026, 12, 2027, 1))).toEqual({ start: '2026-12-01', end: '2027-01-31' })
  })

  it('round-trips with monthsOfRange', () => {
    const s = span(2026, 11, 2028, 2)
    expect(monthsOfRange(rangeOfMonths(s))).toEqual(s)
  })
})

describe('monthCount', () => {
  it('counts months inclusively', () => {
    expect(monthCount(span(2026, 5, 2026, 5))).toBe(1)
    expect(monthCount(span(2026, 1, 2026, 12))).toBe(12)
    expect(monthCount(span(2026, 12, 2027, 1))).toBe(2)
    expect(monthCount(span(2026, 4, 2029, 3))).toBe(36)
  })

  it('is zero or negative when the end is before the start', () => {
    expect(monthCount(span(2026, 5, 2026, 4))).toBe(0)
    expect(monthCount(span(2027, 1, 2026, 1))).toBe(-11)
  })
})

describe('sameMonthSpan', () => {
  it('compares all four fields', () => {
    expect(sameMonthSpan(span(2026, 1, 2026, 12), span(2026, 1, 2026, 12))).toBe(true)
    expect(sameMonthSpan(span(2026, 1, 2026, 12), span(2025, 1, 2026, 12))).toBe(false)
    expect(sameMonthSpan(span(2026, 1, 2026, 12), span(2026, 2, 2026, 12))).toBe(false)
    expect(sameMonthSpan(span(2026, 1, 2026, 12), span(2026, 1, 2027, 12))).toBe(false)
    expect(sameMonthSpan(span(2026, 1, 2026, 12), span(2026, 1, 2026, 11))).toBe(false)
  })
})

describe('monthSpanError', () => {
  it('accepts a single month, a year and exactly the maximum', () => {
    expect(monthSpanError(span(2026, 5, 2026, 5))).toBeNull()
    expect(monthSpanError(span(2026, 4, 2027, 3))).toBeNull()
    expect(monthSpanError(span(2026, 4, 2029, 3))).toBeNull()
  })

  it('rejects more than the maximum number of months', () => {
    expect(MAX_EXPORT_MONTHS).toBe(36)
    expect(monthSpanError(span(2026, 4, 2029, 4))).toContain('36')
  })

  it('rejects an end before the start', () => {
    expect(monthSpanError(span(2026, 5, 2026, 4))).toMatch(/end month/i)
    expect(monthSpanError(span(2027, 1, 2026, 12))).toMatch(/end month/i)
  })

  it('rejects out-of-range or non-integer months and years', () => {
    const bad = 'Choose a month and a four-digit year for both ends.'
    expect(monthSpanError(span(2026, 0, 2026, 5))).toBe(bad)
    expect(monthSpanError(span(2026, 1, 2026, 13))).toBe(bad)
    expect(monthSpanError(span(2026, 1.5, 2026, 5))).toBe(bad)
    expect(monthSpanError(span(26, 1, 2026, 5))).toBe(bad)
    expect(monthSpanError(span(2026, 1, 10000, 5))).toBe(bad)
    expect(monthSpanError(span(NaN, 1, 2026, 5))).toBe(bad)
    expect(monthSpanError(span(2026, 1, 2026, NaN))).toBe(bad)
  })
})

describe('formatMonthSpan', () => {
  it('shows one month with its year', () => {
    expect(formatMonthSpan(span(2026, 5, 2026, 5))).toBe('May 2026')
  })

  it('shows the year once when both ends share it', () => {
    expect(formatMonthSpan(span(2026, 1, 2026, 12))).toBe('Jan – Dec 2026')
  })

  it('shows both years across a boundary', () => {
    expect(formatMonthSpan(span(2026, 4, 2027, 3))).toBe('Apr 2026 – Mar 2027')
    expect(formatMonthSpan(span(2026, 12, 2027, 1))).toBe('Dec 2026 – Jan 2027')
  })
})

describe('monthSpanSlug', () => {
  it('is filename-safe and zero-pads months', () => {
    expect(monthSpanSlug(span(2026, 5, 2026, 5))).toBe('2026-05')
    expect(monthSpanSlug(span(2026, 4, 2027, 3))).toBe('2026-04-to-2027-03')
    expect(monthSpanSlug(span(2026, 1, 2026, 12))).toBe('2026-01-to-2026-12')
    expect(monthSpanSlug(span(2026, 11, 2026, 12))).not.toMatch(/[\s/\\:]/)
  })
})
