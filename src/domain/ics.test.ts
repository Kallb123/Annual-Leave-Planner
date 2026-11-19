import { describe, expect, it } from 'vitest'
import { IcsFormatError, parseIcs } from './ics'
import type { IcsParseOptions } from './ics'

const OPTS: IcsParseOptions = { repeatUntil: '2027-12-31' }

/** Wraps VEVENT bodies in a calendar. Lines are LF-separated. */
const cal = (...events: string[][]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.map((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT'].join('\n')), 'END:VCALENDAR'].join('\n')

const parse = (events: string[][], options: Partial<IcsParseOptions> = {}) => parseIcs(cal(...events), { ...OPTS, ...options })
const dates = (events: string[][], options: Partial<IcsParseOptions> = {}) => parse(events, options).events.map((e) => e.start)

describe('parseIcs: file handling', () => {
  it('reads a realistic school-holiday file (CRLF, folding, escapes, calendar name)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Example Council//Term Dates//EN',
      'X-WR-CALNAME:Anytown Schools\\, Term Dates 2026/27',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/London',
      'BEGIN:STANDARD',
      'DTSTART:19701025T020000',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:ht-autumn@example.org',
      'DTSTART;VALUE=DATE:20261026',
      'DTEND;VALUE=DATE:20261031',
      'SUMMARY:Autumn half-term',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:inset-1@example.org',
      'DTSTART;VALUE=DATE:20261102',
      'DTEND;VALUE=DATE:20261103',
      'SUMMARY:INSET day\\, staff training',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:xmas@example.org',
      'DTSTART;VALUE=DATE:20261221',
      'DTEND;VALUE=DATE:20270104',
      'SUMMARY:Christmas holidays\\n(schools',
      '  closed)',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const result = parseIcs(ics, OPTS)
    expect(result.calendarName).toBe('Anytown Schools, Term Dates 2026/27')
    expect(result.skipped).toBe(0)
    expect(result.truncated).toBe(false)
    expect(result.events).toEqual([
      { key: 'ht-autumn@example.org', start: '2026-10-26', end: '2026-10-30', name: 'Autumn half-term' },
      { key: 'inset-1@example.org', start: '2026-11-02', end: '2026-11-02', name: 'INSET day, staff training' },
      { key: 'xmas@example.org', start: '2026-12-21', end: '2027-01-03', name: 'Christmas holidays (schools closed)' },
    ])
  })

  it('throws a friendly error when there is no VCALENDAR', () => {
    expect(() => parseIcs('hello world', OPTS)).toThrow(IcsFormatError)
    expect(() => parseIcs('', OPTS)).toThrow('This file isn’t an iCalendar (.ics) file.')
  })

  it('returns no events for an empty calendar', () => {
    const r = parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR', OPTS)
    expect(r).toEqual({ events: [], calendarName: null, skipped: 0, unsupportedRepeats: 0, truncated: false })
  })

  it('treats names case-insensitively and handles quoted parameter colons', () => {
    const r = parse([
      ['uid:a', 'dtstart;value=date:20260105', 'summary;LANGUAGE="en:GB":Quoted: colon'],
    ])
    expect(r.events).toEqual([{ key: 'a', start: '2026-01-05', end: '2026-01-05', name: 'Quoted: colon' }])
  })

  it('unfolds lines with tabs and mid-word breaks', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'SUMMARY:Spri', '\tng break']])
    expect(r.events[0].name).toBe('Spring break')
  })

  it('has a null calendar name when missing or empty', () => {
    expect(parse([]).calendarName).toBeNull()
    expect(parseIcs('BEGIN:VCALENDAR\nX-WR-CALNAME:  \nEND:VCALENDAR', OPTS).calendarName).toBeNull()
  })

  it('does not take a name from inside a VEVENT as the calendar name', () => {
    expect(parse([['DTSTART:20260105', 'X-WR-CALNAME:Nope']]).calendarName).toBeNull()
  })

  it('does not leak VALARM properties into the event', () => {
    const r = parse([
      ['UID:a', 'DTSTART:20260105', 'SUMMARY:Real', 'BEGIN:VALARM', 'SUMMARY:Alarm', 'DESCRIPTION:Alarm', 'DTSTART:20990101', 'END:VALARM'],
      ['UID:b', 'DTSTART:20260106', 'BEGIN:VALARM', 'SUMMARY:Alarm only', 'END:VALARM'],
    ])
    expect(r.events.map((e) => [e.start, e.name])).toEqual([
      ['2026-01-05', 'Real'],
      ['2026-01-06', ''],
    ])
  })
})

