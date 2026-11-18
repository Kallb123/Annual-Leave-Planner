import { useEffect, useMemo, useReducer } from 'react'
import { overAllocatedDates, overEntitlementMessage, summarise } from '../domain/allowance'
import { bankHolidayIndex, coversRange } from '../domain/bankHolidays'
import { companyDayIndex } from '../domain/companyDays'
import { findBridges, type Bridge } from '../domain/bridges'
import { buildYearView } from '../domain/calendar'
import { parseIso, todayIso } from '../domain/dates'
import { leaveYearContaining, leaveYearLabel, leaveYearStartingIn } from '../domain/leaveYear'
import { initialState, persist, plannerReducer } from './plannerState'

/**
 * Single hook that owns planner state and derives everything the UI needs.
 * Components receive plain data + `dispatch`; none of them compute domain logic.
 */
export function usePlanner() {
  const [state, dispatch] = useReducer(plannerReducer, undefined, () => initialState())
  const { settings, leave, companyDays: companyDayList, yearOffset } = state

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

  const overLimit = useMemo(
    () => overAllocatedDates(range, settings, leave, holidays, companyDays),
    [range, settings, leave, holidays, companyDays],
  )

  const yearView = useMemo(
    () => buildYearView(range, settings, leave, holidays, companyDays, today, overLimit),
    [range, settings, leave, holidays, companyDays, today, overLimit],
  )

  // Suggestions are computed from the planner state and never touch the PNG.
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

  const summary = useMemo(
    () => summarise(range, settings, leave, holidays, companyDays),
    [range, settings, leave, holidays, companyDays],
  )

  const label = leaveYearLabel(range)

  return {
    state,
    dispatch,
    range,
    label,
    yearView,
    summary,
    bridges,
    bridgeByDate,
    overEntitlementWarning: overEntitlementMessage(summary.remaining, label),
    hasBankHolidayData: coversRange(range, settings.region),
  }
}

export type Planner = ReturnType<typeof usePlanner>
