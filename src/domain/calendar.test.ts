import { describe, expect, it } from 'vitest'
import { buildYearView } from './calendar'
import { companyDayIndex, NO_COMPANY_DAYS } from './companyDays'
import { DEFAULT_SETTINGS } from './types'

describe('buildYearView', () => {
  it('builds twelve Monday-first months for a calendar leave year', () => {
    const view = buildYearView({ start: '2026-01-01', end: '2026-12-31' }, DEFAULT_SETTINGS, {}, new Map(), NO_COMPANY_DAYS)
    expect(view.months).toHaveLength(12)
    const jan = view.months[0]
    expect(jan.label).toBe('January 2026')
    // 1 Jan 2026 is a Thursday → three leading blanks
    expect(jan.weeks[0].slice(0, 3)).toEqual([null, null, null])
    expect(jan.weeks[0][3]?.date).toBe('2026-01-01')
    expect(jan.weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('spans thirteen months and marks out-of-range days for mid-month starts', () => {
    const range = { start: '2026-09-15', end: '2027-09-14' }
    const leave = { '2026-09-14': 'full', '2026-09-15': 'full' } as const
    const view = buildYearView(range, DEFAULT_SETTINGS, leave, new Map(), NO_COMPANY_DAYS)
    expect(view.months).toHaveLength(13)
    const cells = view.months[0].weeks.flat().filter((c) => c !== null)
    const before = cells.find((c) => c.date === '2026-09-14')!
    const first = cells.find((c) => c.date === '2026-09-15')!
    expect(before.inRange).toBe(false)
    expect(before.leave).toBeNull() // belongs to the previous leave year
    expect(first.inRange).toBe(true)
    expect(first.leave).toBe('full')
  })

  it('annotates bank holidays and today', () => {
    const view = buildYearView(
      { start: '2026-01-01', end: '2026-12-31' },
      DEFAULT_SETTINGS,
      {},
      new Map([['2026-12-25', 'Christmas Day']]),
      NO_COMPANY_DAYS,
      '2026-11-18',
    )
    const cells = view.months.flatMap((m) => m.weeks.flat()).filter((c) => c !== null)
    expect(cells.find((c) => c.date === '2026-12-25')).toMatchObject({
      kind: 'bank-holiday',
      holidayName: 'Christmas Day',
    })
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual(['2026-11-18'])
  })

  it('flags days in the over-limit set, in range only', () => {
    const range = { start: '2026-09-15', end: '2027-09-14' }
    const leave = { '2026-09-14': 'full', '2026-09-15': 'full' } as const
    const over = new Set(['2026-09-14', '2026-09-15'])
    const view = buildYearView(range, DEFAULT_SETTINGS, leave, new Map(), NO_COMPANY_DAYS, null, over)
    const cells = view.months.flatMap((m) => m.weeks.flat()).filter((c) => c !== null)
    expect(cells.filter((c) => c.overLimit).map((c) => c.date)).toEqual(['2026-09-15'])
  })

  it('marks company days with their name', () => {
    const index = companyDayIndex([
      { id: 'a', date: '2026-12-29', name: 'Office closure', deducted: true, repeatsAnnually: false },
    ])
    const view = buildYearView({ start: '2026-01-01', end: '2026-12-31' }, DEFAULT_SETTINGS, {}, new Map(), index)
    const cells = view.months.flatMap((m) => m.weeks.flat()).filter((c) => c !== null)
    expect(cells.find((c) => c.date === '2026-12-29')).toMatchObject({
      kind: 'company-day',
      companyDayName: 'Office closure',
    })
    expect(cells.find((c) => c.date === '2026-12-30')?.companyDayName).toBeNull()
  })
})