describe('parseIcs: summary', () => {
  it('unescapes and collapses whitespace', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'SUMMARY:  A\\, B\\; C \\\\ D\\NE\\nF   ']])
    expect(r.events[0].name).toBe('A, B; C \\ D E F')
  })

  it('is empty when missing', () => {
    expect(parse([['UID:a', 'DTSTART:20260105']]).events[0].name).toBe('')
  })
})

describe('parseIcs: dates', () => {
  it('uses an exclusive DTEND for all-day events', () => {
    const r = parse([['UID:a', 'DTSTART;VALUE=DATE:20260105', 'DTEND;VALUE=DATE:20260108']])
    expect(r.events[0]).toMatchObject({ start: '2026-01-05', end: '2026-01-07' })
  })

  it('accepts bare 8-digit dates and a one-day all-day event', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'DTEND:20260106']])
    expect(r.events[0]).toMatchObject({ start: '2026-01-05', end: '2026-01-05' })
  })

  it('collapses an all-day DTEND on or before the start to one day', () => {
    expect(parse([['DTSTART:20260105', 'DTEND:20260105']]).events[0].end).toBe('2026-01-05')
    expect(parse([['DTSTART:20260105', 'DTEND:20260101']]).events[0].end).toBe('2026-01-05')
  })

  it('crosses month and year boundaries', () => {
    const r = parse([['DTSTART:20261231', 'DTEND:20270102']])
    expect(r.events[0]).toMatchObject({ start: '2026-12-31', end: '2027-01-01' })
  })

  it('uses the date part of date-times as written (Z and TZID ignored)', () => {
    const r = parse([
      ['UID:a', 'DTSTART:20260105T230000Z', 'DTEND:20260106T010000Z'],
      ['UID:b', 'DTSTART;TZID=Europe/London:20260110T090000', 'DTEND;TZID=Europe/London:20260110T170000'],
    ])
    expect(r.events.map((e) => [e.start, e.end])).toEqual([
      ['2026-01-05', '2026-01-06'],
      ['2026-01-10', '2026-01-10'],
    ])
  })

  it('does not occupy the day a date-time event ends at midnight', () => {
    const r = parse([
      ['UID:a', 'DTSTART:20260105T220000', 'DTEND:20260106T000000'],
      ['UID:b', 'DTSTART:20260110T000000', 'DTEND:20260113T000000'],
      ['UID:c', 'DTSTART:20260120T000000', 'DTEND:20260120T000000'],
    ])
    expect(r.events.map((e) => [e.start, e.end])).toEqual([
      ['2026-01-05', '2026-01-05'],
      ['2026-01-10', '2026-01-12'],
      ['2026-01-20', '2026-01-20'],
    ])
  })

  describe('DURATION', () => {
    const end = (start: string, duration: string) => parse([[`DTSTART${start}`, `DURATION:${duration}`]]).events[0].end
    it('handles weeks and days for all-day events', () => {
      expect(end(';VALUE=DATE:20260105', 'P1W')).toBe('2026-01-11')
      expect(end(';VALUE=DATE:20260105', 'P5D')).toBe('2026-01-09')
      expect(end(';VALUE=DATE:20260105', 'P1D')).toBe('2026-01-05')
      expect(end(';VALUE=DATE:20260105', 'P2W3D')).toBe('2026-01-21')
    })
    it('treats a sub-day all-day duration as one day', () => {
      expect(end(':20260105', 'PT3H')).toBe('2026-01-05')
    })
    it('adds days for date-times, plus a day when hours cross midnight', () => {
      expect(end(':20260105T090000', 'PT2H')).toBe('2026-01-05')
      expect(end(':20260105T230000', 'PT2H')).toBe('2026-01-06')
      expect(end(':20260105T090000', 'P2D')).toBe('2026-01-07')
      expect(end(':20260105T090000', 'P1DT2H')).toBe('2026-01-06')
      expect(end(':20260105T090000', 'P1DT16H')).toBe('2026-01-07')
      expect(end(':20260105T000000', 'PT24H')).toBe('2026-01-05')
    })
    it('ignores an unparseable duration', () => {
      expect(end(':20260105', 'banana')).toBe('2026-01-05')
    })
    it('prefers DTEND over DURATION', () => {
      const r = parse([['DTSTART:20260105', 'DTEND:20260107', 'DURATION:P10D']])
      expect(r.events[0].end).toBe('2026-01-06')
    })
  })

  it('treats a missing DTEND as a single day', () => {
    expect(parse([['DTSTART:20260105']]).events[0].end).toBe('2026-01-05')
  })
})

