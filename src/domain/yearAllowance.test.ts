import { describe, expect, it } from 'vitest'
import { leaveYearKey, settingsForLeaveYear, yearAllowanceFor } from './yearAllowance'
import { DEFAULT_SETTINGS } from './types'

const calendarYear = { start: '2026-01-01', end: '2026-12-31' }
const aprilYear = { start: '2026-04-06', end: '2027-04-05' }
const defaults = { allowanceDays: 25, carryOverDays: 2 }

describe('leaveYearKey', () => {
  it('is the calendar year the leave year starts in', () => {
    expect(leaveYearKey(calendarYear)).toBe('2026')
    expect(leaveYearKey(aprilYear)).toBe('2026')
    expect(leaveYearKey({ start: '2027-04-06', end: '2028-04-05' })).toBe('2027')
  })
})

describe('yearAllowanceFor', () => {
  it('uses the defaults when there is no override', () => {
    expect(yearAllowanceFor(defaults, {}, calendarYear)).toEqual({
      allowanceDays: 25,
      carryOverDays: 2,
      allowanceOverridden: false,
      carryOverOverridden: false,
    })
  })

  it('applies a partial override and flags only that part', () => {
    const r = yearAllowanceFor(defaults, { '2026': { allowanceDays: 30 } }, aprilYear)
    expect(r).toEqual({ allowanceDays: 30, carryOverDays: 2, allowanceOverridden: true, carryOverOverridden: false })
    const c = yearAllowanceFor(defaults, { '2026': { carryOverDays: 0 } }, aprilYear)
    expect(c).toEqual({ allowanceDays: 25, carryOverDays: 0, allowanceOverridden: false, carryOverOverridden: true })
  })

  it('treats an override of 0 as an override', () => {
    expect(yearAllowanceFor(defaults, { '2026': { allowanceDays: 0, carryOverDays: 0 } }, calendarYear)).toEqual({
      allowanceDays: 0,
      carryOverDays: 0,
      allowanceOverridden: true,
      carryOverOverridden: true,
    })
  })

  it('ignores overrides for other years', () => {
    expect(yearAllowanceFor(defaults, { '2027': { allowanceDays: 30 } }, calendarYear).allowanceOverridden).toBe(false)
  })
})

describe('settingsForLeaveYear', () => {
  it('replaces only allowance and carry-over', () => {
    const s = settingsForLeaveYear(DEFAULT_SETTINGS, { '2026': { allowanceDays: 30, carryOverDays: 3 } }, calendarYear)
    expect(s).toEqual({ ...DEFAULT_SETTINGS, allowanceDays: 30, carryOverDays: 3 })
    expect(settingsForLeaveYear(DEFAULT_SETTINGS, {}, calendarYear)).toEqual(DEFAULT_SETTINGS)
  })
})
