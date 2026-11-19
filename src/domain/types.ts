import type { IsoDate } from './dates'

/** Bank holiday divisions, matching the keys used by the GOV.UK API. */
export type Region = 'england-and-wales' | 'scotland' | 'northern-ireland'

export const REGIONS: { id: Region; label: string }[] = [
  { id: 'england-and-wales', label: 'England & Wales' },
  { id: 'scotland', label: 'Scotland' },
  { id: 'northern-ireland', label: 'Northern Ireland' },
]

export interface Settings {
  /**
   * Days of leave granted per leave year. Half days allowed (e.g. 25.5). For a person this is
   * the default, used for leave years without an override in `allowanceByYear`.
   */
  allowanceDays: number
  /** Days carried over from the previous leave year. A person's default, as for `allowanceDays`. */
  carryOverDays: number
  /**
   * Month the leave year starts (1 = January). Planner-wide, this is the default for
   * people with no company and for new companies; each company has its own.
   */
  leaveYearStartMonth: number
  /** Day of month the leave year starts. Clamped to the month's length. */
  leaveYearStartDay: number
  /** Which set of bank holidays to show. */
  region: Region
  /** Days of the week the user normally works. 0 = Sunday … 6 = Saturday. */
  workingDays: number[]
  /**
   * Days worked in week 2 of a fortnightly pattern (0 = Sunday … 6 = Saturday),
   * or null when every week is the same. `workingDays` is then week 1.
   */
  workingDaysWeek2: number[] | null
  /**
   * A Monday that begins a "week 1". Only matters when `workingDaysWeek2` is set:
   * weeks alternate 1, 2, 1, 2 … counting from this Monday's week.
   */
  fortnightStart: IsoDate
  /**
   * When true, bank holidays falling on working days are deducted from the
   * allowance (e.g. "28 days including bank holidays").
   */
  bankHolidaysDeducted: boolean
  /** Show suggested "bridge" days (leave that joins bank holidays to weekends) on screen. */
  showBridgeSuggestions: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  allowanceDays: 25,
  carryOverDays: 0,
  leaveYearStartMonth: 1,
  leaveYearStartDay: 1,
  region: 'england-and-wales',
  workingDays: [1, 2, 3, 4, 5],
  workingDaysWeek2: null,
  fortnightStart: '2026-01-05', // a Monday
  bankHolidaysDeducted: false,
  showBridgeSuggestions: true,
}

/** Settings that belong to one person rather than the whole planner. */
export const PERSON_SETTING_KEYS = [
  'allowanceDays',
  'carryOverDays',
  'workingDays',
  'workingDaysWeek2',
  'fortnightStart',
  'bankHolidaysDeducted',
] as const

export type PersonSettingKey = (typeof PERSON_SETTING_KEYS)[number]

/** When a leave year resets: a month and day. */
export type LeaveYearStart = Pick<Settings, 'leaveYearStartMonth' | 'leaveYearStartDay'>

/** Per-person part of `Settings`: allowance, carry-over, working pattern (weekly or fortnightly), bank-holiday deduction. */
export type PersonSettings = Pick<Settings, PersonSettingKey>

/** Planner-wide part of `Settings`: default leave year start, region, bridge suggestions. */
export type SharedSettings = Omit<Settings, PersonSettingKey>

export const DEFAULT_PERSON_SETTINGS: PersonSettings = {
  allowanceDays: DEFAULT_SETTINGS.allowanceDays,
  carryOverDays: DEFAULT_SETTINGS.carryOverDays,
  workingDays: DEFAULT_SETTINGS.workingDays,
  workingDaysWeek2: DEFAULT_SETTINGS.workingDaysWeek2,
  fortnightStart: DEFAULT_SETTINGS.fortnightStart,
  bankHolidaysDeducted: DEFAULT_SETTINGS.bankHolidaysDeducted,
}

/** Maximum length of a person's name, after trimming. */
export const PERSON_NAME_MAX = 40

/** Name given to the person created from single-person (v1/v2) saved data, or on first visit. */
export const DEFAULT_PERSON_NAME = 'Me'

/** How a person's or company's days are drawn: a filled cell, or an outline around runs of days. */
export type DayStyle = 'fill' | 'outline'

export const DAY_STYLES: { id: DayStyle; label: string }[] = [
  { id: 'fill', label: 'Filled' },
  { id: 'outline', label: 'Outline' },
]

