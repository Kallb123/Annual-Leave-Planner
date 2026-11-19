import { describe, expect, it } from 'vitest'
import { leaveYearAtOffset, leaveYearContaining, leaveYearLabel, leaveYearStartingIn, leaveYearsOverlapping } from './leaveYear'

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

describe('leaveYearAtOffset', () => {
  it('offset 0 is the leave year containing today, offsets move whole years', () => {
    expect(leaveYearAtOffset('2026-11-19', 0, jan1)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(leaveYearAtOffset('2026-11-19', 1, jan1)).toEqual({ start: '2027-01-01', end: '2027-12-31' })
    expect(leaveYearAtOffset('2026-11-19', -1, jan1)).toEqual({ start: '2025-01-01', end: '2025-12-31' })
  })

  it('handles a non-January start with today after the start', () => {
    expect(leaveYearAtOffset('2026-11-19', 0, apr1)).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(leaveYearAtOffset('2026-11-19', 1, apr1)).toEqual({ start: '2027-04-01', end: '2028-03-31' })
    expect(leaveYearAtOffset('2026-11-19', -1, apr1)).toEqual({ start: '2025-04-01', end: '2026-03-31' })
  })

  it('handles a non-January start with today before the start', () => {
    expect(leaveYearAtOffset('2026-02-10', 0, apr1)).toEqual({ start: '2025-04-01', end: '2026-03-31' })
    expect(leaveYearAtOffset('2026-02-10', 1, apr1)).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(leaveYearAtOffset('2026-02-10', -1, apr1)).toEqual({ start: '2024-04-01', end: '2025-03-31' })
  })

  it('treats the start date itself as inside the new year', () => {
    expect(leaveYearAtOffset('2026-04-01', 0, apr1).start).toBe('2026-04-01')
    expect(leaveYearAtOffset('2026-03-31', 0, apr1).start).toBe('2025-04-01')
  })
})

describe('leaveYearsOverlapping', () => {
  it('a calendar-year view overlaps two April-start leave years', () => {
    expect(leaveYearsOverlapping({ start: '2026-01-01', end: '2026-12-31' }, apr1)).toEqual([
      { start: '2025-04-01', end: '2026-03-31' },
      { start: '2026-04-01', end: '2027-03-31' },
    ])
  })

  it('the same start gives one leave year', () => {
    expect(leaveYearsOverlapping({ start: '2026-04-01', end: '2027-03-31' }, apr1)).toEqual([
      { start: '2026-04-01', end: '2027-03-31' },
    ])
    expect(leaveYearsOverlapping({ start: '2026-01-01', end: '2026-12-31' }, jan1)).toEqual([
      { start: '2026-01-01', end: '2026-12-31' },
    ])
  })

  it('a view inside one leave year gives one', () => {
    expect(leaveYearsOverlapping({ start: '2026-05-01', end: '2026-05-31' }, apr1)).toHaveLength(1)
  })

  it('a view ending the day a year starts includes the new year', () => {
    expect(leaveYearsOverlapping({ start: '2026-03-01', end: '2026-04-01' }, apr1)).toHaveLength(2)
  })
})
