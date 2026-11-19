import { daysInMonth, MONTH_NAMES, parseIso, toIso, dayOfWeek, type IsoDate } from './dates'
import { classifyDay, isMarkable, type DayKind } from './allowance'
import type { BankHolidayIndex } from './bankHolidays'
import type { CalendarDayIndex } from './importedCalendars'
import type { CompanyDayIndex } from './companyDays'
import { companyDayColours, halfDayTint, textOn } from '../theme'
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
  /** The visible imported calendars drawn on this view, in display order (for legends). */
  calendars: { id: string; name: string; colour: string; style: DayStyle }[]
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

/** One imported calendar's mark on a day: informational only, it never changes bookability or allowances. */
export interface CalendarMark {
  calendarId: string
  name: string
  colour: string
  style: DayStyle
  /** Names of the events on this date. */
  events: readonly string[]
  /** The same calendar also has events on the previous date, within the same month and the range. */
  joinsPrev: boolean
  /** The same calendar also has events on the next date, within the same month and the range. */
  joinsNext: boolean
}

/** One visible imported calendar's inputs to `buildYearView`, in display order. */
export interface CalendarOverlaySource {
  id: string
  name: string
  colour: string
  style: DayStyle
  days: CalendarDayIndex
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
  /** Imported calendars with events on this day (in range only), in calendar order. */
  calendars: CalendarMark[]
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
  calendars: readonly CalendarOverlaySource[] = [],
): YearView {
  const start = parseIso(range.start)
  const end = parseIso(range.end)
  const months: MonthView[] = []

  let { year, month } = start
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(buildMonth(year, month, range, settings, leave, holidays, companyDays, today, overLimit, people, calendars))
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return {
    range,
    months,
    company,
    calendars: calendars.map((c) => ({ id: c.id, name: c.name, colour: c.colour, style: c.style })),
  }
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
  calendars: readonly CalendarOverlaySource[],
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
  /** Whether this calendar has events on `date` within the range. */
  const hasEvents = (c: CalendarOverlaySource, date: IsoDate) =>
    date >= range.start && date <= range.end && c.days.get(date) !== undefined
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
    const dayCalendars: CalendarMark[] = []
    if (inRange) {
      for (const c of calendars) {
        const events = c.days.get(date)
        if (!events) continue
        dayCalendars.push({
          calendarId: c.id,
          name: c.name,
          colour: c.colour,
          style: c.style,
          events,
          joinsPrev: day > 1 && hasEvents(c, toIso(year, month, day - 1)),
          joinsNext: day < monthLength && hasEvents(c, toIso(year, month, day + 1)),
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
      calendars: dayCalendars,
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

/** Share of the colour kept in a half-day or calendar tint (shared by both renderers). */
export const BAND_TINT = 0.2

/** One diagonal band of a day: a filled person or a filled calendar. */
export interface DayBand {
  /** Cell tone for this band. */
  fill: string
  /** Ring colour for a light band drawn alone (a half day or a calendar tint), else null. */
  ring: string | null
  /** A light tone (half day or calendar tint): the number needs a pill when it sits among several bands. */
  light: boolean
  /** Number colour when this band is the only one; null for the default text colour. */
  text: string | null
}

/**
 * The filled bands of a day, in order: filled people (their colour, or a tint for a half day),
 * then filled calendars (their light tint). Outline people and calendars are drawn as outlines instead.
 */
export function dayBands(cell: Pick<DayCell, 'people' | 'calendars'>): DayBand[] {
  const people = cell.people
    .filter((p) => p.style === 'fill')
    .map<DayBand>((p) =>
      p.portion === 'half'
        ? { fill: halfDayTint(p.colour, BAND_TINT), ring: p.colour, light: true, text: null }
        : { fill: p.colour, ring: null, light: false, text: textOn(p.colour) },
    )
  const calendars = cell.calendars
    .filter((c) => c.style === 'fill')
    .map<DayBand>((c) => {
      const tones = companyDayColours(c.colour)
      return { fill: tones.fill, ring: c.colour, light: true, text: tones.text }
    })
  return [...people, ...calendars]
}

/** Several bands with a light one among them: the number sits on a light pill. */
export const needsPill = (bands: readonly DayBand[]): boolean => bands.length >= 2 && bands.some((b) => b.light)