describe('parseIcs: skipped events', () => {
  it('skips missing or invalid DTSTART', () => {
    const r = parse([['UID:a', 'SUMMARY:No start'], ['UID:b', 'DTSTART:2026-01-05'], ['UID:c', 'DTSTART:20261301'], ['UID:d', 'DTSTART:20260230'], ['UID:e', 'DTSTART:20260105']])
    expect(r.skipped).toBe(4)
    expect(r.events).toHaveLength(1)
  })

  it('skips cancelled events (case-insensitive)', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'STATUS:CANCELLED'], ['UID:b', 'DTSTART:20260106', 'status:cancelled'], ['UID:c', 'DTSTART:20260107', 'STATUS:CONFIRMED']])
    expect(r.skipped).toBe(2)
    expect(r.events.map((e) => e.key)).toEqual(['c'])
  })

  it('skips date-time events whose end is before the start', () => {
    const r = parse([['DTSTART:20260105T100000', 'DTEND:20260104T100000']])
    expect(r.skipped).toBe(1)
    expect(r.events).toEqual([])
  })
})

describe('parseIcs: repeats', () => {
  const rule = (rrule: string, start = '20260105', extra: string[] = []) => ['UID:r', `DTSTART;VALUE=DATE:${start}`, `RRULE:${rrule}`, ...extra]

  it('expands DAILY with COUNT and INTERVAL', () => {
    expect(dates([rule('FREQ=DAILY;COUNT=3')])).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(dates([rule('FREQ=DAILY;INTERVAL=2;COUNT=3')])).toEqual(['2026-01-05', '2026-01-07', '2026-01-09'])
  })

  it('expands WEEKLY with UNTIL as a date or date-time (inclusive)', () => {
    expect(dates([rule('FREQ=WEEKLY;UNTIL=20260119')])).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
    expect(dates([rule('FREQ=WEEKLY;UNTIL=20260119T000000Z')])).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
    expect(dates([rule('FREQ=WEEKLY;INTERVAL=2;UNTIL=20260131')])).toEqual(['2026-01-05', '2026-01-19'])
  })

  it('expands MONTHLY and YEARLY', () => {
    expect(dates([rule('FREQ=MONTHLY;COUNT=3', '20261115')])).toEqual(['2026-11-15', '2026-12-15', '2027-01-15'])
    expect(dates([rule('FREQ=MONTHLY;INTERVAL=3;COUNT=3')])).toEqual(['2026-01-05', '2026-04-05', '2026-07-05'])
    expect(dates([rule('FREQ=YEARLY;COUNT=3', '20261225')])).toEqual(['2026-12-25', '2027-12-25', '2028-12-25'])
  })

  it('keeps the original duration for every occurrence', () => {
    const r = parse([['UID:r', 'DTSTART;VALUE=DATE:20260105', 'DTEND;VALUE=DATE:20260108', 'RRULE:FREQ=WEEKLY;COUNT=2']])
    expect(r.events.map((e) => [e.start, e.end])).toEqual([
      ['2026-01-05', '2026-01-07'],
      ['2026-01-12', '2026-01-14'],
    ])
  })

  it('keys each occurrence by UID and start date', () => {
    expect(parse([rule('FREQ=DAILY;COUNT=2')]).events.map((e) => e.key)).toEqual(['r@2026-01-05', 'r@2026-01-06'])
  })

  it('keys with the generated event key when there is no UID', () => {
    const r = parse([['DTSTART:20260105', 'RRULE:FREQ=DAILY;COUNT=2']])
    expect(r.events.map((e) => e.key)).toEqual(['event-0@2026-01-05', 'event-0@2026-01-06'])
  })

  it('stops open-ended rules at repeatUntil (inclusive)', () => {
    expect(dates([rule('FREQ=WEEKLY')], { repeatUntil: '2026-01-19' })).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
    expect(dates([rule('FREQ=YEARLY', '20260301')], { repeatUntil: '2028-02-28' })).toEqual(['2026-03-01', '2027-03-01'])
  })

  it('keeps just the first occurrence when repeatUntil is before the start', () => {
    expect(dates([rule('FREQ=DAILY')], { repeatUntil: '2025-01-01' })).toEqual(['2026-01-05'])
  })

  it('ignores repeatUntil when COUNT or UNTIL is given', () => {
    expect(dates([rule('FREQ=DAILY;COUNT=3')], { repeatUntil: '2026-01-05' })).toHaveLength(3)
    expect(dates([rule('FREQ=DAILY;UNTIL=20260108')], { repeatUntil: '2026-01-05' })).toHaveLength(4)
  })

  it('skips months without a 31st, without counting them', () => {
    expect(dates([rule('FREQ=MONTHLY;COUNT=4', '20260131')])).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31'])
  })

  it('only repeats 29 February in leap years, without counting skipped years', () => {
    expect(dates([rule('FREQ=YEARLY;COUNT=3', '20240229')])).toEqual(['2024-02-29', '2028-02-29', '2032-02-29'])
    expect(dates([rule('FREQ=YEARLY', '20240229')], { repeatUntil: '2033-01-01' })).toEqual(['2024-02-29', '2028-02-29', '2032-02-29'])
  })

  it('imports only the first occurrence of unsupported rules and counts them once', () => {
    for (const rrule of ['FREQ=WEEKLY;BYDAY=MO,WE', 'FREQ=MONTHLY;BYMONTHDAY=1', 'FREQ=YEARLY;BYMONTH=3', 'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR', 'FREQ=HOURLY;COUNT=5', 'FREQ=DAILY;INTERVAL=0', 'nonsense']) {
      const r = parse([rule(rrule)])
      expect(r.events, rrule).toEqual([{ key: 'r', start: '2026-01-05', end: '2026-01-05', name: '' }])
      expect(r.unsupportedRepeats, rrule).toBe(1)
    }
  })

  it('does not count supported rules as unsupported', () => {
    expect(parse([rule('FREQ=DAILY;COUNT=2;WKST=MO')]).unsupportedRepeats).toBe(0)
  })

  it('removes EXDATE occurrences (multiple lines, comma lists, date-times)', () => {
    const r = parse([rule('FREQ=DAILY;COUNT=6', '20260105', ['EXDATE;VALUE=DATE:20260106,20260107', 'EXDATE:20260109T000000Z'])])
    expect(r.events.map((e) => e.start)).toEqual(['2026-01-05', '2026-01-08', '2026-01-10'])
  })

  it('replaces an occurrence with a RECURRENCE-ID override that moves and renames it', () => {
    const r = parse([
      ['UID:r', 'DTSTART;VALUE=DATE:20260105', 'SUMMARY:Closure', 'RRULE:FREQ=WEEKLY;COUNT=3'],
      ['UID:r', 'RECURRENCE-ID;VALUE=DATE:20260112', 'DTSTART;VALUE=DATE:20260113', 'SUMMARY:Closure (moved)'],
    ])
    expect(r.events).toEqual([
      { key: 'r@2026-01-05', start: '2026-01-05', end: '2026-01-05', name: 'Closure' },
      { key: 'r@2026-01-12', start: '2026-01-13', end: '2026-01-13', name: 'Closure (moved)' },
      { key: 'r@2026-01-19', start: '2026-01-19', end: '2026-01-19', name: 'Closure' },
    ])
  })

  it('applies an override that appears before its master in the file', () => {
    const r = parse([
      ['UID:r', 'RECURRENCE-ID:20260106', 'DTSTART:20260106', 'SUMMARY:Special'],
      ['UID:r', 'DTSTART:20260105', 'SUMMARY:Normal', 'RRULE:FREQ=DAILY;COUNT=3'],
    ])
    expect(r.events.map((e) => e.name)).toEqual(['Normal', 'Special', 'Normal'])
  })

  it('removes the occurrence of a cancelled override and counts it as skipped', () => {
    const r = parse([
      ['UID:r', 'DTSTART:20260105', 'RRULE:FREQ=DAILY;COUNT=3'],
      ['UID:r', 'RECURRENCE-ID:20260106', 'DTSTART:20260106', 'STATUS:CANCELLED'],
    ])
    expect(r.events.map((e) => e.start)).toEqual(['2026-01-05', '2026-01-07'])
    expect(r.skipped).toBe(1)
  })

  it('does not apply overrides to other UIDs', () => {
    const r = parse([
      ['UID:r', 'DTSTART:20260105', 'RRULE:FREQ=DAILY;COUNT=2'],
      ['UID:other', 'RECURRENCE-ID:20260106', 'DTSTART:20260106', 'SUMMARY:Other'],
    ])
    expect(r.events).toHaveLength(3)
  })
})

