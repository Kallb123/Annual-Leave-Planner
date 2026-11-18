import { useEffect, useMemo, useReducer, useState } from 'react'
import { overAllocatedDates, overEntitlementMessage, summarise } from '../domain/allowance'
import { bankHolidayIndex, coversRange } from '../domain/bankHolidays'
import { companyDayIndex } from '../domain/companyDays'
import { findBridges, type Bridge } from '../domain/bridges'
import { buildYearView, type PersonLeaveSource } from '../domain/calendar'
import { parseIso, todayIso, type IsoDate } from '../domain/dates'
import { leaveYearContaining, leaveYearLabel, leaveYearStartingIn } from '../domain/leaveYear'
import type { AllowanceSummary } from '../domain/allowance'
import type { Person } from '../domain/types'
import { activePerson as selectActivePerson, hasSavedState, initialState, persist, personSettings, plannerReducer } from './plannerState'

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
  const { shared, people: peopleList, companyDays: companyDayList, yearOffset } = state
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

  const companyDays = useMemo(() => companyDayIndex(companyDayList), [companyDayList])

  const label = leaveYearLabel(range)

  const people = useMemo<PersonStatus[]>(
    () =>
      peopleList.map((person) => {
        const effective = personSettings(shared, person)
        const summary = summarise(range, effective, person.leave, holidays, companyDays)
        return {
          person,
          active: person.id === activePerson.id,
          summary,
          overLimit: overAllocatedDates(range, effective, person.leave, holidays, companyDays),
          warning: overEntitlementMessage(summary.remaining, label),
        }
      }),
    [peopleList, shared, activePerson.id, range, holidays, companyDays, label],
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
    }))
    return buildYearView(range, settings, leave, holidays, companyDays, today, activeStatus.overLimit, sources)
  }, [people, shared, range, settings, leave, holidays, companyDays, today, activeStatus])

  // Suggestions are computed from the active person's plan and never touch the PNG.
  const bridges = useMemo(
    () =>
      settings.showBridgeSuggestions
        ? findBridges({ range, today, settings, leave, holidays, companyDays })
        : [],
    [range, today, settings, leave, holidays, companyDays],
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
    yearView,
    summary: activeStatus.summary,
    bridges,
    bridgeByDate,
    overEntitlementWarning: activeStatus.warning,
    hasBankHolidayData: coversRange(range, settings.region),
  }
}

export type Planner = ReturnType<typeof usePlanner>
