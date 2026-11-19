import { daysInMonth, MONTH_NAMES, parseIso, toIso, dayOfWeek, type IsoDate } from './dates'
import { classifyDay, isMarkable, type DayKind } from './allowance'
import type { BankHolidayIndex } from './bankHolidays'
import type { CompanyDayIndex } from './companyDays'
import type { CompanyDay, DateRange, DayStyle, LeaveEntries, LeavePortion, Settings } from './types'
import type { WorkPattern } from './workPattern'

/**
 * Renderer-agnostic description of a leave year. Both the on-screen calendar
 * (React) and the PNG exporter (Canvas) draw from this same structure, so the
 * two can never disagree about what a day is.
 */
export interface YearView {
  range: DateRange
  months: MonthView[]
  /** The company whose days are shown (the one being edited, else the active person's), or null. */
  company: { name: string; colour: string; style: DayStyle } | null
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
  style: DayStyle
  /** False for someone who just marks dates: no allowance, any day can be marked. */
  tracksAllowance: boolean
  portion: LeavePortion
  /** The same person also has a counted mark on the previous date, within the same month. */
  joinsPrev: boolean
  /** The same person also has a counted mark on the next date, within the same month. */
  joinsNext: boolean
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
  style: DayStyle
  tracksAllowance: boolean
  active: boolean
  /** Effective settings (shared + that person's), used to decide which days are bookable for them. */
  settings: Settings
  leave: LeaveEntries
  overLimit: ReadonlySet<IsoDate>
  /** That person's company days; they decide which days count as bookable for them. */
  companyDays: CompanyDayIndex
}

export interface DayCell {
  date: IsoDate
  day: number
  /** Classification for the active person (their working days). */
  kind: DayKind
  /** False for days in a partial first/last month that fall outside the leave year. */
  inRange: boolean
  /** In range and markable for the active person (any day if they don't track an allowance, else a working day). */
  bookable: boolean
  /** The previous / next date in the same month is also a company day. */
  companyJoinsPrev: boolean
  companyJoinsNext: boolean
  /** The active person's portion. */
  leave: LeavePortion | null
  /** Everyone whose leave counts on this day (bookable for them, in range), in people order. Includes the active person. */
  people: PersonLeave[]
  holidayName: string | null
  /** Name of the company day on this date, even when a bank holiday takes precedence. */
  companyDayName: string | null
  /** The company day on this date in the index passed to `buildYearView`, if any. */
  companyDay: CompanyDay | null
  isToday: boolean
  /** Booked leave that takes the total over the entitlement (the `overLimit` set, or any person's booking). */
  overLimit: boolean
}

export function buildYearView(
  range: DateRange,
  settings: WorkPattern,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  today: IsoDate | null = null,
  overLimit: ReadonlySet<IsoDate> = new Set(),
  people: readonly PersonLeaveSource[] = [],
  company: YearView['company'] = null,
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
  return { range, months, company }
}

function buildMonth(
  year: number,
  month: number,
  range: DateRange,
  settings: WorkPattern,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  companyDays: CompanyDayIndex,
  today: IsoDate | null,
  overLimit: ReadonlySet<IsoDate>,
  people: readonly PersonLeaveSource[],
): MonthView {
  const cells: (DayCell | null)[] = []
  const monthLength = daysInMonth(year, month)
  const activeSource = people.find((p) => p.active)
  /** Whether this person's mark on `date` counts: in range, has leave, and markable for them. */
  const counts = (p: PersonLeaveSource, date: IsoDate) =>
    date >= range.start &&
    date <= range.end &&
    p.leave[date] !== undefined &&
    isMarkable(date, p.settings, holidays, p.companyDays, p.tracksAllowance)
  // Monday-first offset: Mon → 0 … Sun → 6
  const lead = (dayOfWeek(toIso(year, month, 1)) + 6) % 7
  for (let i = 0; i < lead; i++) cells.push(null)

  for (let day = 1; day <= monthLength; day++) {
    const date = toIso(year, month, day)
    const inRange = date >= range.start && date <= range.end
    const dayPeople: PersonLeave[] = []
    if (inRange) {
      for (const p of people) {
        const portion = p.leave[date]
        if (!portion || !counts(p, date)) continue
        dayPeople.push({
          personId: p.id,
          name: p.name,
          colour: p.colour,
          style: p.style,
          tracksAllowance: p.tracksAllowance,
          portion,
          joinsPrev: day > 1 && counts(p, toIso(year, month, day - 1)),
          joinsNext: day < monthLength && counts(p, toIso(year, month, day + 1)),
          overLimit: p.overLimit.has(date),
          active: p.active,
        })
      }
    }
    const companyDay = companyDays.get(date) ?? null
    const kind = classifyDay(date, settings, holidays, companyDays)
    const isCompanyDay = (d: number) =>
      classifyDay(toIso(year, month, d), settings, holidays, companyDays) === 'company-day'
    cells.push({
      date,
      day,
      kind,
      inRange,
      bookable: inRange && (activeSource?.tracksAllowance === false || kind === 'working'),
      companyJoinsPrev: kind === 'company-day' && day > 1 && isCompanyDay(day - 1),
      companyJoinsNext: kind === 'company-day' && day < monthLength && isCompanyDay(day + 1),
      leave: inRange ? (leave[date] ?? null) : null,
      people: dayPeople,
      holidayName: holidays.get(date) ?? null,
      companyDayName: companyDay?.name ?? null,
      companyDay,
      isToday: date === today,
      overLimit: inRange && (overLimit.has(date) || dayPeople.some((p) => p.overLimit)),
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return { year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, weeks }
}
