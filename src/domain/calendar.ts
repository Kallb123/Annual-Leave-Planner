import { daysInMonth, MONTH_NAMES, parseIso, toIso, dayOfWeek, type IsoDate } from './dates'
import { classifyDay, type DayKind } from './allowance'
import type { BankHolidayIndex } from './bankHolidays'
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

export interface DayCell {
  date: IsoDate
  day: number
  kind: DayKind
  /** False for days in a partial first/last month that fall outside the leave year. */
  inRange: boolean
  leave: LeavePortion | null
  holidayName: string | null
  isToday: boolean
  /** Booked leave that takes the total over the entitlement. */
  overLimit: boolean
}

export function buildYearView(
  range: DateRange,
  settings: Pick<Settings, 'workingDays'>,
  leave: LeaveEntries,
  holidays: BankHolidayIndex,
  today: IsoDate | null = null,
  overLimit: ReadonlySet<IsoDate> = new Set(),
): YearView {
  const start = parseIso(range.start)
  const end = parseIso(range.end)
  const months: MonthView[] = []

  let { year, month } = start
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(buildMonth(year, month, range, settings, leave, holidays, today, overLimit))
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
  today: IsoDate | null,
  overLimit: ReadonlySet<IsoDate>,
): MonthView {
  const cells: (DayCell | null)[] = []
  // Monday-first offset: Mon → 0 … Sun → 6
  const lead = (dayOfWeek(toIso(year, month, 1)) + 6) % 7
  for (let i = 0; i < lead; i++) cells.push(null)

  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = toIso(year, month, day)
    const inRange = date >= range.start && date <= range.end
    cells.push({
      date,
      day,
      kind: classifyDay(date, settings, holidays),
      inRange,
      leave: inRange ? (leave[date] ?? null) : null,
      holidayName: holidays.get(date) ?? null,
      isToday: date === today,
      overLimit: inRange && overLimit.has(date),
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return { year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, weeks }
}
