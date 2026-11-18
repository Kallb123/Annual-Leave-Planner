import { describe, expect, it } from 'vitest'
import { addDays, dayOfWeek, daysInMonth, eachDay, isIsoDate, toIso } from './dates'

describe('dates', () => {
  it('formats and validates ISO dates', () => {
    expect(toIso(2026, 3, 7)).toBe('2026-03-07')
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('nope')).toBe(false)
  })

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30') // UK clocks change 29 Mar
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('computes day of week (0 = Sunday)', () => {
    expect(dayOfWeek('2026-11-18')).toBe(3)
    expect(dayOfWeek('2026-11-22')).toBe(0)
  })

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  it('lists days inclusively', () => {
    expect(eachDay('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })
})
