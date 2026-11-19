import { describe, expect, it } from 'vitest'
import { NO_COMPANY_DAYS } from '../domain/companyDays'
import { DEFAULT_PERSON_SETTINGS, DEFAULT_SETTINGS, type Company, type LeaveEntries, type Person } from '../domain/types'
import { PERSON_COLOURS } from '../theme'
import { personStatus, type PersonStatusInput } from './personStatus'
import { migrateStored } from './plannerState'

const TODAY = '2026-11-19'
const holidays = new Map<string, string>()

const JAN = { leaveYearStartMonth: 1, leaveYearStartDay: 1 }
const APR = { leaveYearStartMonth: 4, leaveYearStartDay: 1 }

const shared = {
  leaveYearStartMonth: DEFAULT_SETTINGS.leaveYearStartMonth,
  leaveYearStartDay: DEFAULT_SETTINGS.leaveYearStartDay,
  region: DEFAULT_SETTINGS.region,
  showBridgeSuggestions: DEFAULT_SETTINGS.showBridgeSuggestions,
}

const janCo: Company = { id: 'jan-co', name: 'Jan Ltd', colour: '#6f5bb8', style: 'fill', ...JAN, days: [] }
const aprCo: Company = { id: 'apr-co', name: 'Apr Ltd', colour: '#2a8aa6', style: 'fill', ...APR, days: [] }
const companies = [janCo, aprCo]

// Mon-Fri weeks in Feb and Mar 2027: ten working days, all in the calendar year 2027
// and all in the April-start leave year 2026/27.
const leave: LeaveEntries = {
  '2027-02-01': 'full', '2027-02-02': 'full', '2027-02-03': 'full', '2027-02-04': 'full', '2027-02-05': 'full',
  '2027-03-01': 'full', '2027-03-02': 'full', '2027-03-03': 'full', '2027-03-04': 'full', '2027-03-05': 'full',
}

const person = (id: string, name: string, companyId: string | null, extra: Partial<Person> = {}): Person => ({
  ...DEFAULT_PERSON_SETTINGS,
  allowanceDays: 8,
  carryOverDays: 0,
  id,
  name,
  colour: PERSON_COLOURS[0],
  style: 'fill',
  tracksAllowance: true,
  leave,
  allowanceByYear: {},
  companyId,
  ...extra,
})

const jan = person('jan', 'Jan', 'jan-co')
const apr = person('apr', 'Apr', 'apr-co')
const solo = person('solo', 'Solo', null)

const input = (p: Person, extra: Partial<PersonStatusInput> = {}): PersonStatusInput => ({
  person: p,
  active: false,
  shared,
  companies,
  today: TODAY,
  yearOffset: 0,
  view: { start: '2026-01-01', end: '2026-12-31' },
  holidays,
  companyDays: NO_COMPANY_DAYS,
  ...extra,
})

