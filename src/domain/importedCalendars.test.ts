import { describe, expect, it } from 'vitest'
import {
  calendarDayIndex,
  cleanEventName,
  countCalendarDays,
  sanitiseCalendarEvent,
  sanitiseCalendarEvents,
  NO_CALENDAR_DAYS,
} from './importedCalendars'
import { CALENDAR_EVENT_NAME_MAX, DEFAULT_CALENDAR_EVENT_NAME, MAX_CALENDAR_EVENTS, type CalendarEvent } from './types'

const ev = (id: string, start: string, end: string, name = 'Holiday'): CalendarEvent => ({ id, start, end, name })

describe('calendarDayIndex', () => {
  it('expands multi-day events to every date', () => {
    const index = calendarDayIndex([ev('a', '2026-12-30', '2027-01-02', 'Break')])
    for (const d of ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']) expect(index.get(d)).toEqual(['Break'])
    expect(index.get('2026-12-29')).toBeUndefined()
    expect(index.get('2027-01-03')).toBeUndefined()
  })

  it('lists several events on one date in event order', () => {
    const index = calendarDayIndex([ev('a', '2026-05-01', '2026-05-02', 'First'), ev('b', '2026-05-02', '2026-05-02', 'Second')])
    expect(index.get('2026-05-01')).toEqual(['First'])
    expect(index.get('2026-05-02')).toEqual(['First', 'Second'])
  })

  it('does not repeat duplicate names on a date', () => {
    const index = calendarDayIndex([ev('a', '2026-05-01', '2026-05-01', 'Same'), ev('b', '2026-05-01', '2026-05-01', 'Same')])
    expect(index.get('2026-05-01')).toEqual(['Same'])
  })

  it('handles no events and the empty index', () => {
    expect(calendarDayIndex([]).get('2026-05-01')).toBeUndefined()
    expect(NO_CALENDAR_DAYS.get('2026-05-01')).toBeUndefined()
  })
})

describe('countCalendarDays', () => {
  it('counts overlapping events once', () => {
    const events = [ev('a', '2026-05-01', '2026-05-05'), ev('b', '2026-05-04', '2026-05-08'), ev('c', '2026-05-06', '2026-05-06')]
    expect(countCalendarDays(events, '2026-01-01', '2026-12-31')).toBe(8)
  })

  it('clips to the range, inclusive of both ends', () => {
    const events = [ev('a', '2026-04-28', '2026-05-03'), ev('b', '2026-05-30', '2026-06-04')]
    expect(countCalendarDays(events, '2026-05-01', '2026-05-31')).toBe(3 + 2)
    expect(countCalendarDays(events, '2026-05-03', '2026-05-03')).toBe(1)
  })

  it('ignores events outside the range and empty input', () => {
    expect(countCalendarDays([ev('a', '2025-01-01', '2025-01-10')], '2026-01-01', '2026-12-31')).toBe(0)
    expect(countCalendarDays([ev('a', '2027-01-01', '2027-01-10')], '2026-01-01', '2026-12-31')).toBe(0)
    expect(countCalendarDays([], '2026-01-01', '2026-12-31')).toBe(0)
  })
})

describe('cleanEventName', () => {
  it('trims, collapses whitespace and caps the length', () => {
    expect(cleanEventName('  Half   term \n break ')).toBe('Half term break')
    expect(cleanEventName('x'.repeat(CALENDAR_EVENT_NAME_MAX + 20))).toHaveLength(CALENDAR_EVENT_NAME_MAX)
  })

  it('falls back to the default for empty and non-strings', () => {
    for (const v of ['', '   ', undefined, null, 5, {}]) expect(cleanEventName(v)).toBe(DEFAULT_CALENDAR_EVENT_NAME)
  })
})

describe('sanitiseCalendarEvent', () => {
  it('accepts a valid event and cleans its name', () => {
    expect(sanitiseCalendarEvent({ id: 'a', start: '2026-05-01', end: '2026-05-03', name: ' X ' })).toEqual(ev('a', '2026-05-01', '2026-05-03', 'X'))
  })

  it('defaults a missing or invalid end to the start', () => {
    expect(sanitiseCalendarEvent({ id: 'a', start: '2026-05-01', name: 'X' })?.end).toBe('2026-05-01')
    expect(sanitiseCalendarEvent({ id: 'a', start: '2026-05-01', end: 'nope', name: 'X' })?.end).toBe('2026-05-01')
  })

  it('rejects unusable input', () => {
    for (const v of [null, undefined, 'x', 3, {}, { id: '', start: '2026-05-01' }, { id: 'a' }, { id: 'a', start: '2026-02-30' }, { id: 1, start: '2026-05-01' }, { id: 'a', start: '2026-05-02', end: '2026-05-01' }]) {
      expect(sanitiseCalendarEvent(v)).toBeNull()
    }
  })
})

describe('sanitiseCalendarEvents', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitiseCalendarEvents(undefined)).toEqual([])
    expect(sanitiseCalendarEvents({})).toEqual([])
  })

  it('drops invalid events and duplicate ids, and sorts by start then end', () => {
    const out = sanitiseCalendarEvents([
      { id: 'c', start: '2026-06-01', end: '2026-06-05', name: 'C' },
      { id: 'a', start: '2026-05-01', end: '2026-05-09', name: 'A' },
      { id: 'a', start: '2026-01-01', name: 'dup' },
      { id: 'bad', start: 'x' },
      { id: 'b', start: '2026-05-01', end: '2026-05-02', name: 'B' },
    ])
    expect(out.map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('caps the number of events', () => {
    const many = Array.from({ length: MAX_CALENDAR_EVENTS + 10 }, (_, i) => ({ id: `e${i}`, start: '2026-01-01' }))
    expect(sanitiseCalendarEvents(many)).toHaveLength(MAX_CALENDAR_EVENTS)
  })
})
