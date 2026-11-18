import { eachDay, type IsoDate } from './dates'
import type { BankHolidayIndex } from './bankHolidays'
import type { CompanyDayIndex } from './companyDays'
import type { DateRange, LeaveEntries, LeavePortion, Settings } from './types'
import { worksOn, type WorkPattern } from './workPattern'

export type DayKind = 'working' | 'non-working' | 'bank-holiday' | 'company-day'

/**
 * What kind of day `date` is for this user, ignoring any booked leave.
 *
 * Precedence: bank holiday, then company day, then the user's working pattern.
 * So a company day on a bank holiday is a bank holiday, but a company day on a
 * weekend or non-working day still shows as a company day.
 */
export function classifyDay(
  date: IsoDate,
  settings: WorkPattern,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
): DayKind {
  if (holidays.has(date)) return 'bank-holiday'
  if (companyDays.get(date)) return 'company-day'
  return worksOn(settings, date) ? 'working' : 'non-working'
}

/** Leave can only be booked on a working day that isn't a bank holiday or company day. */
export function isBookable(
  date: IsoDate,
  settings: WorkPattern,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
): boolean {
  return classifyDay(date, settings, holidays, companyDays) === 'working'
}

/** Whether a day can be marked: any day for someone with no allowance, otherwise only bookable days. */
export function isMarkable(
  date: IsoDate,
  settings: WorkPattern,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  tracksAllowance: boolean,
): boolean {
  return tracksAllowance ? isBookable(date, settings, holidays, companyDays) : true
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
  /**
   * Company days on working days that come out of the allowance. A company day
   * on a bank holiday, weekend or non-working day never deducts.
   */
  companyDaysDeducted: number
  /** entitlement − booked − bankHolidaysDeducted − companyDaysDeducted. May be negative. */
  remaining: number
}

export function summarise(
  range: DateRange,
  settings: Settings,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  tracksAllowance = true,
): AllowanceSummary {
  if (!tracksAllowance) {
    // No allowance: just count the marked days in range.
    let marked = 0
    for (const date of eachDay(range.start, range.end)) {
      const portion = leave[date]
      if (portion) marked += portionDays(portion)
    }
    return { entitlement: 0, booked: marked, bankHolidaysDeducted: 0, companyDaysDeducted: 0, remaining: 0 }
  }
  let booked = 0
  let bankHolidaysDeducted = 0
  let companyDaysDeducted = 0

  for (const date of eachDay(range.start, range.end)) {
    const portion = leave[date]
    if (portion && isBookable(date, settings, holidays, companyDays)) booked += portionDays(portion)
    if (
      settings.bankHolidaysDeducted &&
      holidays.has(date) &&
      worksOn(settings, date)
    ) {
      bankHolidaysDeducted += 1
    }
    if (
      classifyDay(date, settings, holidays, companyDays) === 'company-day' &&
      companyDays.get(date)?.deducted &&
      worksOn(settings, date)
    ) {
      companyDaysDeducted += 1
    }
  }

  const entitlement = settings.allowanceDays + settings.carryOverDays
  return {
    entitlement,
    booked,
    bankHolidaysDeducted,
    companyDaysDeducted,
    remaining: entitlement - booked - bankHolidaysDeducted - companyDaysDeducted,
  }
}

/**
 * Booked dates that take the running total over the entitlement.
 *
 * Walks the leave year chronologically. Bank holiday and company day
 * deductions are fixed, so they count first; each booked bookable day then
 * adds to the total. A day (or
 * half day) that ends above the entitlement is over, including one that
 * straddles the limit. Only bookable days count, exactly as in `summarise`.
 */
export function overAllocatedDates(
  range: DateRange,
  settings: Settings,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  tracksAllowance = true,
): Set<IsoDate> {
  if (!tracksAllowance) return new Set()
  const { entitlement, bankHolidaysDeducted, companyDaysDeducted } = summarise(
    range,
    settings,
    leave,
    holidays,
    companyDays,
  )
  const over = new Set<IsoDate>()
  let used = bankHolidaysDeducted + companyDaysDeducted

  for (const date of eachDay(range.start, range.end)) {
    const portion = leave[date]
    if (!portion || !isBookable(date, settings, holidays, companyDays)) continue
    used += portionDays(portion)
    if (used > entitlement) over.add(date)
  }
  return over
}

/** "1 day", "half a day", "1.5 days", "2 days". */
export function formatDays(days: number): string {
  if (days === 0.5) return 'half a day'
  const n = Number.isInteger(days) ? String(days) : days.toFixed(1)
  return `${n} ${days === 1 ? 'day' : 'days'}`
}

/** Warning wording shared by the screen and the PNG; null when within entitlement. */
export function overEntitlementMessage(remaining: number, label: string): string | null {
  if (remaining >= 0) return null
  return `You\u2019ve booked ${formatDays(-remaining)} more than your entitlement for ${label}.`
}