describe('personStatus: two people in companies with different leave years', () => {
  it("summarises each person over their own company's leave year", () => {
    const j = personStatus(input(jan))
    expect(j.range).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(j.label).toBe('2026')

    const a = personStatus(input(apr))
    expect(a.range).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(a.label).toBe('2026/27')
  })

  it("counts Feb-Mar 2027 leave in the April person's current year but not the January person's", () => {
    const j = personStatus(input(jan))
    expect(j.summary.booked).toBe(0)
    expect(j.summary.remaining).toBe(8)
    expect(j.warning).toBeNull()

    const a = personStatus(input(apr))
    expect(a.summary.booked).toBe(10)
    expect(a.summary.remaining).toBe(-2)
    expect(a.warning).toContain('2026/27')
    expect(a.warning).toContain('2 days')
  })

  it('moves everyone one of their own leave years forward with yearOffset', () => {
    const j = personStatus(input(jan, { yearOffset: 1 }))
    expect(j.range).toEqual({ start: '2027-01-01', end: '2027-12-31' })
    expect(j.summary.booked).toBe(10)
    expect(j.summary.remaining).toBe(-2)
    expect(j.warning).toContain('2027')
    expect(j.warning).not.toContain('2026/27')

    const a = personStatus(input(apr, { yearOffset: 1 }))
    expect(a.range).toEqual({ start: '2027-04-01', end: '2028-03-31' })
    expect(a.label).toBe('2027/28')
    expect(a.summary.booked).toBe(0)
    expect(a.warning).toBeNull()

    const aBack = personStatus(input(apr, { yearOffset: -1 }))
    expect(aBack.range).toEqual({ start: '2025-04-01', end: '2026-03-31' })
    expect(aBack.summary.booked).toBe(0)
  })

  it("flags over-allowance days across the person's own leave years, whatever the calendar view", () => {
    // View is the January person's 2026 year. The April person's 2026/27 year overlaps it,
    // and is over its limit, so its excess days are flagged even though they fall outside the view.
    const a = personStatus(input(apr, { view: { start: '2026-01-01', end: '2026-12-31' } }))
    expect(a.overLimit.size).toBe(2)
    for (const d of a.overLimit) expect(Object.keys(leave)).toContain(d)

    // The January person has nothing in 2026, so nothing is flagged in the same view.
    expect(personStatus(input(jan, { view: { start: '2026-01-01', end: '2026-12-31' } })).overLimit.size).toBe(0)
  })

  it("flags the January person's excess only when the view reaches their over-limit year", () => {
    const view2027 = { start: '2027-01-01', end: '2027-12-31' }
    expect(personStatus(input(jan, { view: view2027 })).overLimit.size).toBe(2)
    // A view that only touches 2026/27 for the April person (Apr 2026 - Mar 2027) flags it too.
    const aprView = { start: '2026-04-01', end: '2027-03-31' }
    expect(personStatus(input(apr, { view: aprView })).overLimit.size).toBe(2)
    // A view entirely in the following April year does not.
    expect(personStatus(input(apr, { view: { start: '2027-04-01', end: '2028-03-31' } })).overLimit.size).toBe(0)
  })

  it('unions over-limit dates from every leave year a wide view overlaps', () => {
    const wide = { start: '2025-01-01', end: '2028-12-31' }
    const a = personStatus(input(apr, { view: wide }))
    expect(a.overLimit.size).toBe(2)
  })

  it('gives the over-limit dates of the same leave year no matter which person has them', () => {
    const view = { start: '2026-04-01', end: '2027-12-31' }
    // Same leave and allowance, but each person's leave years split the dates differently.
    const j = personStatus(input(jan, { view }))
    const a = personStatus(input(apr, { view }))
    expect(j.overLimit.size).toBe(2)
    expect(a.overLimit.size).toBe(2)
  })

  it('does not warn or flag a person who does not track an allowance', () => {
    const a = personStatus(input({ ...apr, tracksAllowance: false }))
    expect(a.overLimit.size).toBe(0)
    expect(a.warning).toBeNull()
  })

  it('passes active through', () => {
    expect(personStatus(input(jan, { active: true })).active).toBe(true)
    expect(personStatus(input(jan)).person).toBe(jan)
  })
})

describe('personStatus: people with no company', () => {
  it('uses the planner-wide default start', () => {
    const calendar = personStatus(input(solo))
    expect(calendar.range).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(calendar.summary.booked).toBe(0)

    const aprilDefault = personStatus(input(solo, { shared: { ...shared, ...APR } }))
    expect(aprilDefault.range).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(aprilDefault.label).toBe('2026/27')
    expect(aprilDefault.summary.booked).toBe(10)
    expect(aprilDefault.summary.remaining).toBe(-2)
  })

  it('also uses the default when the company id no longer exists', () => {
    const dangling = personStatus(input(person('x', 'X', 'gone'), { shared: { ...shared, ...APR } }))
    expect(dangling.range).toEqual({ start: '2026-04-01', end: '2027-03-31' })
  })

  it("ignores the default for a person in a company", () => {
    const s = personStatus(input(jan, { shared: { ...shared, ...APR } }))
    expect(s.range).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })
})

