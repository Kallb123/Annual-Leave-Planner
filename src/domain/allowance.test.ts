import { describe, expect, it } from 'vitest'
import { classifyDay, summarise } from './allowance'
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
