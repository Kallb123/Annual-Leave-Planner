import { describe, expect, it } from 'vitest'
import { leaveYearContaining, leaveYearLabel, leaveYearStartingIn } from './leaveYear'

const jan1 = { leaveYearStartMonth: 1, leaveYearStartDay: 1 }
const apr1 = { leaveYearStartMonth: 4, leaveYearStartDay: 1 }

describe('leave year', () => {
  it('handles calendar-year leave years', () => {
    expect(leaveYearContaining('2026-06-15', jan1)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(leaveYearLabel(leaveYearStartingIn(2026, jan1))).toBe('2026')
  })

  it('handles leave years that span two calendar years', () => {
    expect(leaveYearContaining('2026-03-31', apr1)).toEqual({ start: '2025-04-01', end: '2026-03-31' })
    expect(leaveYearContaining('2026-04-01', apr1)).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(leaveYearLabel(leaveYearStartingIn(2026, apr1))).toBe('2026/27')
  })

  it('handles mid-month starts', () => {
    const s = { leaveYearStartMonth: 9, leaveYearStartDay: 15 }
    expect(leaveYearContaining('2026-09-14', s)).toEqual({ start: '2025-09-15', end: '2026-09-14' })
  })

  it('clamps start days beyond the end of the month', () => {
    const feb30 = { leaveYearStartMonth: 2, leaveYearStartDay: 30 }
    expect(leaveYearStartingIn(2026, feb30)).toEqual({ start: '2026-02-28', end: '2027-02-27' })
    expect(leaveYearStartingIn(2028, feb30).start).toBe('2028-02-29')
  })
})
