import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { overAllocatedDates, overEntitlementMessage, summarise } from '../domain/allowance'
import { bankHolidayIndex, coversRange } from '../domain/bankHolidays'
import { companyDayIndex, NO_COMPANY_DAYS, type CompanyDayIndex } from '../domain/companyDays'
import { findBridges, type Bridge } from '../domain/bridges'
import { buildYearView, type PersonLeaveSource } from '../domain/calendar'
import { parseIso, todayIso, type IsoDate } from '../domain/dates'
import { leaveYearContaining, leaveYearLabel, leaveYearStartingIn } from '../domain/leaveYear'
import type { AllowanceSummary } from '../domain/allowance'
import type { Company, Person } from '../domain/types'
import {
  activePerson as selectActivePerson,
  hasSavedState,
  initialState,
  persist,
  personSettings,
  plannerReducer,
} from './plannerState'

export interface PersonStatus {
  person: Person
  active: boolean
  summary: AllowanceSummary
  overLimit: ReadonlySet<IsoDate>
  warning: string | null
}

/**
 * Single hook that owns planner state and derives everything the UI needs.
 * Components receive plain data + `dispatch`; none of them compute domain logic.
 */
export function usePlanner() {
  const [state, dispatch] = useReducer(plannerReducer, undefined, () => initialState())
  // Read once, during the first render, before the persist effect below writes to storage.
  const [hadSavedState] = useState(() => hasSavedState())
  const { shared, people: peopleList, companies, editingCompanyId, yearOffset } = state
  const activePerson = selectActivePerson(state)
  const settings = useMemo(() => personSettings(shared, activePerson), [shared, activePerson])
  const leave = activePerson.leave

  useEffect(() => {
    persist(state)
  }, [state])

  const today = todayIso()

  const range = useMemo(() => {
    const current = leaveYearContaining(today, settings)
    const startYear = parseIso(current.start).year + yearOffset
    return leaveYearStartingIn(startYear, settings)
  }, [today, settings, yearOffset])

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

  const label = leaveYearLabel(range)

  const people = useMemo<PersonStatus[]>(
    () =>
      peopleList.map((person) => {
        const effective = personSettings(shared, person)
        const companyDays = indexFor(person)
        const summary = summarise(range, effective, person.leave, holidays, companyDays)
        return {
          person,
          active: person.id === activePerson.id,
          summary,
          overLimit: overAllocatedDates(range, effective, person.leave, holidays, companyDays),
          warning: overEntitlementMessage(summary.remaining, label),
        }
      }),
    [peopleList, shared, activePerson.id, range, holidays, indexFor, label],
  )

  const activeStatus = people.find((p) => p.active) ?? people[0]

  const yearView = useMemo(() => {
    const sources: PersonLeaveSource[] = people.map((p) => ({
      id: p.person.id,
      name: p.person.name,
      colour: p.person.colour,
      active: p.active,
      settings: personSettings(shared, p.person),
      leave: p.person.leave,
      overLimit: p.overLimit,
      companyDays: indexFor(p.person),
    }))
    return buildYearView(range, settings, leave, holidays, viewCompanyDays, today, activeStatus.overLimit, sources)
  }, [people, shared, range, settings, leave, holidays, viewCompanyDays, today, activeStatus, indexFor])

  // Suggestions are computed from the active person's plan and never touch the PNG.
  const bridges = useMemo(
    () =>
      settings.showBridgeSuggestions
        ? findBridges({ range, today, settings, leave, holidays, companyDays: activeCompanyDays })
        : [],
    [range, today, settings, leave, holidays, activeCompanyDays],
  )

  /** The best-ranked suggestion covering each day (bridges never overlap, but be explicit). */
  const bridgeByDate = useMemo(() => {
    const map = new Map<string, Bridge>()
    for (const b of bridges) for (const d of b.dates) if (!map.has(d)) map.set(d, b)
    return map
  }, [bridges])

  return {
    state,
    hadSavedState,
    dispatch,
    range,
    label,
    settings,
    activePerson,
    people,
    companies,
    editingCompany,
    editingCompanyIndex,
    yearView,
    summary: activeStatus.summary,
    bridges,
    bridgeByDate,
    overEntitlementWarning: activeStatus.warning,
    hasBankHolidayData: coversRange(range, settings.region),
  }
}

export type Planner = ReturnType<typeof usePlanner>
