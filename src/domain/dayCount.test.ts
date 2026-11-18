import { describe, expect, it } from 'vitest'
import { parseDayCount } from './dayCount'

const ok = (value: number) => ({ ok: true, value })

describe('parseDayCount', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(parseDayCount('').ok).toBe(false)
    expect(parseDayCount('   ').ok).toBe(false)
  })

  it('rejects non-numeric input', () => {
    for (const t of ['abc', '12abc', '1e3', '1,5', '.', '-', '1.2.3', 'NaN', 'Infinity']) {
      expect(parseDayCount(t).ok, t).toBe(false)
    }
  })

  it('rejects negative numbers', () => {
    const r = parseDayCount('-3')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/negative/)
  })

  it('rejects values over 366 but accepts 366 and 0', () => {
    expect(parseDayCount('367').ok).toBe(false)
    expect(parseDayCount('366.2').ok).toBe(false)
    expect(parseDayCount('366')).toEqual(ok(366))
    expect(parseDayCount('0')).toEqual(ok(0))
  })

  it('accepts whole and half days, trimming whitespace', () => {
    expect(parseDayCount(' 25 ')).toEqual(ok(25))
    expect(parseDayCount('25.5')).toEqual(ok(25.5))
    expect(parseDayCount('.5')).toEqual(ok(0.5))
    expect(parseDayCount('25.')).toEqual(ok(25))
  })

  it('rounds to the nearest half day (ties up, like toHalf)', () => {
    expect(parseDayCount('25.3')).toEqual(ok(25.5))
    expect(parseDayCount('25.2')).toEqual(ok(25))
    expect(parseDayCount('0.25')).toEqual(ok(0.5))
    expect(parseDayCount('0.1')).toEqual(ok(0))
  })
})
