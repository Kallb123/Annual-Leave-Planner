import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { bankHolidayIndex, coversRange } from '../domain/bankHolidays'
import { companyDayIndex, NO_COMPANY_DAYS, type CompanyDayIndex } from '../domain/companyDays'
import { findBridges, type Bridge } from '../domain/bridges'
import { longestStretchWithoutWeekOff } from '../domain/stretches'
import { buildYearView, type CalendarOverlaySource, type PersonLeaveSource, type YearView } from '../domain/calendar'
import { calendarDayIndex } from '../domain/importedCalendars'
import { todayIso } from '../domain/dates'
import { leaveYearAtOffset, leaveYearLabel } from '../domain/leaveYear'
import type { Company, LeaveYearStart, Person } from '../domain/types'
import {
  activePerson as selectActivePerson,
  companyOf,
  initialState,
  leaveYearStartFor,
  persist,
  personSettings,
  plannerReducer,
} from './plannerState'
import { personStatus, type PersonStatus } from './personStatus'
import { buildExportData, type ExportData } from './exportData'
import type { MonthSpan } from '../domain/exportRange'

export type { PersonStatus } from './personStatus'
export type { ExportData, ExportPersonData } from './exportData'

/**
 * Single hook that owns planner state and derives everything the UI needs.
 * Components receive plain data + `dispatch`; none of them compute domain logic.
 */