/** Allowance and/or carry-over for one leave year, overriding the person's defaults. An absent field uses the default. */
export interface YearAllowance {
  allowanceDays?: number
  carryOverDays?: number
}

/** Keyed by the calendar year the leave year starts in, as a string: "2026" is the leave year starting in 2026 (e.g. 2026/27). */
export type AllowanceByYear = Record<string, YearAllowance>

/**
 * Someone whose leave is planned. Each person has their own default allowance and
 * carry-over (with optional per-leave-year overrides in `allowanceByYear`), working
 * pattern and bookings, and a colour used for their leave on the calendar and in the PNG.
 */
export interface Person extends PersonSettings {
  id: string
  name: string
  /** `#rrggbb`, lower case. */
  colour: string
  /** Filled cells (default) or an outline around runs of consecutive days. */
  style: DayStyle
  /**
   * True for someone who takes leave from an allowance. False for someone who just
   * marks dates (e.g. school holidays): any day can be marked, with no allowance.
   */
  tracksAllowance: boolean
  leave: LeaveEntries
  /** Per-leave-year overrides of the default `allowanceDays` / `carryOverDays`. Empty when none. */
  allowanceByYear: AllowanceByYear
  /** Id of a company in the planner's `companies`, or null for none. */
  companyId: string | null
}

export type LeavePortion = 'full' | 'half'

/** Booked leave, keyed by date. Stored independently of any leave year. */
export type LeaveEntries = Record<IsoDate, LeavePortion>

export interface BankHoliday {
  date: IsoDate
  title: string
}

/** Inclusive date range. */
export interface DateRange {
  start: IsoDate
  end: IsoDate
}

/** Maximum length of a company day's name, after trimming. */
export const COMPANY_DAY_NAME_MAX = 60

/**
 * A day the employer gives off or closes on (office closure, extra holiday,
 * birthday leave). It replaces a working day, so leave can't be booked on it.
 */
export interface CompanyDay {
  id: string
  /** The date, or for a repeating day the month and day to repeat on. */
  date: IsoDate
  name: string
  /** Comes out of the allowance (when it falls on one of the user's working days). */
  deducted: boolean
  /** Occurs on the same month and day in every year. */
  repeatsAnnually: boolean
}

/** Maximum length of a company's name, after trimming. */
export const COMPANY_NAME_MAX = 40

/** Name given to the company created from older saved data, or on first visit. */
export const DEFAULT_COMPANY_NAME = 'My company'

/** Name given to a company day assigned without one. */
export const DEFAULT_COMPANY_DAY_NAME = 'Company day'

/** An employer, with the days it gives off. Only its own people are affected by them. */
export interface Company extends LeaveYearStart {
  id: string
  name: string
  /** `#rrggbb`, lower case. Used for this company's days on the calendar. */
  colour: string
  /** How this company's days are drawn. */
  style: DayStyle
  /** Sorted by date. */
  days: CompanyDay[]
}

/** Maximum length of an imported calendar's name, after trimming. */
export const CALENDAR_NAME_MAX = 40

/** Maximum length of one imported event's name, after trimming. */
export const CALENDAR_EVENT_NAME_MAX = 80

/** Maximum number of imported calendars in one planner. */
export const MAX_CALENDARS = 20

/** Maximum number of events kept in one imported calendar. */
export const MAX_CALENDAR_EVENTS = 1000

/** Name given to an imported calendar when the file has none. */
export const DEFAULT_CALENDAR_NAME = 'Imported calendar'

/** Name given to an imported event with no summary. */
export const DEFAULT_CALENDAR_EVENT_NAME = 'Event'

/**
 * One event from an imported calendar: a single date or an inclusive range of dates
 * (a multi-day event such as a half-term week covers every date from `start` to `end`).
 */
export interface CalendarEvent {
  id: string
  start: IsoDate
  /** Inclusive; equal to `start` for a one-day event. Never before `start`. */
  end: IsoDate
  name: string
}

/**
 * Dates imported from an `.ics` file, such as school holidays. Shown on the calendar
 * for information only: separate from people and companies, it never changes an allowance.
 */
export interface ImportedCalendar {
  id: string
  name: string
  /** `#rrggbb`, lower case. */
  colour: string
  /** Filled cells or an outline around runs of consecutive days. */
  style: DayStyle
  /** Shown on the calendar and in the PNG. Hidden calendars are kept but not drawn. */
  visible: boolean
  /** Sorted by start date, then end date. */
  events: CalendarEvent[]
}
