import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERSON_NAME,
  DEFAULT_PERSON_SETTINGS,
  DEFAULT_SETTINGS,
  PERSON_NAME_MAX,
  type CompanyDay,
  type LeaveEntries,
  type Person,
  type Settings,
} from '../domain/types'
import { PERSON_COLOURS } from '../theme'
import {
  STORAGE_KEY,
  activePerson,
  hasSavedState,
  initialState,
  migrateStored,
  persist,
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

const alice: Person = { ...DEFAULT_PERSON_SETTINGS, id: 'p1', name: 'Alice', colour: PERSON_COLOURS[0], leave: {} }

const base: PlannerState = {
  shared: DEFAULT_SHARED,
  people: [alice],
  activePersonId: 'p1',
  companyDays: [],
  yearOffset: 0,
}

/** Build state for the common single-person case. */
function single(opts: { leave?: LeaveEntries; settings?: Partial<Settings>; companyDays?: CompanyDay[] } = {}): PlannerState {
  const eff = { ...DEFAULT_SETTINGS, ...opts.settings }
  const { shared, person } = splitForTest(eff)
  return {
    ...base,
    shared,
    people: [{ ...alice, ...person, leave: opts.leave ?? {} }],
    companyDays: opts.companyDays ?? [],
  }
}

function splitForTest(s: Settings) {
  const { allowanceDays, carryOverDays, workingDays, bankHolidaysDeducted, ...shared } = s
  return { shared, person: { allowanceDays, carryOverDays, workingDays, bankHolidaysDeducted } }
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

    it('overwrites existing portions', () => {
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

  describe('company days', () => {
    it('adds company days, sorted by date', () => {
      let s = plannerReducer(base, { type: 'addCompanyDay', day: closure })
      s = plannerReducer(s, { type: 'addCompanyDay', day: { ...closure, id: 'c2', date: '2026-01-02', name: ' New ' } })
      expect(s.companyDays.map((d) => [d.id, d.name])).toEqual([
        ['c2', 'New'],
        ['c1', 'Office closure'],
      ])
    })

    it('ignores invalid or duplicate-id additions', () => {
      const s = plannerReducer(base, { type: 'addCompanyDay', day: closure })
      expect(plannerReducer(s, { type: 'addCompanyDay', day: { ...closure, name: '  ' } })).toBe(s)
      expect(plannerReducer(s, { type: 'addCompanyDay', day: { ...closure, id: 'c1', name: 'Again' } })).toBe(s)
      expect(plannerReducer(s, { type: 'addCompanyDay', day: { ...closure, id: 'c9', date: 'nope' } })).toBe(s)
    })

    it('removes by id', () => {
      const s = plannerReducer(single({ companyDays: [closure] }), { type: 'removeCompanyDay', id: 'c1' })
      expect(s.companyDays).toEqual([])
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
      expect(s.people[1]).toEqual({ ...DEFAULT_PERSON_SETTINGS, id: 'p2', name: 'Bob', colour: '#abcdef', leave: {} })
      expect(s.activePersonId).toBe('p2')
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
  it('round-trips v3 state, but not the year offset', () => {
    const storage = new MemoryStorage()
    const state: PlannerState = {
      shared: { ...DEFAULT_SHARED, region: 'scotland' },
      people: [
        { ...alice, allowanceDays: 30, leave: { '2026-11-18': 'half' } },
        { ...alice, id: 'p2', name: 'Bob', colour: '#2563eb', workingDays: [1, 2], leave: { '2026-11-19': 'full' } },
      ],
      activePersonId: 'p2',
      companyDays: [closure],
      yearOffset: 2,
    }
    persist(state, storage)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(3)
    expect(initialState(storage)).toEqual({ ...state, yearOffset: 0 })
  })

  it('starts with one default person without storage', () => {
    const s = initialState(undefined)
    expect(s.people).toEqual([
      { ...DEFAULT_PERSON_SETTINGS, id: 'person-1', name: DEFAULT_PERSON_NAME, colour: PERSON_COLOURS[0], leave: {} },
    ])
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
    expect(initialState(storage).companyDays).toEqual([closure])
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, settings: {}, leave: {}, companyDays: 'oops' }))
    expect(initialState(storage).companyDays).toEqual([])
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
      })
      expect(restored.activePersonId).toBe('person-1')
      expect(restored.shared.region).toBe('scotland')
    }

    it('loads v1 data as one person with an empty company days list', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify(v1))
      const restored = initialState(storage)
      expectOnePerson(restored)
      expect(restored.companyDays).toEqual([])
    })

    it('ignores a stray companyDays field on v1 data', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...v1, companyDays: [closure] }))
      expect(initialState(storage).companyDays).toEqual([])
    })

    it('loads v2 data as one person, keeping company days', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...v1, version: 2, companyDays: [closure] }))
      const restored = initialState(storage)
      expectOnePerson(restored)
      expect(restored.companyDays).toEqual([closure])
    })

    it('rewrites as v3 on the next persist', () => {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, JSON.stringify(v1))
      persist(initialState(storage), storage)
      const saved = JSON.parse(storage.getItem(STORAGE_KEY)!)
      expect(saved.version).toBe(3)
      expect(saved.companyDays).toEqual([])
      expect(saved.people[0].leave).toEqual(v1.leave)
      expect(saved).not.toHaveProperty('settings')
      expect(saved).not.toHaveProperty('leave')
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
