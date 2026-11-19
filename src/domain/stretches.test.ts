import { describe, expect, it } from 'vitest'
import { bankHolidayIndex } from './bankHolidays'
import { companyDayIndex, NO_COMPANY_DAYS } from './companyDays'
import { eachDay } from './dates'
import {
  formatStretchLength,
  longestStretchWithoutWeekOff,
  stretchMidpoint,
  type LongestStretchInput,
} from './stretches'
import { DEFAULT_SETTINGS, type LeaveEntries } from './types'

const holidays = bankHolidayIndex('england-and-wales')
const range = { start: '2026-01-01', end: '2026-12-31' }

function run(over: Partial<LongestStretchInput> = {}) {
  return longestStretchWithoutWeekOff({
    range,
    settings: { ...DEFAULT_SETTINGS, workingDays: [1, 2, 3, 4, 5] },
    leave: {},
    holidays,
    companyDays: NO_COMPANY_DAYS,
    ...over,
  })
}

function book(...ranges: [string, string][]): LeaveEntries {
  const leave: LeaveEntries = {}
  for (const [s, e] of ranges) for (const d of eachDay(s, e)) leave[d] = 'full'
  return leave
}

describe('longestStretchWithoutWeekOff', () => {
  it('is the whole leave year when no week off is booked', () => {
    // Easter (4 days) and Christmas (Fri 25 - Mon 28 Dec) are too short to count.
    expect(run()).toEqual({ start: '2026-01-01', end: '2026-12-31', days: 365, hasWeekOff: false })
  })

  it('splits the year around a booked week, counting the weekends either side', () => {
    // Mon 6 - Fri 10 Jul booked: Sat 4 - Sun 12 Jul off.
    const s = run({ leave: book(['2026-07-06', '2026-07-10']) })
    expect(s).toEqual({ start: '2026-01-01', end: '2026-07-03', days: 184, hasWeekOff: true })
  })

  it('finds the gap between two weeks off', () => {
    // Weeks off: Sat 14 - Sun 22 Feb, Sat 4 - Sun 12 Jul, Sat 17 - Sun 25 Oct.
    const s = run({
      leave: book(['2026-02-16', '2026-02-20'], ['2026-07-06', '2026-07-10'], ['2026-10-19', '2026-10-23']),
    })
    expect(s).toEqual({ start: '2026-02-23', end: '2026-07-03', days: 131, hasWeekOff: true })
  })

  it('counts a break that runs past the leave year end, and one made with bank holidays', () => {
    // Tue 29 - Thu 31 Dec booked: Fri 25 Dec - Sun 3 Jan 2027 off (10 days, clipped to 31 Dec).
    // Easter: Tue 7 - Fri 10 Apr booked joins Good Friday to Sun 12 Apr.
    const s = run({ leave: book(['2026-04-07', '2026-04-10'], ['2026-12-29', '2026-12-31']) })
    expect(s).toEqual({ start: '2026-04-13', end: '2026-12-24', days: 256, hasWeekOff: true })
  })

  it('needs seven days in a row by default', () => {
    // Wed 8 - Tue 14 Jul is exactly seven days off.
    const seven = run({ leave: book(['2026-07-08', '2026-07-10'], ['2026-07-13', '2026-07-14']) })
    expect(seven?.hasWeekOff).toBe(true)
    // Thu 9 - Tue 14 Jul is six.
    const six = run({ leave: book(['2026-07-09', '2026-07-10'], ['2026-07-13', '2026-07-14']) })
    expect(six?.hasWeekOff).toBe(false)
    expect(run({ leave: book(['2026-07-09', '2026-07-10'], ['2026-07-13', '2026-07-14']), minBreakDays: 6 })?.hasWeekOff).toBe(true)
  })

  it('ignores half days', () => {
    const leave = book(['2026-07-06', '2026-07-10'])
    leave['2026-07-08'] = 'half'
    expect(run({ leave })?.hasWeekOff).toBe(false)
  })

  it('counts a company closure as a week off', () => {
    const days = eachDay('2026-08-03', '2026-08-07').map((date) => ({
      id: date,
      date,
      name: 'Shutdown',
      deducted: true,
      repeatsAnnually: false,
    }))
    const s = run({ companyDays: companyDayIndex(days) })
    expect(s).toEqual({ start: '2026-01-01', end: '2026-07-31', days: 212, hasWeekOff: true })
  })

  it('is null when every day is off', () => {
    expect(run({ settings: { ...DEFAULT_SETTINGS, workingDays: [] } })).toBeNull()
  })
})

describe('formatStretchLength', () => {
  it('uses days under a fortnight and whole weeks after', () => {
    expect(formatStretchLength(1)).toBe('1 day')
    expect(formatStretchLength(13)).toBe('13 days')
    expect(formatStretchLength(14)).toBe('2 weeks')
    expect(formatStretchLength(184)).toBe('26 weeks')
  })
})

describe('stretchMidpoint', () => {
  it('is the middle day', () => {
    expect(stretchMidpoint({ start: '2026-01-01', days: 3 })).toBe('2026-01-02')
    expect(stretchMidpoint({ start: '2026-01-01', days: 184 })).toBe('2026-04-02')
  })
})
