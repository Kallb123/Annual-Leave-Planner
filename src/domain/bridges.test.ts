import { describe, expect, it } from 'vitest'
import { bankHolidayIndex } from './bankHolidays'
import { bridgeSummary, findBridges, formatBridgeDates, type FindBridgesInput } from './bridges'
import { companyDayIndex, NO_COMPANY_DAYS } from './companyDays'
import type { CompanyDay } from './types'

const holidays = bankHolidayIndex('england-and-wales')
const range = { start: '2026-01-01', end: '2026-12-31' }
const monFri = [1, 2, 3, 4, 5]

function run(over: Partial<FindBridgesInput> = {}) {
  return findBridges({
    range,
    today: '2026-01-01',
    settings: { workingDays: monFri },
    leave: {},
    holidays,
    companyDays: NO_COMPANY_DAYS,
    ...over,
  })
}

const company = (date: string, repeatsAnnually = false): CompanyDay => ({
  id: date,
  date,
  name: 'Closure',
  deducted: false,
  repeatsAnnually,
})

describe('findBridges', () => {
  it('finds Christmas to New Year for Mon-Fri, counting beyond the leave year end', () => {
    // Fri 25 and Mon 28 Dec are holidays; Tue 29 - Thu 31 Dec is the bridge; Fri 1 Jan 2027 is a holiday.
    const b = run().find((x) => x.start === '2026-12-29')!
    expect(b.dates).toEqual(['2026-12-29', '2026-12-30', '2026-12-31'])
    expect(b.leaveDays).toBe(3)
    expect(b.offStart).toBe('2026-12-25')
    expect(b.offEnd).toBe('2027-01-03')
    expect(b.totalDaysOff).toBe(10)
    expect(bridgeSummary(b)).toBe('Book 3 days, get 10 days off')
  })

  it('suggests Tue-Fri after Easter Monday (4 days, the maximum)', () => {
    // Fri 3 - Mon 6 Apr off (Good Friday, weekend, Easter Monday), Tue 7 - Fri 10 Apr booked, then a weekend.
    const easter = run().find((x) => x.start === '2026-04-07')!
    expect(easter.leaveDays).toBe(4)
    expect(easter.totalDaysOff).toBe(4 + 4 + 2)
  })

  it('never suggests an ordinary week without a holiday', () => {
    const dates = run().flatMap((b) => b.dates)
    expect(dates).not.toContain('2026-03-04')
    expect(run().every((b) => b.leaveDays <= 4)).toBe(true)
  })

  it('does not suggest runs longer than the maximum', () => {
    expect(run({ maxLeaveDays: 2 }).find((b) => b.start === '2026-12-29')).toBeUndefined()
    expect(run({ maxLeaveDays: 3 }).find((b) => b.start === '2026-12-29')).toBeDefined()
  })

  it('works for a Mon-Wed pattern around Easter and ignores plain weeks', () => {
    const bridges = run({ settings: { workingDays: [1, 2, 3] } })
    const easter = bridges.find((b) => b.start === '2026-04-07')!
    expect(easter.dates).toEqual(['2026-04-07', '2026-04-08'])
    expect(easter.offStart).toBe('2026-04-02') // Thu before Good Friday is non-working
    expect(easter.offEnd).toBe('2026-04-12')
    expect(easter.totalDaysOff).toBe(5 + 2 + 4)
    // A plain Mon-Wed week with no holiday is not a bridge.
    expect(bridges.flatMap((b) => b.dates)).not.toContain('2026-03-10')
  })

  it('works for a Tue-Thu pattern', () => {
    const bridges = run({ settings: { workingDays: [2, 3, 4] } })
    // Mon 28 Dec holiday; Tue-Thu 29-31 Dec is the run; Fri 1 Jan holiday.
    const b = bridges.find((x) => x.start === '2026-12-29')!
    expect(b.leaveDays).toBe(3)
    expect(b.offStart).toBe('2026-12-25') // Thu 24 is a working day for this pattern
    expect(b.totalDaysOff).toBe(4 + 3 + 4) // 25-28 Dec, the run, 1-4 Jan
  })

  it('treats company days as off days', () => {
    const companyDays = companyDayIndex([company('2026-06-10')]) // Wednesday
    const b = run({ companyDays }).filter((x) => x.start === '2026-06-08' || x.start === '2026-06-11')
    expect(b.map((x) => x.dates)).toEqual([['2026-06-08', '2026-06-09'], ['2026-06-11', '2026-06-12']].slice(0, b.length))
    const before = run({ companyDays }).find((x) => x.start === '2026-06-08')!
    expect(before.offEnd).toBe('2026-06-10')
    expect(before.leaveDays).toBe(2)
    expect(before.totalDaysOff).toBe(2 + 2 + 1) // Sat, Sun, 2 booked, company day
  })

  it('counts days already booked as full leave as off, extending the streak', () => {
    const base = run().find((b) => b.start === '2026-12-29')!
    expect(base.totalDaysOff).toBe(10)
    // Book Wed 23 and Thu 24 Dec in full: the streak now starts earlier.
    const leave = { '2026-12-23': 'full', '2026-12-24': 'full' } as const
    const b = run({ leave }).find((x) => x.start === '2026-12-29')!
    expect(b.offStart).toBe('2026-12-23')
    expect(b.totalDaysOff).toBe(12)
  })

  it('does not treat half days as off, and counts only the missing half', () => {
    const leave = { '2026-12-24': 'half' } as const
    const bridges = run({ leave })
    const b = bridges.find((x) => x.start === '2026-12-29')!
    expect(b.offStart).toBe('2026-12-25') // half day does not extend the streak
    // The half-booked Thursday stays part of the Mon-Thu run before Christmas and only needs half a day.
    const before = bridges.find((x) => x.start === '2026-12-21')!
    expect(before.dates).toHaveLength(4)
    expect(before.leaveDays).toBe(3.5)
  })

  it('fully booked days are not themselves suggested', () => {
    const leave = { '2026-12-29': 'full', '2026-12-30': 'full', '2026-12-31': 'full' } as const
    expect(run({ leave }).find((b) => b.dates.includes('2026-12-30'))).toBeUndefined()
  })

  it('handles runs at the leave year edges', () => {
    // Leave year 1 Sep 2026 - 31 Aug 2027: Mon 28 Dec holiday... 29-31 Dec and 1 Jan are inside.
    const r = { start: '2026-12-29', end: '2027-12-28' }
    const inRange = run({ range: r, today: '2026-01-01' })
    expect(inRange.find((b) => b.start === '2026-12-29')).toBeDefined()
    // Range that cuts the run in half: the partial run is not suggested.
    const cut = run({ range: { start: '2026-12-30', end: '2026-12-31' } })
    expect(cut).toEqual([])
    const cutEnd = run({ range: { start: '2026-12-01', end: '2026-12-30' } })
    expect(cutEnd.find((b) => b.dates.includes('2026-12-30'))).toBeUndefined()
  })

  it('excludes runs in the past', () => {
    expect(run({ today: '2026-12-29' }).find((b) => b.start === '2026-12-29')).toBeDefined()
    expect(run({ today: '2026-12-30' }).find((b) => b.start === '2026-12-29')).toBeUndefined()
    expect(run({ today: '2027-01-01' })).toEqual([])
  })

  it('ranks by days off per leave day, then total days off, then date', () => {
    const bridges = run()
    for (let i = 1; i < bridges.length; i++) {
      const a = bridges[i - 1]
      const b = bridges[i]
      const ra = a.totalDaysOff / a.leaveDays
      const rb = b.totalDaysOff / b.leaveDays
      expect(ra >= rb).toBe(true)
      if (ra === rb) {
        expect(a.totalDaysOff >= b.totalDaysOff).toBe(true)
        if (a.totalDaysOff === b.totalDaysOff) expect(a.start < b.start).toBe(true)
      }
    }
  })

  it('suggests nothing when there are no working days', () => {
    expect(run({ settings: { workingDays: [] } })).toEqual([])
  })

  it('terminates for a seven-day week with no days off anywhere', () => {
    const noHolidays = { has: () => false, get: () => undefined } as unknown as typeof holidays
    expect(
      run({ settings: { workingDays: [0, 1, 2, 3, 4, 5, 6] }, holidays: noHolidays }),
    ).toEqual([])
  })
})

describe('formatBridgeDates', () => {
  it('formats single days, same-month and cross-month ranges', () => {
    expect(formatBridgeDates('2026-12-22', '2026-12-22')).toBe('22 Dec')
    expect(formatBridgeDates('2026-12-22', '2026-12-24')).toBe('22–24 Dec')
    expect(formatBridgeDates('2026-11-30', '2026-12-02')).toBe('30 Nov – 2 Dec')
  })
})
