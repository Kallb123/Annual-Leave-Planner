import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERSON_NAME,
  DEFAULT_PERSON_SETTINGS,
  DEFAULT_SETTINGS,
  PERSON_NAME_MAX,
  COMPANY_NAME_MAX,
  DEFAULT_COMPANY_DAY_NAME,
  type Company,
  type CompanyDay,
  type LeaveEntries,
  type Person,
  type Settings,
} from '../domain/types'
import { PERSON_COLOURS } from '../theme'
import {
  STORAGE_KEY,
  MAX_COMPANIES,
  activePerson,
  companyIndexFor,
  companyOf,
  hasSavedState,
  initialState,
  describePlan,
  migrateStored,
  parsePlan,
  persist,
  sanitiseSettings,
  serialisePlan,
  personSettings,
  plannerReducer,
  type PlannerState,
} from './plannerState'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

const DEFAULT_SHARED = splitForTest(DEFAULT_SETTINGS).shared

const alice: Person = { ...DEFAULT_PERSON_SETTINGS, id: 'p1', name: 'Alice', colour: PERSON_COLOURS[0], leave: {}, companyId: null }

const base: PlannerState = {
  shared: DEFAULT_SHARED,
  people: [alice],
  activePersonId: 'p1',
  companies: [],
  editingCompanyId: null,
  yearOffset: 0,
}

/** Build state for the common single-person case. */
function single(opts: { leave?: LeaveEntries; settings?: Partial<Settings>; companyDays?: CompanyDay[] } = {}): PlannerState {
  const eff = { ...DEFAULT_SETTINGS, ...opts.settings }
  const { shared, person } = splitForTest(eff)
  return {
    ...base,
    shared,
    people: [{ ...alice, ...person, leave: opts.leave ?? {}, companyId: opts.companyDays ? 'co1' : null }],
    companies: opts.companyDays ? [{ id: 'co1', name: 'Acme', days: opts.companyDays }] : [],
  }
}

function splitForTest(s: Settings) {
  const { allowanceDays, carryOverDays, workingDays, workingDaysWeek2, fortnightStart, bankHolidaysDeducted, ...shared } = s
  return {
    shared,
    person: { allowanceDays, carryOverDays, workingDays, workingDaysWeek2, fortnightStart, bankHolidaysDeducted },
  }
}

const leaveOf = (s: PlannerState, id = s.activePersonId) => s.people.find((p) => p.id === id)!.leave
const effective = (s: PlannerState) => personSettings(s.shared, activePerson(s))

const twoPeople: PlannerState = {
  ...base,
  people: [alice, { ...alice, id: 'p2', name: 'Bob', colour: PERSON_COLOURS[1] }],
}

const closure: CompanyDay = {
  id: 'c1',
  date: '2026-12-29',
  name: 'Office closure',
  deducted: true,
  repeatsAnnually: false,
}

