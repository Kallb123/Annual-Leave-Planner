import type { IsoDate } from './dates'

/** Bank holiday divisions, matching the keys used by the GOV.UK API. */
export type Region = 'england-and-wales' | 'scotland' | 'northern-ireland'

export const REGIONS: { id: Region; label: string }[] = [
  { id: 'england-and-wales', label: 'England & Wales' },
  { id: 'scotland', label: 'Scotland' },
  { id: 'northern-ireland', label: 'Northern Ireland' },
]

export interface Settings {
  /** Days of leave granted per leave year. Half days allowed (e.g. 25.5). */
  allowanceDays: number
  /** Days carried over from the previous leave year. */
  carryOverDays: number
  /** Month the leave year starts (1 = January). */
  leaveYearStartMonth: number
  /** Day of month the leave year starts. Clamped to the month's length. */
  leaveYearStartDay: number
  /** Which set of bank holidays to show. */
  region: Region
  /** Days of the week the user normally works. 0 = Sunday … 6 = Saturday. */
  workingDays: number[]
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
  bankHolidaysDeducted: false,
  showBridgeSuggestions: true,
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
