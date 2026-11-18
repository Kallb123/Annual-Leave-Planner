import { describe, expect, it } from 'vitest'
import { classifyDay, formatDays, overAllocatedDates, overEntitlementMessage, summarise } from './allowance'
import { companyDayIndex, NO_COMPANY_DAYS } from './companyDays'
import { DEFAULT_SETTINGS, type CompanyDay, type Settings } from './types'

const holidays = new Map([
  ['2026-12-25', 'Christmas Day'], // Friday
  ['2026-12-28', 'Boxing Day (substitute day)'], // Monday
])
const range = { start: '2026-01-01', end: '2026-12-31' }
const settings: Settings = { ...DEFAULT_SETTINGS, allowanceDays: 25, carryOverDays: 2 }

describe('classifyDay', () => {
  it('distinguishes working, non-working and bank holidays', () => {
    expect(classifyDay('2026-11-18', settings, holidays, NO_COMPANY_DAYS)).toBe('working')
    expect(classifyDay('2026-11-21', settings, holidays, NO_COMPANY_DAYS)).toBe('non-working')
    expect(classifyDay('2026-12-25', settings, holidays, NO_COMPANY_DAYS)).toBe('bank-holiday')
  })

  it('respects custom working patterns', () => {
    const fourDay = { workingDays: [1, 2, 3, 4] }
    expect(classifyDay('2026-11-20', fourDay, holidays, NO_COMPANY_DAYS)).toBe('non-working') // Friday
  })
})

