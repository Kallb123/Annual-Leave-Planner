import { overAllocatedDates, overEntitlementMessage, summarise, type AllowanceSummary } from '../domain/allowance'
import type { BankHolidayIndex } from '../domain/bankHolidays'
import type { CompanyDayIndex } from '../domain/companyDays'
import type { IsoDate } from '../domain/dates'
import { leaveYearAtOffset, leaveYearLabel, leaveYearsOverlapping } from '../domain/leaveYear'
import type { Company, DateRange, Person, SharedSettings } from '../domain/types'
import { leaveYearStartFor, personSettings } from './plannerState'

export interface PersonStatus {
  person: Person
  active: boolean
  /** This person's own leave year (their company's, or the planner default), at the current year offset. */
  range: DateRange
  /** `range`'s label, e.g. "2026" or "2026/27". */
  label: string
  /** Totals over `range`. */
  summary: AllowanceSummary
  /**
   * Booked dates over the entitlement, across every one of this person's leave years that
   * overlaps the calendar's view (which may follow someone else's leave year).
   */
  overLimit: ReadonlySet<IsoDate>
  warning: string | null
}

export interface PersonStatusInput {
  person: Person
  active: boolean
  shared: SharedSettings
  companies: readonly Company[]
  today: IsoDate
  /** Leave years forward/back from the one each person is in today. */
  yearOffset: number
  /** The range the calendar shows, used to flag over-allowance days in view. */
  view: DateRange
  holidays: BankHolidayIndex
  companyDays: CompanyDayIndex
}

/**
 * One person's totals over their own leave year. People in companies with different
 * leave years are each summarised over theirs; "this year" for everyone is the leave
 * year they are in today, shifted by the same `yearOffset`.
 */
export function personStatus(input: PersonStatusInput): PersonStatus {
  const { person, active, shared, companies, today, yearOffset, view, holidays, companyDays } = input
  const settings = personSettings(shared, person)
  const start = leaveYearStartFor(shared, companies, person)
  const range = leaveYearAtOffset(today, yearOffset, start)
  const label = leaveYearLabel(range)
  const summary = summarise(range, settings, person.leave, holidays, companyDays, person.tracksAllowance)

  const overLimit = new Set<IsoDate>()
  for (const year of leaveYearsOverlapping(view, start)) {
    for (const d of overAllocatedDates(year, settings, person.leave, holidays, companyDays, person.tracksAllowance)) {
      overLimit.add(d)
    }
  }

  return {
    person,
    active,
    range,
    label,
    summary,
    overLimit,
    warning: overEntitlementMessage(summary.remaining, label),
  }
}
