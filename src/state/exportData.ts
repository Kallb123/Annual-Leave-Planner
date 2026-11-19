import { summarise, type AllowanceSummary } from '../domain/allowance'
import type { BankHolidayIndex } from '../domain/bankHolidays'
import { buildYearView, type PersonLeaveSource, type YearView } from '../domain/calendar'
import type { CompanyDayIndex } from '../domain/companyDays'
import type { IsoDate } from '../domain/dates'
import { monthsOfRange, rangeOfMonths, sameMonthSpan, type MonthSpan } from '../domain/exportRange'
import type { Company, DateRange, Person, SharedSettings } from '../domain/types'
import { personSettings } from './plannerState'
import { personStatus, type PersonStatus } from './personStatus'

export interface ExportPersonData {
  person: Person
  /** Totals: over the person's own leave year when exporting the viewed leave year, else over the exported range. */
  summary: AllowanceSummary
  /** Over-entitlement warning; only when exporting the viewed leave year, else null. */
  warning: string | null
  /** The person's own leave year label when exporting the viewed leave year and it differs from `label`; else undefined. */
  yearLabel?: string
}

export interface ExportData {
  /** What to draw. */
  view: YearView
  /** Date range drawn. */
  range: DateRange
  /**
   * True when `span` is exactly the months of the viewed leave year: then the export is
   * identical to the screen's (partial first/last months keep out-of-range days dimmed).
   */
  isLeaveYear: boolean
  people: ExportPersonData[]
}

export interface ExportDataInput {
  span: MonthSpan
  /** The viewed leave year, its label and calendar. */
  range: DateRange
  label: string
  yearView: YearView
  /** Each person's status over the viewed leave year. */
  people: readonly PersonStatus[]
  shared: SharedSettings
  companies: readonly Company[]
  today: IsoDate
  yearOffset: number
  holidays: BankHolidayIndex
  /** Company days and company shown on the calendar. */
  viewCompanyDays: CompanyDayIndex
  viewCompany: YearView['company']
  indexFor: (person: Pick<Person, 'companyId'>) => CompanyDayIndex
}

/** What the PNG export draws for `span`: the viewed leave year as-is, or a custom month range. */
export function buildExportData(input: ExportDataInput): ExportData {
  const { span, range, label, yearView, people, shared, companies, today, yearOffset, holidays, indexFor } = input

  if (sameMonthSpan(span, monthsOfRange(range))) {
    return {
      view: yearView,
      range,
      isLeaveYear: true,
      people: people.map((p) => ({
        person: p.person,
        summary: p.summary,
        warning: p.warning,
        yearLabel: p.label !== label ? p.label : undefined,
      })),
    }
  }

  const exportRange = rangeOfMonths(span)
  // Over-allowance days across every leave year that overlaps the exported months.
  const statuses = people.map((p) =>
    personStatus({
      person: p.person,
      active: p.active,
      shared,
      companies,
      today,
      yearOffset,
      view: exportRange,
      holidays,
      companyDays: indexFor(p.person),
    }),
  )
  const sources: PersonLeaveSource[] = statuses.map((s) => ({
    id: s.person.id,
    name: s.person.name,
    colour: s.person.colour,
    style: s.person.style,
    tracksAllowance: s.person.tracksAllowance,
    active: s.active,
    settings: personSettings(shared, s.person),
    leave: s.person.leave,
    overLimit: s.overLimit,
    companyDays: indexFor(s.person),
  }))
  const active = statuses.find((s) => s.active) ?? statuses[0]
  const view = buildYearView(
    exportRange,
    personSettings(shared, active.person),
    active.person.leave,
    holidays,
    input.viewCompanyDays,
    today,
    active.overLimit,
    sources,
    input.viewCompany,
  )
  return {
    view,
    range: exportRange,
    isLeaveYear: false,
    people: statuses.map((s) => ({
      person: s.person,
      summary: summarise(
        exportRange,
        personSettings(shared, s.person),
        s.person.leave,
        holidays,
        indexFor(s.person),
        s.person.tracksAllowance,
      ),
      warning: null,
    })),
  }
}