describe('summarise', () => {
  it('counts full and half days inside the leave year only', () => {
    const leave = {
      '2026-11-18': 'full',
      '2026-11-19': 'half',
      '2027-01-05': 'full', // next leave year
    } as const
    expect(summarise(range, settings, leave, holidays, NO_COMPANY_DAYS)).toEqual({
      entitlement: 27,
      booked: 1.5,
      bankHolidaysDeducted: 0,
      companyDaysDeducted: 0,
      remaining: 25.5,
    })
  })

  it('ignores leave stored on days that are no longer bookable', () => {
    const leave = { '2026-11-21': 'full', '2026-12-25': 'full' } as const
    expect(summarise(range, settings, leave, holidays, NO_COMPANY_DAYS).booked).toBe(0)
  })

  it('deducts bank holidays on working days when configured', () => {
    const s = { ...settings, bankHolidaysDeducted: true, workingDays: [1, 2, 3, 4] }
    // Christmas (Fri) isn't a working day for a Mon–Thu worker; Boxing Day substitute (Mon) is.
    const result = summarise(range, s, {}, holidays, NO_COMPANY_DAYS)
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
    expect([...overAllocatedDates(range, tight, leave, none, NO_COMPANY_DAYS)]).toEqual([])
  })

  it('is empty when exactly at the limit', () => {
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full' } as const
    expect([...overAllocatedDates(range, tight, leave, none, NO_COMPANY_DAYS)]).toEqual([])
  })

  it('marks the days past the limit when over by a full day', () => {
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full', '2026-11-04': 'full' } as const
    expect([...overAllocatedDates(range, tight, leave, none, NO_COMPANY_DAYS)]).toEqual(['2026-11-04'])
  })

  it('counts a half day straddling the limit as over', () => {
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full', '2026-11-04': 'half' } as const
    expect([...overAllocatedDates(range, tight, leave, none, NO_COMPANY_DAYS)]).toEqual(['2026-11-04'])
    const straddle = { '2026-11-02': 'full', '2026-11-03': 'half', '2026-11-04': 'full' } as const
    expect([...overAllocatedDates(range, tight, straddle, none, NO_COMPANY_DAYS)]).toEqual(['2026-11-04'])
  })

  it('counts bank holiday deductions first, even when they fall later in the year', () => {
    const s = { ...tight, bankHolidaysDeducted: true }
    // Christmas (Fri) and the Boxing Day substitute (Mon) deduct 2 days.
    const leave = { '2026-11-02': 'full', '2026-11-03': 'full' } as const
    expect([...overAllocatedDates(range, s, leave, holidays, NO_COMPANY_DAYS)]).toEqual(['2026-11-02', '2026-11-03'])
    const one = { '2026-11-02': 'full' } as const
    expect([...overAllocatedDates(range, { ...s, allowanceDays: 3 }, one, holidays, NO_COMPANY_DAYS)]).toEqual([])
    expect([...overAllocatedDates(range, { ...s, allowanceDays: 2 }, one, holidays, NO_COMPANY_DAYS)]).toEqual(['2026-11-02'])
  })

  it('only counts bookable days and days in the leave year', () => {
    const leave = {
      '2026-11-02': 'full',
      '2026-11-03': 'full',
      '2026-11-07': 'full', // Saturday
      '2026-12-25': 'full', // bank holiday
      '2027-01-04': 'full', // next leave year
    } as const
    expect([...overAllocatedDates(range, tight, leave, holidays, NO_COMPANY_DAYS)]).toEqual([])
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

describe('company days', () => {
  const day = (date: string, extra: Partial<CompanyDay> = {}): CompanyDay => ({
    id: date + (extra.name ?? ''),
    date,
    name: 'Closure',
    deducted: false,
    repeatsAnnually: false,
    ...extra,
  })
  const index = (...days: CompanyDay[]) => companyDayIndex(days)
  // 2026-12-29 Tue, 2026-12-30 Wed, 2026-12-27 Sun, 2026-12-25 Fri (bank holiday)

  describe('classifyDay', () => {
    it('classifies a company day, including on weekends and non-working days', () => {
      const cd = index(day('2026-12-29'), day('2026-12-27'))
      expect(classifyDay('2026-12-29', settings, holidays, cd)).toBe('company-day')
      expect(classifyDay('2026-12-27', settings, holidays, cd)).toBe('company-day')
      expect(classifyDay('2026-12-30', settings, holidays, cd)).toBe('working')
    })

    it('lets a bank holiday win over a company day', () => {
      expect(classifyDay('2026-12-25', settings, holidays, index(day('2026-12-25')))).toBe('bank-holiday')
    })

    it('matches repeating days in every year', () => {
      const cd = index(day('2026-12-24', { repeatsAnnually: true }))
      expect(classifyDay('2027-12-24', settings, holidays, cd)).toBe('company-day')
      expect(classifyDay('2028-12-25', settings, new Map(), cd)).toBe('working')
    })

    it('respects part-time patterns for the underlying day, not the display', () => {
      const fourDay = { workingDays: [1, 2, 3, 4] }
      const cd = index(day('2026-11-20')) // Friday, not a working day
      expect(classifyDay('2026-11-20', fourDay, holidays, cd)).toBe('company-day')
    })
  })

  describe('summarise', () => {
    it('deducts only company days flagged as deducted', () => {
      const cd = index(day('2026-12-29', { deducted: true }), day('2026-12-30'))
      const result = summarise(range, settings, {}, holidays, cd)
      expect(result.companyDaysDeducted).toBe(1)
      expect(result.remaining).toBe(26)
    })

    it('does not deduct on non-working days', () => {
      const cd = index(day('2026-12-27', { deducted: true })) // Sunday
      expect(summarise(range, settings, {}, holidays, cd).companyDaysDeducted).toBe(0)
      const fourDay = { ...settings, workingDays: [1, 2, 3, 4] }
      const fri = index(day('2026-11-20', { deducted: true }))
      expect(summarise(range, fourDay, {}, holidays, fri).companyDaysDeducted).toBe(0)
    })

    it('does not deduct on a bank holiday (bank holiday wins)', () => {
      const cd = index(day('2026-12-25', { deducted: true }))
      expect(summarise(range, settings, {}, holidays, cd).companyDaysDeducted).toBe(0)
    })

    it('does not double count a bank holiday and a company day on one date', () => {
      const s = { ...settings, bankHolidaysDeducted: true }
      const cd = index(day('2026-12-25', { deducted: true }))
      const result = summarise(range, s, {}, holidays, cd)
      expect(result.bankHolidaysDeducted).toBe(2)
      expect(result.companyDaysDeducted).toBe(0)
    })

    it('counts only company days inside the leave year', () => {
      const cd = index(day('2025-12-29', { deducted: true }), day('2027-01-05', { deducted: true }))
      expect(summarise(range, settings, {}, holidays, cd).companyDaysDeducted).toBe(0)
    })

    it('counts a repeating day once per year, and skips 29 February in non-leap years', () => {
      const xmas = index(day('2024-12-30', { deducted: true, repeatsAnnually: true }))
      expect(summarise(range, settings, {}, holidays, xmas).companyDaysDeducted).toBe(1)
      const leapDay = index(day('2024-02-29', { deducted: true, repeatsAnnually: true }))
      expect(summarise(range, settings, {}, holidays, leapDay).companyDaysDeducted).toBe(0) // 2026
      const leapRange = { start: '2028-01-01', end: '2028-12-31' }
      expect(summarise(leapRange, settings, {}, holidays, leapDay).companyDaysDeducted).toBe(1) // Tue 2028-02-29
    })

    it('counts overlapping company days on one date once', () => {
      const cd = index(day('2026-12-29', { deducted: true }), day('2026-12-29', { deducted: true, name: 'Other' }))
      expect(summarise(range, settings, {}, holidays, cd).companyDaysDeducted).toBe(1)
    })

    it('ignores leave booked on a company day', () => {
      const cd = index(day('2026-12-29'))
      expect(summarise(range, settings, { '2026-12-29': 'full' }, holidays, cd).booked).toBe(0)
    })
  })

  describe('overAllocatedDates', () => {
    it('counts company day deductions before booked leave', () => {
      const tight: Settings = { ...DEFAULT_SETTINGS, allowanceDays: 2 }
      const cd = index(day('2026-12-29', { deducted: true }))
      const leave = { '2026-11-02': 'full', '2026-11-03': 'full' } as const
      expect([...overAllocatedDates(range, tight, leave, holidays, cd)]).toEqual(['2026-11-03'])
      expect([...overAllocatedDates(range, tight, leave, holidays, NO_COMPANY_DAYS)]).toEqual([])
    })

    it('ignores leave on company days', () => {
      const tight: Settings = { ...DEFAULT_SETTINGS, allowanceDays: 1 }
      const cd = index(day('2026-11-03'))
      const leave = { '2026-11-02': 'full', '2026-11-03': 'full' } as const
      expect([...overAllocatedDates(range, tight, leave, holidays, cd)]).toEqual([])
    })
  })
})