describe('plannerReducer', () => {
  it('cycles a day through full → half → none', () => {
    let s = plannerReducer(base, { type: 'cycleLeave', date: '2026-11-18' })
    expect(leaveOf(s)['2026-11-18']).toBe('full')
    s = plannerReducer(s, { type: 'cycleLeave', date: '2026-11-18' })
    expect(leaveOf(s)['2026-11-18']).toBe('half')
    s = plannerReducer(s, { type: 'cycleLeave', date: '2026-11-18' })
    expect(leaveOf(s)).toEqual({})
  })

  it('clears leave only within the given range', () => {
    const s = plannerReducer(single({ leave: { '2026-03-01': 'full', '2026-05-01': 'full' } }), {
      type: 'clearLeaveInRange',
      start: '2026-04-01',
      end: '2027-03-31',
    })
    expect(leaveOf(s)).toEqual({ '2026-03-01': 'full' })
  })

  describe('setLeaveRange', () => {
    it('books working days across a month boundary, skipping weekends', () => {
      const s = plannerReducer(base, { type: 'setLeaveRange', start: '2026-11-26', end: '2026-12-02', portion: 'full' })
      expect(Object.keys(leaveOf(s)).sort()).toEqual([
        '2026-11-26', '2026-11-27', '2026-11-30', '2026-12-01', '2026-12-02',
      ])
    })

    it('accepts start and end in either order', () => {
      const a = plannerReducer(base, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-25', portion: 'half' })
      const b = plannerReducer(base, { type: 'setLeaveRange', start: '2026-11-25', end: '2026-11-23', portion: 'half' })
      expect(leaveOf(a)).toEqual(leaveOf(b))
      expect(Object.keys(leaveOf(a))).toHaveLength(3)
    })

    it('skips bank holidays and non-working days', () => {
      // 2026-12-25 (Fri) and 2026-12-28 (Mon, substitute) are bank holidays.
      const s = plannerReducer(base, { type: 'setLeaveRange', start: '2026-12-24', end: '2026-12-29', portion: 'full' })
      expect(Object.keys(leaveOf(s)).sort()).toEqual(['2026-12-24', '2026-12-29'])
      const noWed = plannerReducer(single({ settings: { workingDays: [1, 2, 4, 5] } }), {
        type: 'setLeaveRange',
        start: '2026-11-23',
        end: '2026-11-27',
        portion: 'full',
      })
      expect(leaveOf(noWed)['2026-11-25']).toBeUndefined()
      expect(Object.keys(leaveOf(noWed))).toHaveLength(4)
    })

    it('clears bookable days when portion is undefined, leaving the rest alone', () => {
      const start = single({ leave: { '2026-11-23': 'full', '2026-11-24': 'half', '2026-11-30': 'full' } })
      const s = plannerReducer(start, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-25', portion: undefined })
      expect(leaveOf(s)).toEqual({ '2026-11-30': 'full' })
    })

    it('skips company days', () => {
      const s = plannerReducer(single({ companyDays: [closure] }), {
        type: 'setLeaveRange',
        start: '2026-12-28',
        end: '2026-12-30',
        portion: 'full',
      })
      // 28th is a bank holiday, 29th a company day.
      expect(Object.keys(leaveOf(s))).toEqual(['2026-12-30'])
    })

    it("uses the active person's company days, not another company's", () => {
      const two: PlannerState = {
        ...twoPeople,
        companies: [
          { id: 'co1', name: 'Acme', days: [closure] },
          { id: 'co2', name: 'Beta', days: [] },
        ],
        people: [
          { ...alice, companyId: 'co1' },
          { ...twoPeople.people[1], companyId: 'co2' },
        ],
      }
      const range = { type: 'setLeaveRange', start: '2026-12-29', end: '2026-12-29', portion: 'full' } as const
      expect(leaveOf(plannerReducer(two, range), 'p1')).toEqual({})
      expect(leaveOf(plannerReducer({ ...two, activePersonId: 'p2' }, range), 'p2')).toEqual({ '2026-12-29': 'full' })
    })

    it('overwrites existing  portions', () => {
      const start = single({ leave: { '2026-11-24': 'half' } })
      const s = plannerReducer(start, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-24', portion: 'full' })
      expect(leaveOf(s)).toEqual({ '2026-11-23': 'full', '2026-11-24': 'full' })
    })

    it("uses the active person's working days for bookability", () => {
      const s0 = plannerReducer(twoPeople, { type: 'updateSettings', patch: { workingDays: [1, 2, 3, 4] } })
      const s = plannerReducer(s0, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-27', portion: 'full' })
      expect(Object.keys(leaveOf(s, 'p1'))).toHaveLength(4)
      expect(Object.keys(leaveOf(s, 'p2'))).toHaveLength(0)
      const other = plannerReducer({ ...s, activePersonId: 'p2' }, { type: 'updateSettings', patch: { workingDays: [1, 2, 3, 4] } })
      const s2 = plannerReducer(other, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-27', portion: 'full' })
      expect(Object.keys(leaveOf(s2, 'p2'))).toHaveLength(4)
      expect(leaveOf(s2, 'p2')['2026-11-27']).toBeUndefined()
    })
  })

  describe('leave actions only touch the active person', () => {
    const withBobLeave: PlannerState = {
      ...twoPeople,
      people: [twoPeople.people[0], { ...twoPeople.people[1], leave: { '2026-11-19': 'full', '2026-11-20': 'half' } }],
    }

    it('cycleLeave', () => {
      const s = plannerReducer(withBobLeave, { type: 'cycleLeave', date: '2026-11-18' })
      expect(leaveOf(s, 'p1')).toEqual({ '2026-11-18': 'full' })
      expect(leaveOf(s, 'p2')).toEqual(leaveOf(withBobLeave, 'p2'))
    })

    it('setLeaveRange', () => {
      const s = plannerReducer(withBobLeave, { type: 'setLeaveRange', start: '2026-11-18', end: '2026-11-20', portion: 'full' })
      expect(Object.keys(leaveOf(s, 'p1'))).toHaveLength(3)
      expect(leaveOf(s, 'p2')).toEqual(leaveOf(withBobLeave, 'p2'))
    })

    it('clearLeaveInRange', () => {
      const s = plannerReducer(
        { ...withBobLeave, activePersonId: 'p2' },
        { type: 'clearLeaveInRange', start: '2026-01-01', end: '2026-12-31' },
      )
      expect(leaveOf(s, 'p2')).toEqual({})
      const t = plannerReducer(withBobLeave, { type: 'clearLeaveInRange', start: '2026-01-01', end: '2026-12-31' })
      expect(leaveOf(t, 'p2')).toEqual(leaveOf(withBobLeave, 'p2'))
    })
  })

  describe('companies', () => {
    const withCo: PlannerState = {
      ...twoPeople,
      companies: [{ id: 'co1', name: 'Acme', days: [] }],
      people: [{ ...alice, companyId: 'co1' }, { ...twoPeople.people[1], companyId: 'co1' }],
    }
    const daysOf = (st: PlannerState, id = 'co1') => st.companies.find((c) => c.id === id)!.days

    it('adds a company, starts editing it and adopts it for a person with none', () => {
      const s = plannerReducer(base, { type: 'addCompany', id: 'co1', name: '  Acme  ' })
      expect(s.companies).toEqual([{ id: 'co1', name: 'Acme', days: [] }])
      expect(s.editingCompanyId).toBe('co1')
      expect(s.people[0].companyId).toBe('co1')
    })

    it('does not move a person who already has a company', () => {
      const s = plannerReducer(withCo, { type: 'addCompany', id: 'co2', name: 'Beta' })
      expect(s.people[0].companyId).toBe('co1')
      expect(s.editingCompanyId).toBe('co2')
    })

    it('adopts when the active person points at a missing company', () => {
      const s = plannerReducer(
        { ...base, people: [{ ...alice, companyId: 'gone' }] },
        { type: 'addCompany', id: 'co2', name: 'Beta' },
      )
      expect(s.people[0].companyId).toBe('co2')
    })

    it('ignores empty names, duplicate ids and the 21st company', () => {
      expect(plannerReducer(base, { type: 'addCompany', id: 'x', name: '   ' })).toBe(base)
      expect(plannerReducer(withCo, { type: 'addCompany', id: 'co1', name: 'Again' })).toBe(withCo)
      const full: PlannerState = {
        ...base,
        companies: Array.from({ length: MAX_COMPANIES }, (_, i) => ({ id: `c${i}`, name: `C${i}`, days: [] })),
      }
      expect(plannerReducer(full, { type: 'addCompany', id: 'extra', name: 'Extra' })).toBe(full)
    })

    it('caps the name length', () => {
      const s = plannerReducer(base, { type: 'addCompany', id: 'co1', name: 'x'.repeat(99) })
      expect(s.companies[0].name).toHaveLength(COMPANY_NAME_MAX)
    })

    it('renames, ignoring empty names and unknown ids', () => {
      const s = plannerReducer(withCo, { type: 'renameCompany', id: 'co1', name: ' Zed ' })
      expect(s.companies[0].name).toBe('Zed')
      expect(plannerReducer(withCo, { type: 'renameCompany', id: 'co1', name: ' ' })).toBe(withCo)
      expect(plannerReducer(withCo, { type: 'renameCompany', id: 'nope', name: 'Zed' })).toBe(withCo)
    })

    it('removes a company, unassigning its people and leaving edit mode', () => {
      const s = plannerReducer({ ...withCo, editingCompanyId: 'co1' }, { type: 'removeCompany', id: 'co1' })
      expect(s.companies).toEqual([])
      expect(s.people.map((p) => p.companyId)).toEqual([null, null])
      expect(s.editingCompanyId).toBeNull()
    })

    it('keeps edit mode on another company when one is removed', () => {
      const two: PlannerState = {
        ...withCo,
        companies: [...withCo.companies, { id: 'co2', name: 'Beta', days: [] }],
        editingCompanyId: 'co2',
      }
      expect(plannerReducer(two, { type: 'removeCompany', id: 'co1' }).editingCompanyId).toBe('co2')
      expect(plannerReducer(two, { type: 'removeCompany', id: 'nope' })).toBe(two)
    })

    it('selects and stops editing a company; selectPerson also stops editing', () => {
      let s = plannerReducer(withCo, { type: 'selectCompany', id: 'co1' })
      expect(s.editingCompanyId).toBe('co1')
      expect(plannerReducer(withCo, { type: 'selectCompany', id: 'nope' })).toBe(withCo)
      expect(plannerReducer(s, { type: 'stopEditingCompany' }).editingCompanyId).toBeNull()
      s = plannerReducer(s, { type: 'selectPerson', id: 'p2' })
      expect(s.editingCompanyId).toBeNull()
      expect(s.activePersonId).toBe('p2')
      expect(plannerReducer({ ...withCo, editingCompanyId: 'co1' }, { type: 'selectPerson', id: 'nope' }).editingCompanyId).toBe('co1')
    })

    it('sets a person company, allowing none but not unknown ids', () => {
      let s = plannerReducer(twoPeople, { type: 'setPersonCompany', personId: 'p2', companyId: null })
      expect(s).toEqual(twoPeople)
      s = plannerReducer(withCo, { type: 'setPersonCompany', personId: 'p2', companyId: null })
      expect(s.people[1].companyId).toBeNull()
      expect(plannerReducer(withCo, { type: 'setPersonCompany', personId: 'p2', companyId: 'nope' })).toBe(withCo)
      expect(plannerReducer(withCo, { type: 'setPersonCompany', personId: 'nope', companyId: null })).toBe(withCo)
    })

    const assign = (st: PlannerState, over: Record<string, unknown> = {}) =>
      plannerReducer(st, {
        type: 'assignCompanyDays',
        companyId: 'co1',
        dates: ['2026-12-29'],
        name: 'Closure',
        deducted: true,
        repeatsAnnually: false,
        idPrefix: 'n',
        ...over,
      } as never)

    it('assigns days with prefixed ids, sorted by date, skipping invalid dates', () => {
      const s = assign(withCo, { dates: ['2026-12-30', 'bad', '2026-12-29'], name: '  ' })
      expect(daysOf(s)).toEqual([
        { id: 'n-2', date: '2026-12-29', name: DEFAULT_COMPANY_DAY_NAME, deducted: true, repeatsAnnually: false },
        { id: 'n-0', date: '2026-12-30', name: DEFAULT_COMPANY_DAY_NAME, deducted: true, repeatsAnnually: false },
      ])
    })

    it('replaces a matching day in place, keeping its id', () => {
      const first = assign(withCo, { repeatsAnnually: true })
      const s = assign(first, { dates: ['2030-12-29'], name: 'Renamed', deducted: false, repeatsAnnually: false, idPrefix: 'm' })
      expect(daysOf(s)).toEqual([
        { id: 'n-0', date: '2030-12-29', name: 'Renamed', deducted: false, repeatsAnnually: false },
      ])
    })

    it('ignores an unknown company when assigning', () => {
      expect(assign(withCo, { companyId: 'nope' })).toBe(withCo)
    })

    it('removes days by date, including repeating ones', () => {
      const s0 = assign(assign(withCo, { repeatsAnnually: true }), { dates: ['2026-12-30'], idPrefix: 'k' })
      const s = plannerReducer(s0, { type: 'removeCompanyDays', companyId: 'co1', dates: ['2031-12-29', 'bad'] })
      expect(daysOf(s).map((d) => d.id)).toEqual(['k-0'])
    })

    it('removes a day by id within its company', () => {
      const s0 = assign(withCo)
      expect(daysOf(plannerReducer(s0, { type: 'removeCompanyDay', companyId: 'co1', id: 'n-0' }))).toEqual([])
      expect(plannerReducer(s0, { type: 'removeCompanyDay', companyId: 'nope', id: 'n-0' })).toBe(s0)
    })

    it('selectors resolve a person company', () => {
      const cs: Company[] = [{ id: 'co1', name: 'Acme', days: [closure] }]
      expect(companyOf(cs, { companyId: 'co1' })).toBe(cs[0])
      expect(companyOf(cs, { companyId: null })).toBeUndefined()
      expect(companyOf(cs, { companyId: 'gone' })).toBeUndefined()
      expect(companyIndexFor(cs, { companyId: 'co1' }).get('2026-12-29')).toEqual(closure)
      expect(companyIndexFor(cs, { companyId: null }).get('2026-12-29')).toBeUndefined()
    })
  })

  describe('updateSettings', () => {
    it('sanitises settings updates', () => {
      const s = plannerReducer(base, {
        type: 'updateSettings',
        patch: { allowanceDays: 25.3, leaveYearStartMonth: 14, workingDays: [5, 1, 1, 9] },
      })
      expect(effective(s).allowanceDays).toBe(25.5)
      expect(s.shared.leaveYearStartMonth).toBe(12)
      expect(effective(s).workingDays).toEqual([1, 5])
    })

    it('sets and clears a fortnightly pattern on the active person only', () => {
      const set = plannerReducer(twoPeople, {
        type: 'updateSettings',
        patch: { workingDaysWeek2: [4, 1, 1, 2, 3], fortnightStart: '2026-11-18' },
      })
      const a = activePerson(set)
      expect(a.workingDaysWeek2).toEqual([1, 2, 3, 4])
      expect(a.fortnightStart).toBe('2026-11-16') // normalised to a Monday
      expect(set.people.find((p) => p.id !== a.id)!.workingDaysWeek2).toBeNull()
      expect(personSettings(set.shared, a)).toMatchObject({ workingDaysWeek2: [1, 2, 3, 4], fortnightStart: '2026-11-16' })
      const cleared = plannerReducer(set, { type: 'updateSettings', patch: { workingDaysWeek2: null } })
      expect(activePerson(cleared).workingDaysWeek2).toBeNull()
      expect(activePerson(cleared).fortnightStart).toBe('2026-11-16')
    })

    it('keeps the previous value when a number input is cleared (NaN)', () => {
      const s = plannerReducer(single({ settings: { allowanceDays: 30 } }), {
        type: 'updateSettings',
        patch: { allowanceDays: NaN },
      })
      expect(effective(s).allowanceDays).toBe(30)
    })

    it('routes person keys to the active person and the rest to shared', () => {
      const s = plannerReducer(
        { ...twoPeople, activePersonId: 'p2' },
        {
          type: 'updateSettings',
          patch: { allowanceDays: 30, carryOverDays: 2, workingDays: [1], bankHolidaysDeducted: true, region: 'scotland', leaveYearStartMonth: 4 },
        },
      )
      expect(s.people[1]).toMatchObject({ allowanceDays: 30, carryOverDays: 2, workingDays: [1], bankHolidaysDeducted: true })
      expect(s.people[0]).toEqual(twoPeople.people[0])
      expect(s.shared).toMatchObject({ region: 'scotland', leaveYearStartMonth: 4 })
      expect('allowanceDays' in s.shared).toBe(false)
      expect(s.people[1]).not.toHaveProperty('region')
    })
  })

  describe('addPerson', () => {
    it('appends, trims, gives defaults and makes the person active', () => {
      const s = plannerReducer(base, { type: 'addPerson', id: 'p2', name: '  Bob  ', colour: '#ABCDEF' })
      expect(s.people).toHaveLength(2)
      expect(s.people[1]).toEqual({ ...DEFAULT_PERSON_SETTINGS, id: 'p2', name: 'Bob', colour: '#abcdef', leave: {}, companyId: null })
      expect(s.activePersonId).toBe('p2')
    })

    it('leaves company-day mode, since the new person is now selected', () => {
      const s = plannerReducer({ ...base, companies: [{ id: 'co1', name: 'Acme', days: [] }], editingCompanyId: 'co1' }, { type: 'addPerson', id: 'p2', name: 'Bob' })
      expect(s.editingCompanyId).toBeNull()
    })

    it('picks the next unused colour when none or an invalid one is given', () => {
      let s = plannerReducer(base, { type: 'addPerson', id: 'p2', name: 'Bob' })
      expect(s.people[1].colour).toBe(PERSON_COLOURS[1])
      s = plannerReducer(s, { type: 'addPerson', id: 'p3', name: 'Cy', colour: 'red' })
      expect(s.people[2].colour).toBe(PERSON_COLOURS[2])
    })

    it('truncates long names', () => {
      const s = plannerReducer(base, { type: 'addPerson', id: 'p2', name: 'x'.repeat(100) })
      expect(s.people[1].name).toHaveLength(PERSON_NAME_MAX)
    })

    it('ignores duplicate ids and empty names', () => {
      expect(plannerReducer(base, { type: 'addPerson', id: 'p1', name: 'Dup' })).toBe(base)
      expect(plannerReducer(base, { type: 'addPerson', id: 'p2', name: '   ' })).toBe(base)
    })
  })

  describe('removePerson', () => {
    const three: PlannerState = {
      ...base,
      people: ['a', 'b', 'c'].map((id) => ({ ...alice, id, name: id.toUpperCase() })),
      activePersonId: 'a',
    }

    it('is a no-op for the last remaining person or an unknown id', () => {
      expect(plannerReducer(base, { type: 'removePerson', id: 'p1' })).toBe(base)
      expect(plannerReducer(three, { type: 'removePerson', id: 'zzz' })).toBe(three)
    })

    it('keeps the active person when someone else is removed', () => {
      const s = plannerReducer(three, { type: 'removePerson', id: 'c' })
      expect(s.people.map((p) => p.id)).toEqual(['a', 'b'])
      expect(s.activePersonId).toBe('a')
    })

    it('activates the next person when the active one is removed', () => {
      const s = plannerReducer({ ...three, activePersonId: 'b' }, { type: 'removePerson', id: 'b' })
      expect(s.activePersonId).toBe('c')
      expect(plannerReducer(three, { type: 'removePerson', id: 'a' }).activePersonId).toBe('b')
    })

    it('activates the previous person when the last one is removed while active', () => {
      const s = plannerReducer({ ...three, activePersonId: 'c' }, { type: 'removePerson', id: 'c' })
      expect(s.activePersonId).toBe('b')
    })
  })

  describe('renamePerson / setPersonColour / selectPerson', () => {
    it('renames with trim and truncation, ignoring empty names', () => {
      let s = plannerReducer(twoPeople, { type: 'renamePerson', id: 'p2', name: '  Robert ' })
      expect(s.people[1].name).toBe('Robert')
      expect(plannerReducer(s, { type: 'renamePerson', id: 'p2', name: '   ' })).toBe(s)
      s = plannerReducer(s, { type: 'renamePerson', id: 'p2', name: 'y'.repeat(99) })
      expect(s.people[1].name).toHaveLength(PERSON_NAME_MAX)
      expect(plannerReducer(s, { type: 'renamePerson', id: 'nope', name: 'X' })).toBe(s)
    })

    it('stores colours in lower case and ignores invalid ones', () => {
      const s = plannerReducer(twoPeople, { type: 'setPersonColour', id: 'p2', colour: '#FF00AA' })
      expect(s.people[1].colour).toBe('#ff00aa')
      expect(plannerReducer(s, { type: 'setPersonColour', id: 'p2', colour: 'pink' })).toBe(s)
      expect(plannerReducer(s, { type: 'setPersonColour', id: 'p2', colour: '#fff' })).toBe(s)
    })

    it('selects known people and ignores unknown ids', () => {
      const s = plannerReducer(twoPeople, { type: 'selectPerson', id: 'p2' })
      expect(s.activePersonId).toBe('p2')
      expect(plannerReducer(s, { type: 'selectPerson', id: 'nope' })).toBe(s)
    })
  })
})

describe('selectors', () => {
  it('personSettings merges shared and person settings', () => {
    const person: Person = { ...alice, allowanceDays: 30, workingDays: [2] }
    const s = personSettings({ ...DEFAULT_SHARED, region: 'scotland' }, person)
    expect(s).toMatchObject({ allowanceDays: 30, workingDays: [2], region: 'scotland', showBridgeSuggestions: true })
  })

  it('activePerson returns the active person', () => {
    expect(activePerson({ ...twoPeople, activePersonId: 'p2' }).name).toBe('Bob')
  })
})

describe('persistence', () => {
  it('round-trips v4 state, but not the year offset or edit mode', () => {
    const storage = new MemoryStorage()
    const state: PlannerState = {
      shared: { ...DEFAULT_SHARED, region: 'scotland' },
      people: [
        { ...alice, allowanceDays: 30, leave: { '2026-11-18': 'half' }, companyId: 'co1' },
        { ...alice, id: 'p2', name: 'Bob', colour: '#2563eb', workingDays: [1, 2], leave: { '2026-11-19': 'full' }, companyId: null },
      ],
      activePersonId: 'p2',
      companies: [
        { id: 'co1', name: 'Acme', days: [closure] },
        { id: 'co2', name: 'Beta', days: [] },
      ],
      editingCompanyId: 'co2',
      yearOffset: 2,
    }
    persist(state, storage)
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(saved.version).toBe(5)
    expect(saved).not.toHaveProperty('editingCompanyId')
    expect(saved).not.toHaveProperty('companyDays')
    expect(initialState(storage)).toEqual({ ...state, editingCompanyId: null, yearOffset: 0 })
  })

  it('starts with one default person in one default company without storage', () => {
    const s = initialState(undefined)
    expect(s.people).toEqual([
      {
        ...DEFAULT_PERSON_SETTINGS,
        id: 'person-1',
        name: DEFAULT_PERSON_NAME,
        colour: PERSON_COLOURS[0],
        leave: {},
        companyId: 'company-1',
      },
    ])
    expect(s.companies).toEqual([{ id: 'company-1', name: 'My company', days: [] }])
    expect(s.editingCompanyId).toBeNull()
    expect(s.activePersonId).toBe('person-1')
    expect(s.shared).toEqual(DEFAULT_SHARED)
  })

  it('falls back to defaults for corrupt or unknown data', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, '{not json')
    expect(initialState(storage).shared).toEqual(DEFAULT_SHARED)
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }))
    expect(initialState(storage).people).toHaveLength(1)
    expect(migrateStored('nope')).toBeNull()
  })

  it('drops invalid leave entries', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, settings: {}, leave: { '2026-02-30': 'full', '2026-03-02': 'lots', '2026-03-03': 'half' } }),
    )
    expect(leaveOf(initialState(storage))).toEqual({ '2026-03-03': 'half' })
  })

  it('drops invalid company days on load', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, settings: {}, leave: {}, companyDays: [closure, { ...closure, id: 'x', date: 'bad' }, 7] }),
    )
    expect(initialState(storage).companies[0].days).toEqual([closure])
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, settings: {}, leave: {}, companyDays: 'oops' }))
    expect(initialState(storage).companies[0].days).toEqual([])
  })

  describe('v1 and v2 migration', () => {
    const v1 = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, allowanceDays: 28, region: 'scotland', workingDays: [1, 2, 3], bankHolidaysDeducted: true },
      leave: { '2026-11-18': 'full', '2026-11-19': 'half' },
    }

    function expectOnePerson(restored: PlannerState) {
      expect(restored.people).toHaveLength(1)
      expect(restored.people[0]).toEqual({
        ...DEFAULT_PERSON_SETTINGS,
        id: 'person-1',
        name: DEFAULT_PERSON_NAME,
        colour: PERSON_COLOURS[0],
        allowanceDays: 28,
        workingDays: [1, 2, 3],
        bankHolidaysDeducted: true,
        leave: v1.leave,
        companyId: 'company-1',
      })
      expect(restored.activePersonId).toBe('person-1')
      expect(restored.shared.region).toBe('scotland')
    }

    it('loads v1 data as one person with an empty company days list', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify(v1))
      const restored = initialState(storage)
      expectOnePerson(restored)
      expect(restored.companies).toEqual([{ id: 'company-1', name: 'My company', days: [] }])
    })

    it('ignores a stray companyDays field on v1 data', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...v1, companyDays: [closure] }))
      expect(initialState(storage).companies[0].days).toEqual([])
    })

    it('loads v2 data as one person, keeping company days', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...v1, version: 2, companyDays: [closure] }))
      const restored = initialState(storage)
      expectOnePerson(restored)
      expect(restored.companies).toEqual([{ id: 'company-1', name: 'My company', days: [closure] }])
      expect(restored.people[0].companyId).toBe('company-1')
    })

    it('rewrites as v5 on the next persist', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify(v1))
      persist(initialState(storage), storage)
      const saved = JSON.parse(storage.getItem(STORAGE_KEY)!)
      expect(saved.version).toBe(5)
      expect(saved.companies).toEqual([{ id: 'company-1', name: 'My company', days: [] }])
      expect(saved.people[0].leave).toEqual(v1.leave)
      expect(saved).not.toHaveProperty('settings')
      expect(saved).not.toHaveProperty('leave')
    })
  })

  describe('v3 migration', () => {
    it('moves company days into company-1 and assigns everyone to it', () => {
      const m = migrateStored({
        version: 3,
        shared: {},
        people: [{ id: 'a', name: 'A', companyId: 'ignored' }, { id: 'b', name: 'B' }],
        activePersonId: 'b',
        companyDays: [closure, { ...closure, id: 'bad', date: 'nope' }],
      })!
      expect(m.companies).toEqual([{ id: 'company-1', name: 'My company', days: [closure] }])
      expect(m.people.map((p) => p.companyId)).toEqual(['company-1', 'company-1'])
      expect(m.activePersonId).toBe('b')
    })
  })

  describe('v4 sanitising', () => {
    const load = (data: unknown) => migrateStored({ version: 4, shared: {}, companies: [], ...(data as object) })!

    it('drops bad companies and duplicate ids, cleans names and days', () => {
      const m = load({
        companies: [
          null,
          5,
          { name: 'No id' },
          { id: 7 },
          { id: 'a', name: '  Acme ', days: [closure, { ...closure, id: 'x', date: 'bad' }] },
          { id: 'a', name: 'Dup' },
          { id: 'b', name: '   ', days: 'oops' },
          { id: 'c', name: 'y'.repeat(99) },
        ],
        people: [{ id: 'p' }],
      })
      expect(m.companies.map((c) => [c.id, c.name.length > 40 ? 'long' : c.name])).toEqual([
        ['a', 'Acme'],
        ['b', 'Company 2'],
        ['c', 'y'.repeat(COMPANY_NAME_MAX)],
      ])
      expect(m.companies[0].days).toEqual([closure])
      expect(m.companies[1].days).toEqual([])
    })

    it('caps the number of companies', () => {
      const companies = Array.from({ length: MAX_COMPANIES + 5 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }))
      expect(load({ companies }).companies).toHaveLength(MAX_COMPANIES)
    })

    it('nulls dangling or non-string companyIds', () => {
      const m = load({
        companies: [{ id: 'a', name: 'A' }],
        people: [
          { id: 'p1', companyId: 'a' },
          { id: 'p2', companyId: 'gone' },
          { id: 'p3', companyId: 4 },
          { id: 'p4' },
        ],
      })
      expect(m.people.map((p) => p.companyId)).toEqual(['a', null, null, null])
    })

    it('tolerates a missing companies field', () => {
      expect(migrateStored({ version: 4, shared: {}, people: [] })!.companies).toEqual([])
    })
  })

  describe('v3 sanitising', () => {
    const load = (data: unknown) => migrateStored({ version: 3, shared: {}, companyDays: [], ...(data as object) })!

    it('drops bad people and duplicate ids', () => {
      const m = load({
        people: [null, 5, { name: 'No id' }, { id: 7 }, { id: 'a', name: 'A' }, { id: 'a', name: 'Dup' }, { id: 'b', name: 'B' }],
        activePersonId: 'b',
      })
      expect(m.people.map((p) => [p.id, p.name])).toEqual([['a', 'A'], ['b', 'B']])
      expect(m.activePersonId).toBe('b')
    })

    it('sanitises names, colours, settings and leave', () => {
      const m = load({
        people: [
          { id: 'a', name: '   ', colour: 'nope', allowanceDays: 'lots', workingDays: [9, 3, 3], leave: { '2026-03-03': 'half', x: 'full' } },
          { id: 'b', name: 'z'.repeat(99), colour: '#ABCDEF', allowanceDays: 500, carryOverDays: 1.3 },
          { id: 'c', name: 5, colour: '#abc' },
        ],
        activePersonId: 'a',
      })
      const [a, b, c] = m.people
      expect(a.name).toBe(DEFAULT_PERSON_NAME)
      expect(a.colour).toBe(PERSON_COLOURS[0])
      expect(a.allowanceDays).toBe(DEFAULT_PERSON_SETTINGS.allowanceDays)
      expect(a.workingDays).toEqual([3])
      expect(a.leave).toEqual({ '2026-03-03': 'half' })
      expect(b.name).toHaveLength(PERSON_NAME_MAX)
      expect(b.colour).toBe('#abcdef')
      expect(b.allowanceDays).toBe(366)
      expect(b.carryOverDays).toBe(1.5)
      expect(c.name).toBe('Person 3')
      expect(c.colour).toBe(PERSON_COLOURS[1])
    })

    it('falls back to the first person for a bad active id', () => {
      const people = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
      expect(load({ people, activePersonId: 'zzz' }).activePersonId).toBe('a')
      expect(load({ people, activePersonId: 4 }).activePersonId).toBe('a')
    })

    it('creates the default person when none is valid', () => {
      for (const people of [[], [null, 1], 'nope', undefined]) {
        const m = load({ people, activePersonId: 'x' })
        expect(m.people).toHaveLength(1)
        expect(m.people[0]).toMatchObject({ id: 'person-1', name: DEFAULT_PERSON_NAME, colour: PERSON_COLOURS[0] })
        expect(m.activePersonId).toBe('person-1')
      }
    })

    it('sanitises shared settings and never stores person keys there', () => {
      const m = load({ shared: { region: 'mars', leaveYearStartMonth: 99, allowanceDays: 3 }, people: [] })
      expect(m.shared.region).toBe(DEFAULT_SETTINGS.region)
      expect(m.shared.leaveYearStartMonth).toBe(12)
      expect('allowanceDays' in m.shared).toBe(false)
    })
  })
})

