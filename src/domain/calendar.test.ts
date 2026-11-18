import { describe, expect, it } from 'vitest'
import { buildYearView, type PersonLeaveSource } from './calendar'
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

describe('DayCell.people', () => {
  const range = { start: '2026-01-01', end: '2026-12-31' }
  const source = (over: Partial<PersonLeaveSource> & Pick<PersonLeaveSource, 'id'>): PersonLeaveSource => ({
    name: over.id.toUpperCase(),
    colour: '#2f9e6a',
    active: false,
    settings: DEFAULT_SETTINGS,
    leave: {},
    overLimit: new Set(),
    ...over,
  })
  const cellFor = (people: PersonLeaveSource[], date: string, holidays = new Map<string, string>(), overLimit = new Set<string>()) =>
    buildYearView(range, DEFAULT_SETTINGS, {}, holidays, NO_COMPANY_DAYS, null, overLimit, people)
      .months.flatMap((m) => m.weeks.flat())
      .find((c) => c?.date === date)!

  it('is empty when no people are passed', () => {
    expect(cellFor([], '2026-11-18').people).toEqual([])
  })

  it('lists everyone with leave on the day, in people order, with colours, portions and active flag', () => {
    const people = [
      source({ id: 'a', colour: '#2563eb', active: true, leave: { '2026-11-18': 'full' } }),
      source({ id: 'b', colour: '#db2777', leave: { '2026-11-18': 'half', '2026-11-19': 'full' } }),
      source({ id: 'c', leave: {} }),
    ]
    expect(cellFor(people, '2026-11-18').people).toEqual([
      { personId: 'a', name: 'A', colour: '#2563eb', portion: 'full', overLimit: false, active: true },
      { personId: 'b', name: 'B', colour: '#db2777', portion: 'half', overLimit: false, active: false },
    ])
    expect(cellFor(people, '2026-11-19').people.map((p) => p.personId)).toEqual(['b'])
    expect(cellFor(people, '2026-11-20').people).toEqual([])
  })

  it("excludes a person's leave on a day that is not a working day for them", () => {
    // 2026-11-18 is a Wednesday.
    const people = [
      source({ id: 'a', active: true, leave: { '2026-11-18': 'full' } }),
      source({ id: 'b', settings: { ...DEFAULT_SETTINGS, workingDays: [1, 2, 4, 5] }, leave: { '2026-11-18': 'full' } }),
    ]
    const cell = cellFor(people, '2026-11-18')
    expect(cell.people.map((p) => p.personId)).toEqual(['a'])
    expect(cell.kind).toBe('working') // active person's classification
  })

  it("classifies kind by the active person's working days", () => {
    const people = [
      source({ id: 'a', settings: { ...DEFAULT_SETTINGS, workingDays: [1, 2, 4, 5] }, active: true }),
      source({ id: 'b' }),
    ]
    const view = buildYearView(range, people[0].settings, {}, new Map(), NO_COMPANY_DAYS, null, new Set(), people)
    const cell = view.months.flatMap((m) => m.weeks.flat()).find((c) => c?.date === '2026-11-18')!
    expect(cell.kind).toBe('non-working')
  })

  it('excludes leave on bank holidays and outside the range', () => {
    const holidays = new Map([['2026-12-25', 'Christmas Day']])
    const narrow = { start: '2026-09-15', end: '2027-09-14' }
    const people = [source({ id: 'a', leave: { '2026-12-25': 'full', '2026-09-14': 'full', '2026-09-15': 'full' } })]
    const view = buildYearView(narrow, DEFAULT_SETTINGS, {}, holidays, NO_COMPANY_DAYS, null, new Set(), people)
    const cells = view.months.flatMap((m) => m.weeks.flat()).filter((c) => c !== null)
    expect(cells.find((c) => c.date === '2026-12-25')!.people).toEqual([])
    expect(cells.find((c) => c.date === '2026-09-14')!.people).toEqual([])
    expect(cells.find((c) => c.date === '2026-09-15')!.people).toHaveLength(1)
  })

  it('carries per-person overLimit flags, and cell.overLimit is true if any person is over', () => {
    const people = [
      source({ id: 'a', active: true, leave: { '2026-11-18': 'full' } }),
      source({ id: 'b', leave: { '2026-11-18': 'full' }, overLimit: new Set(['2026-11-18']) }),
    ]
    const cell = cellFor(people, '2026-11-18')
    expect(cell.people.map((p) => p.overLimit)).toEqual([false, true])
    expect(cell.overLimit).toBe(true)
    expect(cell.leave).toBeNull() // the active person (a) uses the separate `leave` argument
  })

  it("cell.leave remains the active person's portion", () => {
    const leave = { '2026-11-18': 'half' } as const
    const people = [source({ id: 'a', active: true, leave })]
    const view = buildYearView(range, DEFAULT_SETTINGS, leave, new Map(), NO_COMPANY_DAYS, null, new Set(), people)
    const cell = view.months.flatMap((m) => m.weeks.flat()).find((c) => c?.date === '2026-11-18')!
    expect(cell.leave).toBe('half')
    expect(cell.people[0]).toMatchObject({ portion: 'half', active: true })
  })
})
