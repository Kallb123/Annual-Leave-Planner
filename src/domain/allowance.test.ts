import { describe, expect, it } from 'vitest'
import { classifyDay, formatDays, overAllocatedDates, overEntitlementMessage, summarise } from './allowance'
import { DEFAULT_SETTINGS, type Settings } from './types'

const holidays = new Map([
  ['2026-12-25', 'Christmas Day'], // Friday
  ['2026-12-28', 'Boxing Day (substitute day)'], // Monday
])
const range = { start: '2026-01-01', end: '2026-12-31' }
const settings: Settings = { ...DEFAULT_SETTINGS, allowanceDays: 25, carryOverDays: 2 }

describe('classifyDay', () => {
  it('distinguishes working, non-working and bank holidays', () => {
    expect(classifyDay('2026-11-18', settings, holidays)).toBe('working')
    expect(classifyDay('2026-11-21', settings, holidays)).toBe('non-working')
    expect(classifyDay('2026-12-25', settings, holidays)).toBe('bank-holiday')
  })

  it('respects custom working patterns', () => {
    const fourDay = { workingDays: [1, 2, 3, 4] }
    expect(classifyDay('2026-11-20', fourDay, holidays)).toBe('non-working') // Friday
  })
})

describe('summarise', () => {
  it('counts full and half days inside the leave year only', () => {
    const leave = {
      '2026-11-18': 'full',
      '2026-11-19': 'half',
      '2027-01-05': 'full', // next leave year
    } as const
    expect(summarise(range, settings, leave, holidays)).toEqual({
      entitlement: 27,
      booked: 1.5,
      bankHolidaysDeducted: 0,
      remaining: 25.5,
    })
  })

  it('ignores leave stored on days that are no longer bookable', () => {
    const leave = { '2026-11-21': 'full', '2026-12-25': 'full' } as const
    expect(summarise(range, settings, leave, holidays).booked).toBe(0)
  })

  it('deducts bank holidays on working days when configured', () => {
    const s = { ...settings, bankHolidaysDeducted: true, workingDays: [1, 2, 3, 4] }
    // Christmas (Fri) isn't a working day for a Mon–Thu worker; Boxing Day substitute (Mon) is.
    const result = summarise(range, s, {}, holidays)
    expect(result.bankHolidaysDeducted).toBe(1)
    expect(result.remaining).toBe(26)
  })
})

describe('overAllocatedDates', () => {
  // 2026-11-02 is a Monday; Mon-Fri working.
  const tight: Settings = { ...DEFAULT_SETTINGS, allowanceDays: 2, carryOverDays: 0 }
  const none = new Map<string, string>()

  it('is empty when nothing is over', () => {
    const leave = { '2026-11-02': 'full' } as const
    expect([...overAllocatedDates(range, tight, leave, none)]).toEqual([])
  })

  it('is empty when exactly at the limit', () => {
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full' } as const
    expect([...overAllocatedDates(range, tight, leave, none)]).toEqual([])
  })

  it('marks the days past the limit when over by a full day', () => {
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full', '2026-11-04': 'full' } as const
    expect([...overAllocatedDates(range, tight, leave, none)]).toEqual(['2026-11-04'])
  })

  it('counts a half day straddling the limit as over', () => {
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full', '2026-11-04': 'half' } as const
    expect([...overAllocatedDates(range, tight, leave, none)]).toEqual(['2026-11-04'])
    const straddle = { '2026-11-02': 'full', '2026-11-03': 'half', '2026-11-04': 'full' } as const
    expect([...overAllocatedDates(range, tight, straddle, none)]).toEqual(['2026-11-04'])
  })

  it('counts bank holiday deductions first, even when they fall later in the year', () => {
    const s = { ...tight, bankHolidaysDeducted: true }
    // Christmas (Fri) and the Boxing Day substitute (Mon) deduct 2 days.
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full' } as const
    expect([...overAllocatedDates(range, s, leave, holidays)]).toEqual(['2026-11-02', '2026-11-03'])
    const one = { '2026-11-02': 'full' } as const
    expect([...overAllocatedDates(range, { ...s, allowanceDays: 3 }, one, holidays)]).toEqual([])
    expect([...overAllocatedDates(range, { ...s, allowanceDays: 2 }, one, holidays)]).toEqual(['2026-11-02'])
  })

  it('only counts bookable days and days in the leave year', () => {
    const leave = {
      '2026-11-02': 'full',
      '2026-11-03': 'full',
      '2026-11-07': 'full', // Saturday
      '2026-12-25': 'full', // bank holiday
      '2027-01-04': 'full', // next leave year
    } as const
    expect([...overAllocatedDates(range, tight, leave, holidays)]).toEqual([])
  })
})

describe('overEntitlementMessage', () => {
  it('is null when within entitlement', () => {
    expect(overEntitlementMessage(0, '2026/27')).toBeNull()
    expect(overEntitlementMessage(3, '2026/27')).toBeNull()
  })

  it('reads naturally for singular, plural and half days', () => {
    expect(overEntitlementMessage(-1, '2026/27')).toBe(
      'You\u2019ve booked 1 day more than your entitlement for 2026/27.',
    )
    expect(overEntitlementMessage(-2, '2026/27')).toContain('booked 2 days more')
    expect(overEntitlementMessage(-0.5, '2026/27')).toContain('booked half a day more')
    expect(overEntitlementMessage(-1.5, '2026/27')).toContain('booked 1.5 days more')
  })

  it('formats days', () => {
    expect(formatDays(0.5)).toBe('half a day')
    expect(formatDays(1)).toBe('1 day')
    expect(formatDays(2.5)).toBe('2.5 days')
  })
})