describe('showBridgeSuggestions setting', () => {
  it('defaults to on and can be switched off through the reducer', () => {
    expect(DEFAULT_SETTINGS.showBridgeSuggestions).toBe(true)
    const s = plannerReducer(base, { type: 'updateSettings', patch: { showBridgeSuggestions: false } })
    expect(s.shared.showBridgeSuggestions).toBe(false)
  })

  it('falls back to the previous value for a non-boolean', () => {
    const off = single({ settings: { showBridgeSuggestions: false } })
    const s = plannerReducer(off, {
      type: 'updateSettings',
      patch: { showBridgeSuggestions: 'yes' as unknown as boolean },
    })
    expect(s.shared.showBridgeSuggestions).toBe(false)
  })

  it('loads v2 data saved before the setting existed with the default, without a schema bump', () => {
    const storage = new MemoryStorage()
    const { showBridgeSuggestions: _omitted, ...oldSettings } = { ...DEFAULT_SETTINGS, allowanceDays: 30 }
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, settings: oldSettings, leave: {}, companyDays: [] }))
    const restored = initialState(storage)
    expect(effective(restored).allowanceDays).toBe(30)
    expect(restored.shared.showBridgeSuggestions).toBe(true)
  })

  it('persists and restores an explicit off', () => {
    const storage = new MemoryStorage()
    persist(single({ settings: { showBridgeSuggestions: false } }), storage)
    expect(initialState(storage).shared.showBridgeSuggestions).toBe(false)
  })
})

