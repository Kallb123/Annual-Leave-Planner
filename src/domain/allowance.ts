import { dayOfWeek, eachDay, type IsoDate } from './dates'
import type { BankHolidayIndex } from './bankHolidays'
import type { DateRange, LeaveEntries, LeavePortion, Settings } from './types'

export type DayKind = 'working' | 'non-working' | 'bank-holiday'

/** What kind of day `date` is for this user, ignoring any booked leave. */
export function classifyDay(
  date: IsoDate,
  settings: Pick<Settings, 'workingDays'>,
  holidays: BankHolidayIndex,
): DayKind {
  if (holidays.has(date)) return 'bank-holiday'
  return settings.workingDays.includes(dayOfWeek(date)) ? 'working' : 'non-working'
}

/** Leave can only be booked on a working day that isn't a bank holiday. */
export function isBookable(
  date: IsoDate,
  settings: Pick<Settings, 'workingDays'>,
  holidays: BankHolidayIndex,
): boolean {
  return classifyDay(date, settings, holidays) === 'working'
}

export function portionDays(portion: LeavePortion): number {
  return portion === 'half' ? 0.5 : 1
}

export interface AllowanceSummary {
  /** allowance + carry-over */
  entitlement: number
  /** Leave the user has booked in this leave year. */
  booked: number
  /** Bank holidays on working days deducted from the allowance (0 if not deducted). */
  bankHolidaysDeducted: number
  /** entitlement − booked − bankHolidaysDeducted. May be negative. */
  remaining: number
}

export function summarise(
  range: DateRange,
  settings: Settings,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
): AllowanceSummary {
  let booked = 0
  let bankHolidaysDeducted = 0

  for (const date of eachDay(range.start, range.end)) {
    const portion = leave[date]
    if (portion && isBookable(date, settings, holidays)) booked += portionDays(portion)
    if (
      settings.bankHolidaysDeducted &&
      holidays.has(date) &&
      settings.workingDays.includes(dayOfWeek(date))
    ) {
      bankHolidaysDeducted += 1
    }
  }

  const entitlement = settings.allowanceDays + settings.carryOverDays
  return {
    entitlement,
    booked,
    bankHolidaysDeducted,
    remaining: entitlement - booked - bankHolidaysDeducted,
  }
}
