import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/types'
import { STORAGE_KEY, initialState, persist, plannerReducer, type PlannerState } from './plannerState'

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

const base: PlannerState = { settings: DEFAULT_SETTINGS, leave: {}, yearOffset: 0 }

describe('plannerReducer', () => {
  it('cycles a day through full → half → none', () => {
    let s = plannerReducer(base, { type: 'cycleLeave', date: '2026-11-18' })
    expect(s.leave['2026-11-18']).toBe('full')
    s = plannerReducer(s, { type: 'cycleLeave', date: '2026-11-18' })
    expect(s.leave['2026-11-18']).toBe('half')
    s = plannerReducer(s, { type: 'cycleLeave', date: '2026-11-18' })
    expect(s.leave).toEqual({})
  })

  it('clears leave only within the given range', () => {
    const s = plannerReducer(
      { ...base, leave: { '2026-03-01': 'full', '2026-05-01': 'full' } },
      { type: 'clearLeaveInRange', start: '2026-04-01', end: '2027-03-31' },
    )
    expect(s.leave).toEqual({ '2026-03-01': 'full' })
  })

  describe('setLeaveRange', () => {
    it('books working days across a month boundary, skipping weekends', () => {
      const s = plannerReducer(base, { type: 'setLeaveRange', start: '2026-11-26', end: '2026-12-02', portion: 'full' })
      expect(Object.keys(s.leave).sort()).toEqual([
        '2026-11-26', '2026-11-27', '2026-11-30', '2026-12-01', '2026-12-02',
      ])
    })

    it('accepts start and end in either order', () => {
      const a = plannerReducer(base, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-25', portion: 'half' })
      const b = plannerReducer(base, { type: 'setLeaveRange', start: '2026-11-25', end: '2026-11-23', portion: 'half' })
      expect(a.leave).toEqual(b.leave)
      expect(Object.keys(a.leave)).toHaveLength(3)
    })

    it('skips bank holidays and non-working days', () => {
      // 2026-12-25 (Fri) and 2026-12-28 (Mon, substitute) are bank holidays.
      const s = plannerReducer(base, { type: 'setLeaveRange', start: '2026-12-24', end: '2026-12-29', portion: 'full' })
      expect(Object.keys(s.leave).sort()).toEqual(['2026-12-24', '2026-12-29'])
      const noWed = plannerReducer(
        { ...base, settings: { ...DEFAULT_SETTINGS, workingDays: [1, 2, 4, 5] } },
        { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-27', portion: 'full' },
      )
      expect(noWed.leave['2026-11-25']).toBeUndefined()
      expect(Object.keys(noWed.leave)).toHaveLength(4)
    })

    it('clears bookable days when portion is undefined, leaving the rest alone', () => {
      const start: PlannerState = {
        ...base,
        leave: { '2026-11-23': 'full', '2026-11-24': 'half', '2026-11-30': 'full' },
      }
      const s = plannerReducer(start, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-25', portion: undefined })
      expect(s.leave).toEqual({ '2026-11-30': 'full' })
    })

    it('overwrites existing portions', () => {
      const start: PlannerState = { ...base, leave: { '2026-11-24': 'half' } }
      const s = plannerReducer(start, { type: 'setLeaveRange', start: '2026-11-23', end: '2026-11-24', portion: 'full' })
      expect(s.leave).toEqual({ '2026-11-23': 'full', '2026-11-24': 'full' })
    })
  })

  it('sanitises settings updates', () => {
    const s = plannerReducer(base, {
      type: 'updateSettings',
      patch: { allowanceDays: 25.3, leaveYearStartMonth: 14, workingDays: [5, 1, 1, 9] },
    })
    expect(s.settings.allowanceDays).toBe(25.5)
    expect(s.settings.leaveYearStartMonth).toBe(12)
    expect(s.settings.workingDays).toEqual([1, 5])
  })

  it('keeps the previous value when a number input is cleared (NaN)', () => {
    const start = { ...base, settings: { ...DEFAULT_SETTINGS, allowanceDays: 30 } }
    const s = plannerReducer(start, { type: 'updateSettings', patch: { allowanceDays: NaN } })
    expect(s.settings.allowanceDays).toBe(30)
  })
})

describe('persistence', () => {
  it('round-trips settings and leave, but not the year offset', () => {
    const storage = new MemoryStorage()
    persist(
      { settings: { ...DEFAULT_SETTINGS, allowanceDays: 30 }, leave: { '2026-11-18': 'half' }, yearOffset: 2 },
      storage,
    )
    const restored = initialState(storage)
    expect(restored.settings.allowanceDays).toBe(30)
    expect(restored.leave).toEqual({ '2026-11-18': 'half' })
    expect(restored.yearOffset).toBe(0)
  })

  it('falls back to defaults for corrupt or unknown data', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, '{not json')
    expect(initialState(storage).settings).toEqual(DEFAULT_SETTINGS)
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }))
    expect(initialState(storage).settings).toEqual(DEFAULT_SETTINGS)
  })

  it('drops invalid leave entries', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, settings: {}, leave: { '2026-02-30': 'full', '2026-03-02': 'lots', '2026-03-03': 'half' } }),
    )
    expect(initialState(storage).leave).toEqual({ '2026-03-03': 'half' })
  })
})