describe('parseIcs: duplicates, keys and ordering', () => {
  it('drops exact duplicates but keeps differing names', () => {
    const r = parse([
      ['UID:a', 'DTSTART:20260105', 'SUMMARY:Holiday'],
      ['UID:b', 'DTSTART:20260105', 'SUMMARY:Holiday'],
      ['UID:c', 'DTSTART:20260105', 'SUMMARY:Other'],
      ['UID:d', 'DTSTART:20260105', 'DTEND:20260107', 'SUMMARY:Holiday'],
    ])
    expect(r.events.map((e) => e.key)).toEqual(['d', 'c', 'a'].sort((x, y) => keyOrder(r, x) - keyOrder(r, y)))
    expect(r.events).toHaveLength(3)
  })

  it('generates event-N keys without UIDs, indexed by VEVENT position', () => {
    const r = parse([['DTSTART:20260105'], ['DTSTART:20260106']])
    expect(r.events.map((e) => e.key)).toEqual(['event-0', 'event-1'])
  })

  it('makes colliding keys unique', () => {
    const r = parse([
      ['UID:same', 'DTSTART:20260105', 'SUMMARY:A'],
      ['UID:same', 'DTSTART:20260106', 'SUMMARY:B'],
      ['UID:same', 'DTSTART:20260107', 'SUMMARY:C'],
    ])
    expect(r.events.map((e) => e.key)).toEqual(['same', 'same-2', 'same-3'])
  })

  it('sorts by start, then end, then name', () => {
    const r = parse([
      ['UID:1', 'DTSTART:20260110', 'SUMMARY:Z'],
      ['UID:2', 'DTSTART:20260105', 'DTEND:20260108', 'SUMMARY:B'],
      ['UID:3', 'DTSTART:20260105', 'DTEND:20260106', 'SUMMARY:Z'],
      ['UID:4', 'DTSTART:20260105', 'DTEND:20260108', 'SUMMARY:A'],
    ])
    expect(r.events.map((e) => e.key)).toEqual(['3', '4', '2', '1'])
  })
})

