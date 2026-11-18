import { useEffect, useMemo, useReducer } from 'react'
import { summarise } from '../domain/allowance'
import { bankHolidayIndex, coversRange } from '../domain/bankHolidays'
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
  const { settings, leave, yearOffset } = state

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

  const yearView = useMemo(
    () => buildYearView(range, settings, leave, holidays, today),
    [range, settings, leave, holidays, today],
  )

  const summary = useMemo(
    () => summarise(range, settings, leave, holidays),
    [range, settings, leave, holidays],
  )

  return {
    state,
    dispatch,
    range,
    label: leaveYearLabel(range),
    yearView,
    summary,
    hasBankHolidayData: coversRange(range, settings.region),
  }
}

export type Planner = ReturnType<typeof usePlanner>
