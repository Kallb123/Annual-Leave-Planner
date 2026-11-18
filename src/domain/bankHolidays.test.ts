import { describe, expect, it } from 'vitest'
import { bankHolidayIndex, coversRange, type BankHolidayData } from './bankHolidays'
import { dayOfWeek } from './dates'
import { REGIONS } from './types'
import bundled from '../data/bank-holidays.json'

const fixture: BankHolidayData = {
  source: 'test',
  fetchedAt: null,
  divisions: {
    'england-and-wales': [
      { date: '2026-01-01', title: 'New Year’s Day' },
      { date: '2027-12-28', title: 'Boxing Day' },
    ],
    scotland: [],
    'northern-ireland': [],
  },
}

describe('bank holidays', () => {
  it('indexes holidays by date', () => {
    expect(bankHolidayIndex('england-and-wales', fixture).get('2026-01-01')).toBe('New Year’s Day')
  })

  it('reports whether a range is covered', () => {
    expect(coversRange({ start: '2026-04-01', end: '2027-03-31' }, 'england-and-wales', fixture)).toBe(true)
    expect(coversRange({ start: '2027-04-01', end: '2028-03-31' }, 'england-and-wales', fixture)).toBe(false)
    expect(coversRange({ start: '2026-01-01', end: '2026-12-31' }, 'scotland', fixture)).toBe(false)
  })

  it('bundled data is well formed: sorted, unique, weekdays only', () => {
    const data = bundled as BankHolidayData
    for (const { id } of REGIONS) {
      const dates = data.divisions[id].map((h) => h.date)
      expect(dates.length).toBeGreaterThan(0)
      expect([...dates].sort()).toEqual(dates)
      expect(new Set(dates).size).toBe(dates.length)
      for (const d of dates) expect([0, 6]).not.toContain(dayOfWeek(d))
    }
  })
})