export function usePlanner() {
  const [state, dispatch] = useReducer(plannerReducer, undefined, () => initialState())
  const { shared, people: peopleList, companies, calendars, editingCompanyId, yearOffset } = state
  const activePerson = selectActivePerson(state)
  const settings = useMemo(() => personSettings(shared, activePerson), [shared, activePerson])
  const leave = activePerson.leave

  useEffect(() => {
    persist(state)
  }, [state])

  const today = todayIso()

  const holidays = useMemo(() => bankHolidayIndex(settings.region), [settings.region])

  /** One index per company, so each person only sees their own company's days. */
  const companyIndexes = useMemo(() => new Map(companies.map((c) => [c.id, companyDayIndex(c.days)])), [companies])
  const indexFor = useCallback(
    (person: Pick<Person, 'companyId'>): CompanyDayIndex =>
      (person.companyId !== null && companyIndexes.get(person.companyId)) || NO_COMPANY_DAYS,
    [companyIndexes],
  )

  const activeCompanyDays = indexFor(activePerson)

  const editingCompany = useMemo<Company | null>(
    () => companies.find((c) => c.id === editingCompanyId) ?? null,
    [companies, editingCompanyId],
  )
  const editingCompanyIndex = editingCompany ? (companyIndexes.get(editingCompany.id) ?? NO_COMPANY_DAYS) : NO_COMPANY_DAYS
  /** What the calendar shows as company days: the company being edited, else the active person's. */
  const viewCompanyDays = editingCompany ? editingCompanyIndex : activeCompanyDays

  /** The company whose days the calendar shows: the one being edited, else the active person's. */
  const viewCompany = useMemo<YearView['company']>(() => {
    const c = editingCompany ?? companyOf(companies, activePerson)
    return c ? { name: c.name, colour: c.colour, style: c.style } : null
  }, [editingCompany, companies, activePerson])

  /**
   * The calendar shows one leave year: the company being edited's, else the active person's
   * (their company's, or the planner default). Each person is still summarised over their own.
   */
  const viewStart = useMemo<LeaveYearStart>(
    () =>
      editingCompany
        ? leaveYearStartFor(shared, companies, { companyId: editingCompany.id })
        : leaveYearStartFor(shared, companies, activePerson),
    [editingCompany, shared, companies, activePerson],
  )
  const { leaveYearStartMonth: viewStartMonth, leaveYearStartDay: viewStartDay } = viewStart
  const range = useMemo(
    () =>
      leaveYearAtOffset(today, yearOffset, { leaveYearStartMonth: viewStartMonth, leaveYearStartDay: viewStartDay }),
    [today, yearOffset, viewStartMonth, viewStartDay],
  )
  const label = leaveYearLabel(range)

  const people = useMemo<PersonStatus[]>(
    () =>
      peopleList.map((person) =>
        personStatus({
          person,
          active: person.id === activePerson.id,
          shared,
          companies,
          today,
          yearOffset,
          view: range,
          holidays,
          companyDays: indexFor(person),
        }),
      ),
    [peopleList, activePerson.id, shared, companies, today, yearOffset, range, holidays, indexFor],
  )

  /** Each company's own leave year at the current offset, e.g. for counting its company days. */
  const companyRanges = useMemo(
    () => new Map(companies.map((c) => [c.id, leaveYearAtOffset(today, yearOffset, c)])),
    [companies, today, yearOffset],
  )

  const activeStatus = people.find((p) => p.active) ?? people[0]
  /** The active person's own leave year, which differs from `range` only while editing another company's days. */
  const activeRange = activeStatus.range

  /** One day index per imported calendar, rebuilt only when the calendar itself changes. */
  const calendarIndexes = useMemo(() => new Map(calendars.map((c) => [c.id, calendarDayIndex(c.events)])), [calendars])
  /** The visible imported calendars, in display order, for the calendar and the PNG. */
  const calendarSources = useMemo<CalendarOverlaySource[]>(
    () =>
      calendars
        .filter((c) => c.visible)
        .map((c) => ({ id: c.id, name: c.name, colour: c.colour, style: c.style, days: calendarIndexes.get(c.id)! })),
    [calendars, calendarIndexes],
  )

  const yearView = useMemo(() => {
    const sources: PersonLeaveSource[] = people.map((p) => ({
      id: p.person.id,
      name: p.person.name,
      colour: p.person.colour,
      style: p.person.style,
      tracksAllowance: p.person.tracksAllowance,
      active: p.active,
      settings: personSettings(shared, p.person),
      leave: p.person.leave,
      overLimit: p.overLimit,
      companyDays: indexFor(p.person),
    }))
    return buildYearView(
      range,
      settings,
      leave,
      holidays,
      viewCompanyDays,
      today,
      activeStatus.overLimit,
      sources,
      viewCompany,
      calendarSources,
    )
  }, [people, shared, range, settings, leave, holidays, viewCompanyDays, today, activeStatus, indexFor, viewCompany, calendarSources])

  /** What the PNG export draws for a month span: the viewed leave year as-is, or a custom range. */
  const exportFor = useCallback(
    (span: MonthSpan): ExportData =>
      buildExportData({
        span,
        range,
        label,
        yearView,
        people,
        shared,
        companies,
        today,
        yearOffset,
        holidays,
        viewCompanyDays,
        viewCompany,
        calendars: calendarSources,
        indexFor,
      }),
    [range, label, yearView, people, shared, companies, today, yearOffset, holidays, viewCompanyDays, viewCompany, calendarSources, indexFor],
  )

  // Suggestions are computed from the active person's plan and never touch the PNG.
  const bridges = useMemo(
    () =>
      settings.showBridgeSuggestions && activePerson.tracksAllowance
        ? findBridges({ range: activeRange, today, settings, leave, holidays, companyDays: activeCompanyDays })
        : [],
    [activeRange, today, settings, leave, holidays, activeCompanyDays, activePerson.tracksAllowance],
  )

  // The longest gap between weeks off in the active person's leave year. Screen-only, like bridges.
  const longestStretch = useMemo(
    () =>
      settings.showBridgeSuggestions && activePerson.tracksAllowance
        ? longestStretchWithoutWeekOff({ range: activeRange, settings, leave, holidays, companyDays: activeCompanyDays })
        : null,
    [activeRange, settings, leave, holidays, activeCompanyDays, activePerson.tracksAllowance],
  )

  /** The best-ranked suggestion covering each day (bridges never overlap, but be explicit). */
  const bridgeByDate = useMemo(() => {
    const map = new Map<string, Bridge>()
    for (const b of bridges) for (const d of b.dates) if (!map.has(d)) map.set(d, b)
    return map
  }, [bridges])

  return {
    state,
    dispatch,
    range,
    label,
    settings,
    activePerson,
    people,
    companies,
    editingCompany,
    editingCompanyIndex,
    viewCompany,
    yearView,
    exportFor,
    summary: activeStatus.summary,
    /** The active person's leave year label, for their summary (may differ from `label` in company-day mode). */
    activeLabel: activeStatus.label,
    activeRange,
    companyRanges,
    bridges,
    bridgeByDate,
    longestStretch,
    today,
    overEntitlementWarning: activeStatus.warning,
    hasBankHolidayData: coversRange(range, settings.region),
  }
}

export type Planner = ReturnType<typeof usePlanner>