describe('parseIcs: limits', () => {
  it('truncates at maxEvents and flags it', () => {
    const r = parse([['UID:a', 'DTSTART:20260105'], ['UID:b', 'DTSTART:20260106'], ['UID:c', 'DTSTART:20260107']], { maxEvents: 2 })
    expect(r.events).toHaveLength(2)
    expect(r.truncated).toBe(true)
  })

  it('does not flag truncation when exactly maxEvents fit', () => {
    const r = parse([['UID:a', 'DTSTART:20260105'], ['UID:b', 'DTSTART:20260106']], { maxEvents: 2 })
    expect(r.truncated).toBe(false)
  })

  it('stops a runaway open-ended daily repeat at maxEvents', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'RRULE:FREQ=DAILY']], { repeatUntil: '2999-12-31', maxEvents: 50 })
    expect(r.events).toHaveLength(50)
    expect(r.truncated).toBe(true)
  })

  it('defaults maxEvents to 1000', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'RRULE:FREQ=DAILY']], { repeatUntil: '2999-12-31' })
    expect(r.events).toHaveLength(1000)
    expect(r.truncated).toBe(true)
  })

  it('terminates on very large COUNTs', () => {
    const r = parse([['UID:a', 'DTSTART:20260105', 'RRULE:FREQ=YEARLY;COUNT=999999999']], { maxEvents: 5000 })
    expect(r.events.length).toBeLessThan(8000)
  })
})

/** Position of a key in the sorted result (helper for the duplicates test). */
function keyOrder(r: ReturnType<typeof parse>, key: string): number {
  return r.events.findIndex((e) => e.key === key)
}
