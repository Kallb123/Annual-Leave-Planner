import { isIsoDate, type IsoDate } from './dates'
import { COMPANY_DAY_NAME_MAX, type CompanyDay } from './types'

/**
 * Read-only lookup of company days by date. Domain functions take this rather
 * than the whole planner state (like `BankHolidayIndex` for bank holidays).
 */
export interface CompanyDayIndex {
  get(date: IsoDate): CompanyDay | undefined
}

export const NO_COMPANY_DAYS: CompanyDayIndex = { get: () => undefined }

/**
 * Index company days for lookup.
 *
 * - A repeating day matches the same month and day in any year, including
 *   years before its stored date. A repeating 29 February therefore only
 *   occurs in leap years.
 * - If several company days match a date, one on exactly that date beats a
 *   repeating one; otherwise the earliest in the list wins.
 */
export function companyDayIndex(days: readonly CompanyDay[]): CompanyDayIndex {
  const exact = new Map<IsoDate, CompanyDay>()
  const repeating = new Map<string, CompanyDay>() // keyed by "MM-DD"
  for (const day of days) {
    const target = day.repeatsAnnually ? repeating : exact
    const key = day.repeatsAnnually ? day.date.slice(5) : day.date
    if (!target.has(key)) target.set(key, day)
  }
  return {
    get: (date) => exact.get(date) ?? repeating.get(date.slice(5)),
  }
}

export interface CompanyDayInput {
  date: string
  name: string
}

/** Error message for a new company day's inputs, or null when valid. */
export function validateCompanyDayInput({ date, name }: CompanyDayInput): string | null {
  if (!isIsoDate(date)) return 'Choose a valid date.'
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a name.'
  if (trimmed.length > COMPANY_DAY_NAME_MAX) return `Name must be ${COMPANY_DAY_NAME_MAX} characters or fewer.`
  return null
}

/** Validate one untrusted value (from storage or a form). Null if unusable. */
export function sanitiseCompanyDay(value: unknown): CompanyDay | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || !v.id || typeof v.date !== 'string' || typeof v.name !== 'string') return null
  const name = v.name.trim()
  if (validateCompanyDayInput({ date: v.date, name })) return null
  return {
    id: v.id,
    date: v.date,
    name,
    deducted: v.deducted === true,
    repeatsAnnually: v.repeatsAnnually === true,
  }
}

const MAX_COMPANY_DAYS = 500

/** Drop invalid entries and duplicate ids, cap the count, and sort by date. */
export function sanitiseCompanyDays(value: unknown): CompanyDay[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: CompanyDay[] = []
  for (const item of value) {
    const day = sanitiseCompanyDay(item)
    if (!day || seen.has(day.id)) continue
    seen.add(day.id)
    out.push(day)
    if (out.length >= MAX_COMPANY_DAYS) break
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
