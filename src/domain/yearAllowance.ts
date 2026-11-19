import type { AllowanceByYear, DateRange, Settings } from './types'

/** Key for a leave year in AllowanceByYear: the calendar year its start date falls in. */
export function leaveYearKey(range: DateRange): string {
  return range.start.slice(0, 4)
}

/** Effective allowance for one leave year, and which parts are overridden. */
export interface EffectiveAllowance {
  allowanceDays: number
  carryOverDays: number
  allowanceOverridden: boolean
  carryOverOverridden: boolean
}

export function yearAllowanceFor(
  defaults: Pick<Settings, 'allowanceDays' | 'carryOverDays'>,
  allowanceByYear: AllowanceByYear,
  range: DateRange,
): EffectiveAllowance {
  const override = allowanceByYear[leaveYearKey(range)]
  const allowance = override?.allowanceDays
  const carryOver = override?.carryOverDays
  return {
    allowanceDays: allowance ?? defaults.allowanceDays,
    carryOverDays: carryOver ?? defaults.carryOverDays,
    allowanceOverridden: allowance !== undefined,
    carryOverOverridden: carryOver !== undefined,
  }
}

/** `settings` with that leave year's allowance and carry-over applied. */
export function settingsForLeaveYear(settings: Settings, allowanceByYear: AllowanceByYear, range: DateRange): Settings {
  const { allowanceDays, carryOverDays } = yearAllowanceFor(settings, allowanceByYear, range)
  return { ...settings, allowanceDays, carryOverDays }
}