describe('personStatus: a migrated older plan keeps its totals', () => {
  it('uses the old planner-wide April start for the migrated company', () => {
    const migrated = migrateStored({
      version: 6,
      shared: { ...shared, ...APR },
      people: [{ id: 'a', allowanceDays: 8, carryOverDays: 0, leave, companyId: 'c1' }],
      activePersonId: 'a',
      companies: [{ id: 'c1', name: 'Old Co', days: [] }],
    })!
    const status = personStatus({
      ...input(migrated.people[0]),
      shared: migrated.shared,
      companies: migrated.companies,
    })
    expect(status.range).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(status.label).toBe('2026/27')
    expect(status.summary.booked).toBe(10)
    expect(status.summary.remaining).toBe(-2)
  })

  it('migrates a company-less v2 plan with an April start the same way', () => {
    const migrated = migrateStored({
      version: 2,
      settings: { ...DEFAULT_SETTINGS, ...APR, allowanceDays: 8, carryOverDays: 0 },
      leave,
    })!
    const status = personStatus({
      ...input(migrated.people[0]),
      shared: migrated.shared,
      companies: migrated.companies,
    })
    expect(status.range).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(status.summary.booked).toBe(10)
  })
})

describe('personStatus: per-year allowance overrides', () => {
  // `jan`'s leave year is the calendar year; `apr`'s 2026/27 holds all ten booked days (allowance 8).
  it("applies an override to that year's summary and over-limit days only", () => {
    const view = { start: '2026-04-01', end: '2027-03-31' }
    const plain = personStatus(input(apr, { view }))
    expect(plain.summary.entitlement).toBe(8)
    expect(plain.allowance).toEqual({ allowanceDays: 8, carryOverDays: 0, allowanceOverridden: false, carryOverOverridden: false })
    expect(plain.overLimit.size).toBe(2)

    const boosted = { ...apr, allowanceByYear: { '2026': { allowanceDays: 10, carryOverDays: 1 } } }
    const s = personStatus(input(boosted, { view }))
    expect(s.summary.entitlement).toBe(11)
    expect(s.summary.remaining).toBe(1)
    expect(s.warning).toBeNull()
    expect(s.overLimit.size).toBe(0)
    expect(s.allowance).toEqual({ allowanceDays: 10, carryOverDays: 1, allowanceOverridden: true, carryOverOverridden: true })
  })

  it('does not affect other leave years', () => {
    const boosted = { ...apr, allowanceByYear: { '2026': { allowanceDays: 10 } } }
    const next = personStatus(input(boosted, { yearOffset: 1 }))
    expect(next.range.start).toBe('2027-04-01')
    expect(next.summary.entitlement).toBe(8)
    expect(next.allowance.allowanceOverridden).toBe(false)
  })

  it('gives each leave year in view its own entitlement for over-limit days', () => {
    // Jan-start years: put 5 days in 2026 and 5 in 2027, allowance 4 in 2026 but 5 in 2027.
    const mixed: LeaveEntries = {
      '2026-02-02': 'full', '2026-02-03': 'full', '2026-02-04': 'full', '2026-02-05': 'full', '2026-02-06': 'full',
      '2027-02-01': 'full', '2027-02-02': 'full', '2027-02-03': 'full', '2027-02-04': 'full', '2027-02-05': 'full',
    }
    const p = { ...jan, leave: mixed, allowanceByYear: { '2026': { allowanceDays: 4 }, '2027': { allowanceDays: 5 } } }
    const s = personStatus(input(p, { view: { start: '2026-01-01', end: '2027-12-31' } }))
    expect([...s.overLimit]).toEqual(['2026-02-06'])
  })
})