describe('hasSavedState', () => {
  it('is false for empty, corrupt or unknown-version storage', () => {
    const storage = new MemoryStorage()
    expect(hasSavedState(storage)).toBe(false)
    storage.setItem(STORAGE_KEY, '{nope')
    expect(hasSavedState(storage)).toBe(false)
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }))
    expect(hasSavedState(storage)).toBe(false)
    expect(hasSavedState(undefined)).toBe(false)
  })

  it('is true once state has been persisted', () => {
    const storage = new MemoryStorage()
    persist(initialState(storage), storage)
    expect(hasSavedState(storage)).toBe(true)
  })
})

describe('plan import/export', () => {
  const state: PlannerState = {
    shared: { ...DEFAULT_SHARED, region: 'scotland' },
    people: [
      { ...alice, allowanceDays: 30, leave: { '2026-11-18': 'half', '2026-11-19': 'full' }, companyId: 'co1' },
      { ...alice, id: 'p2', name: 'Bob', colour: '#2563eb', workingDays: [1, 2], leave: { '2026-11-20': 'full' }, companyId: null },
    ],
    activePersonId: 'p2',
    companies: [
      { id: 'co1', name: 'Acme', days: [closure] },
      { id: 'co2', name: 'Beta', days: [] },
    ],
    editingCompanyId: null,
    yearOffset: 0,
  }

  it('round-trips through serialisePlan and parsePlan', () => {
    const result = parsePlan(serialisePlan(state))
    expect(result).toEqual({
      ok: true,
      plan: { shared: state.shared, people: state.people, activePersonId: 'p2', companies: state.companies },
    })
  })

  it('serialises exactly what persist stores', () => {
    const storage = new MemoryStorage()
    persist(state, storage)
    expect(storage.getItem(STORAGE_KEY)).toBe(serialisePlan(state))
  })

  it('rejects invalid JSON, non-plans and unknown versions with distinct reasons', () => {
    const reason = (json: string) => {
      const r = parsePlan(json)
      return r.ok ? 'ok' : r.reason
    }
    expect(reason('{nope')).toBe('not-json')
    expect(reason('')).toBe('not-json')
    for (const json of ['null', '42', '"plan"', '[]', '{}', '{"version":0}', '{"version":"5"}']) {
      expect(reason(json)).toBe('not-a-plan')
    }
    expect(reason('{"version":6}')).toBe('newer-version')
    const newer = parsePlan('{"version":99}')
    expect(!newer.ok && newer.message).toMatch(/newer version/)
  })

  it('sanitises tampered fields instead of trusting them', () => {
    const tampered = JSON.parse(serialisePlan(state))
    tampered.people[0].leave = { '2026-11-18': 'full', 'not-a-date': 'full', '2026-11-19': 'banana' }
    tampered.people[0].colour = 'red'
    tampered.people[1].allowanceDays = 'lots'
    tampered.people.push('junk', { id: 'p2', name: 'Duplicate' })
    tampered.activePersonId = 'nobody'
    tampered.companies[0].days = 'oops'
    const result = parsePlan(JSON.stringify(tampered))
    if (!result.ok) throw new Error('expected a plan')
    const { people, activePersonId, companies } = result.plan
    expect(people).toHaveLength(2)
    expect(people[0].leave).toEqual({ '2026-11-18': 'full' })
    expect(people[0].colour).toMatch(/^#[0-9a-f]{6}$/)
    expect(people[1].allowanceDays).toBe(DEFAULT_PERSON_SETTINGS.allowanceDays)
    expect(activePersonId).toBe(people[0].id)
    expect(companies[0].days).toEqual([])
  })

  it('migrates older versions', () => {
    const v1 = parsePlan(JSON.stringify({ version: 1, settings: { allowanceDays: 20 }, leave: { '2026-03-03': 'half' } }))
    if (!v1.ok) throw new Error('expected a plan')
    expect(v1.plan.people).toHaveLength(1)
    expect(v1.plan.people[0]).toMatchObject({ allowanceDays: 20, leave: { '2026-03-03': 'half' }, companyId: 'company-1' })
    expect(v1.plan.companies).toHaveLength(1)

    const v3 = parsePlan(JSON.stringify({ version: 3, shared: {}, people: [alice], activePersonId: alice.id, companyDays: [closure] }))
    if (!v3.ok) throw new Error('expected a plan')
    expect(v3.plan.companies[0].days).toEqual([closure])
    expect(v3.plan.people[0].companyId).toBe(v3.plan.companies[0].id)
  })

  it('replacePlan swaps the whole plan and resets view state', () => {
    const before: PlannerState = { ...initialState(undefined), editingCompanyId: 'company-1', yearOffset: 3 }
    const result = parsePlan(serialisePlan(state))
    if (!result.ok) throw new Error('expected a plan')
    expect(plannerReducer(before, { type: 'replacePlan', plan: result.plan })).toEqual(state)
  })

  it('describes a plan for the import confirmation', () => {
    expect(describePlan(state)).toBe('2 people (Alice, Bob), 2.5 days booked, 2 companies with 1 company day')
  })
})

describe('fortnightly working pattern', () => {
  it('sanitises workingDaysWeek2 and fortnightStart', () => {
    const clean = (patch: object) => sanitiseSettings({ ...DEFAULT_SETTINGS, ...patch } as Settings)
    expect(clean({ workingDaysWeek2: [4, 1, 1, 9, -1, 2.5, 2] }).workingDaysWeek2).toEqual([1, 2, 4])
    expect(clean({ workingDaysWeek2: [] }).workingDaysWeek2).toEqual([])
    expect(clean({ workingDaysWeek2: null }).workingDaysWeek2).toBeNull()
    expect(clean({ workingDaysWeek2: 'Mon' }).workingDaysWeek2).toBeNull()
    expect(clean({ fortnightStart: '2026-11-18' }).fortnightStart).toBe('2026-11-16')
    expect(clean({ fortnightStart: '2026-11-22' }).fortnightStart).toBe('2026-11-16')
    expect(clean({ fortnightStart: '2026-02-30' }).fortnightStart).toBe(DEFAULT_SETTINGS.fortnightStart)
    expect(clean({ fortnightStart: 5 }).fortnightStart).toBe(DEFAULT_SETTINGS.fortnightStart)
    const prev = { ...DEFAULT_SETTINGS, workingDaysWeek2: [1], fortnightStart: '2026-11-09' }
    expect(sanitiseSettings({ ...prev, workingDaysWeek2: 7 as never, fortnightStart: 'x' }, prev)).toMatchObject({
      workingDaysWeek2: [1],
      fortnightStart: '2026-11-09',
    })
  })

  it('migrates v4 data with the weekly defaults', () => {
    const m = migrateStored({
      version: 4,
      shared: {},
      people: [{ id: 'a', name: 'A', workingDays: [1, 2, 3] }],
      activePersonId: 'a',
      companies: [],
    })!
    expect(m.people[0]).toMatchObject({
      workingDays: [1, 2, 3],
      workingDaysWeek2: null,
      fortnightStart: DEFAULT_SETTINGS.fortnightStart,
    })
  })

  it('reads v5 data and round-trips through serialisePlan', () => {
    const person = { ...alice, workingDaysWeek2: [1, 2, 3, 4], fortnightStart: '2026-11-16' }
    const state: PlannerState = { ...base, people: [person], activePersonId: person.id }
    const json = serialisePlan(state)
    expect(JSON.parse(json).version).toBe(5)
    const parsed = parsePlan(json)
    expect(parsed.ok && parsed.plan.people[0]).toMatchObject({ workingDaysWeek2: [1, 2, 3, 4], fortnightStart: '2026-11-16' })
  })

  it('sanitises the fields on stored people', () => {
    const m = migrateStored({
      version: 5,
      shared: {},
      people: [{ id: 'a', workingDaysWeek2: [3, 3, 8], fortnightStart: '2026-11-19' }, { id: 'b', workingDaysWeek2: 'x', fortnightStart: 'nope' }],
      activePersonId: 'a',
      companies: [],
    })!
    expect(m.people[0]).toMatchObject({ workingDaysWeek2: [3], fortnightStart: '2026-11-16' })
    expect(m.people[1]).toMatchObject({ workingDaysWeek2: null, fortnightStart: DEFAULT_SETTINGS.fortnightStart })
  })
})
