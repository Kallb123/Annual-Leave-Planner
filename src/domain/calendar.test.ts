import { describe, expect, it } from 'vitest'
import { buildYearView, dayBands, needsPill, type CalendarOverlaySource, type PersonLeaveSource, type YearView } from './calendar'
import { calendarDayIndex } from './importedCalendars'
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
      companyDay: { id: 'a', name: 'Office closure' },
    })
    expect(cells.find((c) => c.date === '2026-12-30')?.companyDayName).toBeNull()
    expect(cells.find((c) => c.date === '2026-12-30')?.companyDay).toBeNull()
  })
})

describe('DayCell.people', () => {
  const range = { start: '2026-01-01', end: '2026-12-31' }
  const source = (over: Partial<PersonLeaveSource> & Pick<PersonLeaveSource, 'id'>): PersonLeaveSource => ({
    name: over.id.toUpperCase(),
    colour: '#2f9e6a',
    style: 'fill',
    tracksAllowance: true,
    active: false,
    settings: DEFAULT_SETTINGS,
    leave: {},
    overLimit: new Set(),
    companyDays: NO_COMPANY_DAYS,
    ...over,
  })
  const cellFor = (people: PersonLeaveSource[], date: string, holidays = new Map<string, string>(), overLimit = new Set<string>()) =>
    buildYearView(range, DEFAULT_SETTINGS, {}, holidays, NO_COMPANY_DAYS, null, overLimit, people)
      .months.flatMap((m) => m.weeks.flat())
      .find((c) => c?.date === date)!

  it("uses each person's own company days: A's closure does not hide B's leave", () => {
    const closure = companyDayIndex([
      { id: 'a', date: '2026-11-18', name: 'Closed', deducted: false, repeatsAnnually: false },
    ])
    const people = [
      source({ id: 'a', leave: { '2026-11-18': 'full' }, companyDays: closure }),
      source({ id: 'b', leave: { '2026-11-18': 'full' } }),
    ]
    expect(cellFor(people, '2026-11-18').people.map((p) => p.personId)).toEqual(['b'])
  })

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
      { personId: 'a', name: 'A', colour: '#2563eb', style: 'fill', tracksAllowance: true, portion: 'full', joinsPrev: false, joinsNext: false, overLimit: false, active: true },
      { personId: 'b', name: 'B', colour: '#db2777', style: 'fill', tracksAllowance: true, portion: 'half', joinsPrev: false, joinsNext: true, overLimit: false, active: false },
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

describe('styles, joins and company', () => {
  const range = { start: '2026-01-01', end: '2026-12-31' }
  const source = (over: Partial<PersonLeaveSource> & Pick<PersonLeaveSource, 'id'>): PersonLeaveSource => ({
    name: over.id.toUpperCase(),
    colour: '#2f9e6a',
    style: 'fill',
    tracksAllowance: true,
    active: false,
    settings: DEFAULT_SETTINGS,
    leave: {},
    overLimit: new Set(),
    companyDays: NO_COMPANY_DAYS,
    ...over,
  })
  const build = (people: PersonLeaveSource[], holidays = new Map<string, string>(), companyDays = NO_COMPANY_DAYS, company = null as YearView['company']) =>
    buildYearView(range, DEFAULT_SETTINGS, {}, holidays, companyDays, null, new Set(), people, company)
  const cell = (view: YearView, date: string) => view.months.flatMap((m) => m.weeks.flat()).find((c) => c?.date === date)!

  it('marks bookable for the active person: working days only when tracking', () => {
    const view = build([source({ id: 'a', active: true })], new Map([['2026-11-23', 'Holiday']]))
    expect(cell(view, '2026-11-18').bookable).toBe(true)
    expect(cell(view, '2026-11-21').bookable).toBe(false) // Saturday
    expect(cell(view, '2026-11-23').bookable).toBe(false) // bank holiday
  })

  it('treats every in-range day as bookable for an active non-tracking person', () => {
    const view = build([source({ id: 'a', active: true, tracksAllowance: false })], new Map([['2026-11-23', 'Holiday']]))
    expect(cell(view, '2026-11-21').bookable).toBe(true)
    expect(cell(view, '2026-11-22').bookable).toBe(true)
    expect(cell(view, '2026-11-23').bookable).toBe(true)
  })

  it('is never bookable out of range, and falls back to working days with no active source', () => {
    const view = buildYearView({ start: '2026-11-10', end: '2026-11-20' }, DEFAULT_SETTINGS, {}, new Map(), NO_COMPANY_DAYS, null, new Set(), [
      source({ id: 'a', active: true, tracksAllowance: false }),
    ])
    expect(cell(view, '2026-11-09').bookable).toBe(false)
    expect(cell(build([]), '2026-11-18').bookable).toBe(true)
    expect(cell(build([]), '2026-11-21').bookable).toBe(false)
  })

  it('counts a non-tracking person\'s marks on weekends and bank holidays and joins them', () => {
    const leave = { '2026-11-21': 'full', '2026-11-22': 'full', '2026-11-23': 'full' } as const
    const view = build([source({ id: 's', tracksAllowance: false, style: 'outline', leave })], new Map([['2026-11-23', 'Holiday']]))
    expect(cell(view, '2026-11-21').people[0]).toMatchObject({ style: 'outline', tracksAllowance: false, joinsPrev: false, joinsNext: true })
    expect(cell(view, '2026-11-22').people[0]).toMatchObject({ joinsPrev: true, joinsNext: true })
    expect(cell(view, '2026-11-23').people[0]).toMatchObject({ joinsPrev: true, joinsNext: false })
  })

  it('does not join across a day that does not count, or at a month edge', () => {
    // 30 Nov and 1 Dec are adjacent dates but different months; 18th and 20th are separated by an unmarked 19th.
    const leave = { '2026-11-18': 'full', '2026-11-20': 'full', '2026-11-30': 'full', '2026-12-01': 'full' } as const
    const view = build([source({ id: 's', tracksAllowance: false, leave })])
    expect(cell(view, '2026-11-18').people[0]).toMatchObject({ joinsPrev: false, joinsNext: false })
    expect(cell(view, '2026-11-30').people[0]).toMatchObject({ joinsPrev: false, joinsNext: false })
    expect(cell(view, '2026-12-01').people[0]).toMatchObject({ joinsPrev: false, joinsNext: false })
  })

  it('does not join onto a mark that is not markable for a tracking person', () => {
    // Friday 20th and Saturday 21st: the Saturday does not count for a tracking person.
    const leave = { '2026-11-20': 'full', '2026-11-21': 'full' } as const
    const view = build([source({ id: 'a', leave })])
    expect(cell(view, '2026-11-20').people[0].joinsNext).toBe(false)
    expect(cell(view, '2026-11-21').people).toEqual([])
  })

  it('does not join onto a date outside the range', () => {
    const leave = { '2026-11-19': 'full', '2026-11-20': 'full' } as const
    const view = buildYearView({ start: '2026-11-20', end: '2026-11-30' }, DEFAULT_SETTINGS, {}, new Map(), NO_COMPANY_DAYS, null, new Set(), [
      source({ id: 's', tracksAllowance: false, leave }),
    ])
    expect(cell(view, '2026-11-20').people[0].joinsPrev).toBe(false)
    expect(cell(view, '2026-11-19').people).toEqual([])
  })

  it('flags adjacent company days within a month', () => {
    const day = (id: string, date: string) => ({ id, date, name: id, deducted: false, repeatsAnnually: false })
    const index = companyDayIndex([day('a', '2026-12-29'), day('b', '2026-12-30'), day('c', '2026-12-31'), day('d', '2027-01-01')])
    const view = build([], new Map(), index)
    expect(cell(view, '2026-12-29')).toMatchObject({ companyJoinsPrev: false, companyJoinsNext: true })
    expect(cell(view, '2026-12-30')).toMatchObject({ companyJoinsPrev: true, companyJoinsNext: true })
    expect(cell(view, '2026-12-31')).toMatchObject({ companyJoinsPrev: true, companyJoinsNext: false })
    expect(cell(view, '2026-12-28')).toMatchObject({ companyJoinsPrev: false, companyJoinsNext: false })
  })

  it('passes the company through, defaulting to null', () => {
    expect(build([]).company).toBeNull()
    const company = { name: 'Acme', colour: '#2a8aa6', style: 'outline' as const }
    expect(build([], new Map(), NO_COMPANY_DAYS, company).company).toEqual(company)
  })
})

describe('buildYearView imported calendars', () => {
  const ev = (start: string, end: string, name: string) => ({ id: `${start}-${name}`, start, end, name })
  const src = (id: string, events: ReturnType<typeof ev>[], over: Partial<CalendarOverlaySource> = {}): CalendarOverlaySource => ({
    id,
    name: id,
    colour: '#2a8aa6',
    style: 'fill',
    days: calendarDayIndex(events),
    ...over,
  })
  const make = (range: { start: string; end: string }, calendars: CalendarOverlaySource[], holidays = new Map<string, string>()) =>
    buildYearView(range, DEFAULT_SETTINGS, {}, holidays, NO_COMPANY_DAYS, null, new Set(), [], null, calendars)
  const find = (view: YearView, date: string) =>
    view.months.flatMap((m) => m.weeks.flat()).find((c) => c?.date === date)!
  const year = { start: '2026-01-01', end: '2026-12-31' }

  it('has no marks or calendars by default', () => {
    const view = buildYearView(year, DEFAULT_SETTINGS, {}, new Map(), NO_COMPANY_DAYS)
    expect(view.calendars).toEqual([])
    expect(find(view, '2026-05-04').calendars).toEqual([])
  })

  it('marks each date of a multi-day event, with joins inside a month', () => {
    const view = make(year, [src('hols', [ev('2026-05-04', '2026-05-06', 'Half term')])])
    expect(view.calendars).toEqual([{ id: 'hols', name: 'hols', colour: '#2a8aa6', style: 'fill' }])
    expect(find(view, '2026-05-03').calendars).toEqual([])
    expect(find(view, '2026-05-04').calendars[0]).toMatchObject({
      calendarId: 'hols', events: ['Half term'], joinsPrev: false, joinsNext: true,
    })
    expect(find(view, '2026-05-05').calendars[0]).toMatchObject({ joinsPrev: true, joinsNext: true })
    expect(find(view, '2026-05-06').calendars[0]).toMatchObject({ joinsPrev: true, joinsNext: false })
  })

  it('does not join across month edges', () => {
    const view = make(year, [src('c', [ev('2026-05-31', '2026-06-01', 'Bridge')])])
    expect(find(view, '2026-05-31').calendars[0]).toMatchObject({ joinsPrev: false, joinsNext: false })
    expect(find(view, '2026-06-01').calendars[0]).toMatchObject({ joinsPrev: false, joinsNext: false })
  })

  it('does not mark or join out-of-range dates', () => {
    const view = make({ start: '2026-05-05', end: '2026-05-31' }, [src('c', [ev('2026-05-04', '2026-05-06', 'X')])])
    expect(find(view, '2026-05-04').calendars).toEqual([])
    expect(find(view, '2026-05-05').calendars[0]).toMatchObject({ joinsPrev: false, joinsNext: true })
  })

  it('keeps calendars separate and in order, joining each independently', () => {
    const view = make(year, [
      src('a', [ev('2026-05-04', '2026-05-05', 'A1')]),
      src('b', [ev('2026-05-05', '2026-05-05', 'B1')], { style: 'outline' }),
    ])
    expect(find(view, '2026-05-04').calendars.map((c) => c.calendarId)).toEqual(['a'])
    const both = find(view, '2026-05-05').calendars
    expect(both.map((c) => [c.calendarId, c.style, c.joinsPrev])).toEqual([['a', 'fill', true], ['b', 'outline', false]])
  })

  it('never changes kind, bookability or leave', () => {
    const holidays = new Map([['2026-05-04', 'Early May']])
    const plain = make(year, [], holidays)
    const withCal = make(year, [src('c', [ev('2026-05-01', '2026-05-10', 'Hols')])], holidays)
    for (const d of ['2026-05-01', '2026-05-02', '2026-05-04', '2026-05-05']) {
      const { calendars, ...rest } = find(withCal, d)
      const { calendars: _none, ...base } = find(plain, d)
      expect(calendars).toHaveLength(1)
      expect(rest).toEqual(base)
    }
  })
})

describe('dayBands', () => {
  const person = (colour: string, portion: 'full' | 'half', style: 'fill' | 'outline' = 'fill') =>
    ({ personId: colour, name: 'P', colour, style, tracksAllowance: true, portion, joinsPrev: false, joinsNext: false, overLimit: false, active: true }) as const
  const mark = (colour: string, style: 'fill' | 'outline' = 'fill') =>
    ({ calendarId: colour, name: 'C', colour, style, events: ['E'], joinsPrev: false, joinsNext: false }) as const

  it('is empty when only outlines are present', () => {
    expect(dayBands({ people: [person('#112233', 'full', 'outline')], calendars: [mark('#445566', 'outline')] })).toEqual([])
  })

  it('lists filled people then filled calendars', () => {
    const bands = dayBands({ people: [person('#112233', 'full'), person('#223344', 'half')], calendars: [mark('#445566')] })
    expect(bands.map((b) => b.light)).toEqual([false, true, true])
    expect(bands[0]).toMatchObject({ fill: '#112233', ring: null })
    expect(bands[1].ring).toBe('#223344')
    expect(bands[2].ring).toBe('#445566')
  })

  it('needs a pill for several bands with a light one, not for all-full people or a single band', () => {
    expect(needsPill(dayBands({ people: [person('#112233', 'full'), person('#223344', 'full')], calendars: [] }))).toBe(false)
    expect(needsPill(dayBands({ people: [person('#112233', 'full')], calendars: [mark('#445566')] }))).toBe(true)
    expect(needsPill(dayBands({ people: [], calendars: [mark('#445566')] }))).toBe(false)
  })
})
