import { describe, expect, it } from 'vitest'
import { companyDayIndex, sanitiseCompanyDay, sanitiseCompanyDays, validateCompanyDayInput } from './companyDays'
import type { CompanyDay } from './types'

const day = (over: Partial<CompanyDay> = {}): CompanyDay => ({
  id: 'a',
  date: '2026-12-29',
  name: 'Closure',
  deducted: false,
  repeatsAnnually: false,
  ...over,
})

describe('companyDayIndex', () => {
  it('matches exact dates only for one-off days', () => {
    const index = companyDayIndex([day()])
    expect(index.get('2026-12-29')?.name).toBe('Closure')
    expect(index.get('2027-12-29')).toBeUndefined()
  })

  it('matches the same month and day in any year for repeating days', () => {
    const index = companyDayIndex([day({ repeatsAnnually: true })])
    expect(index.get('2027-12-29')).toBeDefined()
    expect(index.get('2020-12-29')).toBeDefined()
    expect(index.get('2027-12-30')).toBeUndefined()
  })

  it('only matches a repeating 29 February in leap years', () => {
    const index = companyDayIndex([day({ date: '2024-02-29', repeatsAnnually: true })])
    expect(index.get('2028-02-29')).toBeDefined()
    expect(index.get('2027-02-28')).toBeUndefined()
    expect(index.get('2027-03-01')).toBeUndefined()
  })

  it('prefers an exact-date day over a repeating one', () => {
    const index = companyDayIndex([
      day({ id: 'r', name: 'Repeating', repeatsAnnually: true }),
      day({ id: 'e', name: 'Exact' }),
    ])
    expect(index.get('2026-12-29')?.name).toBe('Exact')
    expect(index.get('2027-12-29')?.name).toBe('Repeating')
  })
})

describe('validateCompanyDayInput', () => {
  it('accepts a valid date and name', () => {
    expect(validateCompanyDayInput({ date: '2026-12-29', name: ' Closure ' })).toBeNull()
  })

  it('rejects bad dates, empty names and over-long names', () => {
    expect(validateCompanyDayInput({ date: '', name: 'x' })).toMatch(/date/)
    expect(validateCompanyDayInput({ date: '2026-02-30', name: 'x' })).toMatch(/date/)
    expect(validateCompanyDayInput({ date: '2026-12-29', name: '   ' })).toMatch(/name/)
    expect(validateCompanyDayInput({ date: '2026-12-29', name: 'x'.repeat(61) })).toMatch(/60/)
    expect(validateCompanyDayInput({ date: '2026-12-29', name: 'x'.repeat(60) })).toBeNull()
  })
})

describe('sanitiseCompanyDays', () => {
  it('trims names and coerces flags to booleans', () => {
    expect(sanitiseCompanyDay({ id: 'a', date: '2026-12-29', name: '  Closure ', deducted: 'yes' })).toEqual(
      day({ deducted: false }),
    )
  })

  it('drops invalid entries and duplicate ids, and sorts by date', () => {
    const result = sanitiseCompanyDays([
      day({ id: 'b', date: '2026-12-30' }),
      day({ id: 'a', date: '2026-12-29' }),
      day({ id: 'a', date: '2026-01-01' }), // duplicate id
      day({ id: 'c', date: '2026-02-30' }), // invalid date
      day({ id: 'd', name: '  ' }),
      { id: '', date: '2026-01-01', name: 'x' },
      null,
      'nope',
    ])
    expect(result.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('returns an empty list for non-arrays', () => {
    expect(sanitiseCompanyDays(undefined)).toEqual([])
    expect(sanitiseCompanyDays({})).toEqual([])
  })
})
