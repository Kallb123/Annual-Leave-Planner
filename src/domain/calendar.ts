import { daysInMonth, MONTH_NAMES, parseIso, toIso, dayOfWeek, type IsoDate } from './dates'
import { classifyDay, isBookable, type DayKind } from './allowance'
import type { BankHolidayIndex } from './bankHolidays'
import type { CompanyDayIndex } from './companyDays'
import type { DateRange, LeaveEntries, LeavePortion, Settings } from './types'

/**
 * Renderer-agnostic description of a leave year. Both the on-screen calendar
 * (React) and the PNG exporter (Canvas) draw from this same structure, so the
 * two can never disagree about what a day is.
 */
export interface YearView {
  range: DateRange
  months: MonthView[]
}

export interface MonthView {
  year: number
  month: number
  label: string
  /** Monday-first weeks; `null` pads days belonging to adjacent months. */
  weeks: (DayCell | null)[][]
}

export interface PersonLeave {
  personId: string
  name: string
  colour: string
  portion: LeavePortion
  /** This booking takes that person over their entitlement. */
  overLimit: boolean
  /** True for the person currently being edited. */
  active: boolean
}

/** One person's inputs to `buildYearView`, in display order. */
export interface PersonLeaveSource {
  id: string
  name: string
  colour: string
  active: boolean
  /** Effective settings (shared + that person's), used to decide which days are bookable for them. */
  settings: Settings
  leave: LeaveEntries
  overLimit: ReadonlySet<IsoDate>
}

export interface DayCell {
  date: IsoDate
  day: number
  /** Classification for the active person (their working days). */
  kind: DayKind
  /** False for days in a partial first/last month that fall outside the leave year. */
  inRange: boolean
  /** The active person's portion. */
  leave: LeavePortion | null
  /** Everyone whose leave counts on this day (bookable for them, in range), in people order. Includes the active person. */
  people: PersonLeave[]
  holidayName: string | null
  /** Name of the company day on this date, even when a bank holiday takes precedence. */
  companyDayName: string | null
  isToday: boolean
  /** Booked leave that takes the total over the entitlement (the `overLimit` set, or any person's booking). */
  overLimit: boolean
}

export function buildYearView(
  range: DateRange,
  settings: Pick<Settings, 'workingDays'>,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  today: IsoDate | null = null,
  overLimit: ReadonlySet<IsoDate> = new Set(),
  people: readonly PersonLeaveSource[] = [],
): YearView {
  const start = parseIso(range.start)
  const end = parseIso(range.end)
  const months: MonthView[] = []

  let { year, month } = start
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(buildMonth(year, month, range, settings, leave, holidays, companyDays, today, overLimit, people))
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return { range, months }
}

function buildMonth(
  year: number,
  month: number,
  range: DateRange,
  settings: Pick<Settings, 'workingDays'>,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  today: IsoDate | null,
  overLimit: ReadonlySet<IsoDate>,
  people: readonly PersonLeaveSource[],
): MonthView {
  const cells: (DayCell | null)[] = []
  // Monday-first offset: Mon → 0 … Sun → 6
  const lead = (dayOfWeek(toIso(year, month, 1)) + 6) % 7
  for (let i = 0; i < lead; i++) cells.push(null)

  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = toIso(year, month, day)
    const inRange = date >= range.start && date <= range.end
    const dayPeople: PersonLeave[] = []
    if (inRange) {
      for (const p of people) {
        const portion = p.leave[date]
        if (!portion || !isBookable(date, p.settings, holidays, companyDays)) continue
        dayPeople.push({
          personId: p.id,
          name: p.name,
          colour: p.colour,
          portion,
          overLimit: p.overLimit.has(date),
          active: p.active,
        })
      }
    }
    cells.push({
      date,
      day,
      kind: classifyDay(date, settings, holidays, companyDays),
      inRange,
      leave: inRange ? (leave[date] ?? null) : null,
      people: dayPeople,
      holidayName: holidays.get(date) ?? null,
      companyDayName: companyDays.get(date)?.name ?? null,
      isToday: date === today,
      overLimit: inRange && (overLimit.has(date) || dayPeople.some((p) => p.overLimit)),
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return { year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, weeks }
}
