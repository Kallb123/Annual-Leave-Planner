import { describe, expect, it } from 'vitest'
import { buildYearView } from '../domain/calendar'
import { calendarDayIndex } from '../domain/importedCalendars'
import { NO_COMPANY_DAYS } from '../domain/companyDays'
import { monthsOfRange } from '../domain/exportRange'
import type { MonthSpan } from '../domain/exportRange'
import { DEFAULT_PERSON_SETTINGS, DEFAULT_SETTINGS, type Company, type LeaveEntries, type Person } from '../domain/types'
import { PERSON_COLOURS } from '../theme'
import { buildExportData, type ExportDataInput } from './exportData'
import { personStatus } from './personStatus'
import { personSettings } from './plannerState'

const TODAY = '2026-11-19'
const holidays = new Map<string, string>()

const shared = {
  leaveYearStartMonth: 1,
  leaveYearStartDay: 1,
  region: DEFAULT_SETTINGS.region,
  showBridgeSuggestions: DEFAULT_SETTINGS.showBridgeSuggestions,
}

const aprCo: Company = {
  id: 'apr-co', name: 'Apr Ltd', colour: '#2a8aa6', style: 'fill',
  leaveYearStartMonth: 4, leaveYearStartDay: 1, days: [],
}
const companies = [aprCo]

// Ten working days in Feb-Mar 2027; with an allowance of 8 the last two are over the limit.
const leave: LeaveEntries = {
  '2027-02-01': 'full', '2027-02-02': 'full', '2027-02-03': 'full', '2027-02-04': 'full', '2027-02-05': 'full',
  '2027-03-01': 'full', '2027-03-02': 'full', '2027-03-03': 'full', '2027-03-04': 'full', '2027-03-05': 'full',
}

const person = (id: string, companyId: string | null): Person => ({
  ...DEFAULT_PERSON_SETTINGS,
  allowanceDays: 8,
  carryOverDays: 0,
  id,
  name: id,
  colour: PERSON_COLOURS[0],
  style: 'fill',
  tracksAllowance: true,
  leave,
  companyId,
})

const solo = person('solo', null)
const apr = person('apr', 'apr-co')
const range = { start: '2026-01-01', end: '2026-12-31' }

function input(span: MonthSpan, viewRange = range): ExportDataInput {
  const people = [solo, apr].map((p) =>
    personStatus({
      person: p, active: p.id === 'solo', shared, companies, today: TODAY, yearOffset: 0,
      view: viewRange, holidays, companyDays: NO_COMPANY_DAYS,
    }),
  )
  const yearView = buildYearView(viewRange, personSettings(shared, solo), solo.leave, holidays, NO_COMPANY_DAYS, TODAY)
  return {
    span, range: viewRange, label: '2026', yearView, people, shared, companies, today: TODAY, yearOffset: 0,
    holidays, viewCompanyDays: NO_COMPANY_DAYS, viewCompany: null, indexFor: () => NO_COMPANY_DAYS,
  }
}

describe('buildExportData', () => {
  it('returns the viewed leave year untouched when the span is exactly its months', () => {
    const inp = input(monthsOfRange(range))
    const data = buildExportData(inp)
    expect(data.isLeaveYear).toBe(true)
    expect(data.view).toBe(inp.yearView)
    expect(data.range).toBe(range)
    expect(data.people.map((p) => p.summary)).toEqual(inp.people.map((p) => p.summary))
    expect(data.people.map((p) => p.warning)).toEqual(inp.people.map((p) => p.warning))
    // The April person's leave year label differs from the viewed "2026".
    expect(data.people.map((p) => p.yearLabel)).toEqual([undefined, '2026/27'])
    expect(data.people[1].warning).toContain('2026/27')
  })

  it('treats a same-month span of a partial leave year as the leave year', () => {
    const partial = { start: '2026-09-15', end: '2027-09-14' }
    const data = buildExportData(input(monthsOfRange(partial), partial))
    expect(data.isLeaveYear).toBe(true)
    expect(data.range).toBe(partial)
  })

  it('draws a custom span with its own range, summaries and no warnings', () => {
    const span = { start: { year: 2027, month: 2 }, end: { year: 2027, month: 3 } }
    const data = buildExportData(input(span))
    expect(data.isLeaveYear).toBe(false)
    expect(data.range).toEqual({ start: '2027-02-01', end: '2027-03-31' })
    expect(data.view.months).toHaveLength(2)
    for (const p of data.people) {
      expect(p.summary.booked).toBe(10)
      expect(p.warning).toBeNull()
      expect(p.yearLabel).toBeUndefined()
    }
  })

  it('includes visible imported calendars in a custom span', () => {
    const span = { start: { year: 2027, month: 2 }, end: { year: 2027, month: 3 } }
    const calendars = [
      { id: 'hols', name: 'School', colour: '#2a8aa6', style: 'fill' as const, days: calendarDayIndex([{ id: 'e', start: '2027-02-15', end: '2027-02-16', name: 'Half term' }]) },
    ]
    const data = buildExportData({ ...input(span), calendars })
    expect(data.view.calendars.map((c) => c.id)).toEqual(['hols'])
    const cells = data.view.months.flatMap((m) => m.weeks.flat()).filter((c) => c !== null)
    expect(cells.filter((c) => c.calendars.length > 0).map((c) => c.date)).toEqual(['2027-02-15', '2027-02-16'])
    expect(buildExportData(input(span)).view.calendars).toEqual([])
  })

  it('summarises only the exported months, not the whole leave year', () => {
    const span = { start: { year: 2027, month: 2 }, end: { year: 2027, month: 2 } }
    const data = buildExportData(input(span))
    expect(data.people[0].summary.booked).toBe(5)
  })

  it('flags over-limit days across each person leave year overlapping the span', () => {
    const span = { start: { year: 2027, month: 3 }, end: { year: 2027, month: 3 } }
    const data = buildExportData(input(span))
    // Solo (calendar-year 2027): ten days booked of 8 -> the last two (4 and 5 March) are over.
    // Apr person (2026/27): same ten days in the year to March -> same two over.
    const flagged = data.view.months.flatMap((m) => m.weeks.flat()).filter((c) => c?.overLimit).map((c) => c?.date)
    expect(flagged).toEqual(['2027-03-04', '2027-03-05'])
  })
})
