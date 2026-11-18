import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { DEFAULT_SETTINGS } from './types'
import { fortnightStartFor, fortnightWeek, mondayOf, workingDaysFor, worksOn, type WorkPattern } from './workPattern'

const nineDay: WorkPattern = {
  workingDays: [1, 2, 3, 4, 5],
  workingDaysWeek2: [1, 2, 3, 4],
  fortnightStart: '2026-11-16', // a Monday: week 1
}

describe('mondayOf', () => {
  it('returns the Monday on or before the date', () => {
    expect(mondayOf('2026-11-16')).toBe('2026-11-16') // Monday
    expect(mondayOf('2026-11-18')).toBe('2026-11-16') // Wednesday
    expect(mondayOf('2026-11-22')).toBe('2026-11-16') // Sunday belongs to the week before
    expect(mondayOf('2026-11-23')).toBe('2026-11-23')
  })

  it('crosses month and year boundaries', () => {
    expect(mondayOf('2027-01-01')).toBe('2026-12-28') // Friday
    expect(mondayOf('2024-03-01')).toBe('2024-02-26')
  })
})

describe('fortnightWeek', () => {
  it('alternates by Monday-first week from the anchor', () => {
    expect(fortnightWeek('2026-11-16', '2026-11-16')).toBe(1)
    expect(fortnightWeek('2026-11-22', '2026-11-16')).toBe(1) // Sunday ends week 1
    expect(fortnightWeek('2026-11-23', '2026-11-16')).toBe(2)
    expect(fortnightWeek('2026-11-29', '2026-11-16')).toBe(2)
    expect(fortnightWeek('2026-11-30', '2026-11-16')).toBe(1)
  })

  it('works before the anchor, including negative offsets', () => {
    expect(fortnightWeek('2026-11-15', '2026-11-16')).toBe(2) // Sunday just before
    expect(fortnightWeek('2026-11-09', '2026-11-16')).toBe(2)
    expect(fortnightWeek('2026-11-02', '2026-11-16')).toBe(1)
    // Cross-check against brute-force walking in both directions.
    for (let i = -60; i <= 60; i++) {
      const date = addDays('2026-11-16', i * 7 + 3)
      expect(fortnightWeek(date, '2026-11-16')).toBe(Math.abs(i) % 2 === 0 ? 1 : 2)
    }
  })

  it('crosses year boundaries', () => {
    // 2026-12-28 is 6 weeks after 2026-11-16, so week 1; 2027-01-04 is week 2.
    expect(fortnightWeek('2026-12-28', '2026-11-16')).toBe(1)
    expect(fortnightWeek('2027-01-01', '2026-11-16')).toBe(1)
    expect(fortnightWeek('2027-01-04', '2026-11-16')).toBe(2)
    expect(fortnightWeek('2025-12-31', '2026-11-16')).toBe(1) // 46 weeks before
    expect(fortnightWeek('2025-12-24', '2026-11-16')).toBe(2)
  })

  it('normalises an anchor that is not a Monday to its week', () => {
    expect(fortnightWeek('2026-11-17', '2026-11-19')).toBe(1)
    expect(fortnightWeek('2026-11-24', '2026-11-19')).toBe(2)
  })
})

describe('workingDaysFor / worksOn', () => {
  it('uses workingDays every week when there is no week 2', () => {
    const weekly: WorkPattern = { ...DEFAULT_SETTINGS, fortnightStart: '2026-11-16' }
    expect(workingDaysFor(weekly, '2026-11-25')).toEqual([1, 2, 3, 4, 5])
    expect(worksOn(weekly, '2026-11-27')).toBe(true)
  })

  it('picks the week 1 or week 2 days', () => {
    expect(workingDaysFor(nineDay, '2026-11-18')).toEqual([1, 2, 3, 4, 5])
    expect(workingDaysFor(nineDay, '2026-11-25')).toEqual([1, 2, 3, 4])
    expect(worksOn(nineDay, '2026-11-20')).toBe(true) // week 1 Friday
    expect(worksOn(nineDay, '2026-11-27')).toBe(false) // week 2 Friday
    expect(worksOn(nineDay, '2026-11-26')).toBe(true) // week 2 Thursday
    expect(worksOn(nineDay, '2026-11-21')).toBe(false) // Saturday
    expect(worksOn(nineDay, '2026-11-13')).toBe(false) // week 2 Friday, before the anchor
    expect(worksOn(nineDay, '2026-11-06')).toBe(true) // week 1 Friday, before the anchor
  })

  it('allows an empty week 2 (a week off)', () => {
    const p = { ...nineDay, workingDaysWeek2: [] }
    expect(worksOn(p, '2026-11-24')).toBe(false)
  })
})

describe('fortnightStartFor', () => {
  it('makes today’s week be the chosen week', () => {
    expect(fortnightStartFor('2026-11-18', 1)).toBe('2026-11-16')
    expect(fortnightStartFor('2026-11-18', 2)).toBe('2026-11-09')
    expect(fortnightStartFor('2026-11-22', 1)).toBe('2026-11-16') // Sunday
    expect(fortnightStartFor('2027-01-01', 2)).toBe('2026-12-21')
  })

  it('round-trips with fortnightWeek', () => {
    for (const today of ['2026-11-16', '2026-11-18', '2026-11-22', '2027-01-01', '2024-02-29']) {
      for (const week of [1, 2] as const) {
        expect(fortnightWeek(today, fortnightStartFor(today, week))).toBe(week)
      }
    }
  })
})
