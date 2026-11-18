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
