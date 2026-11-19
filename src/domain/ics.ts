import { addDays, daysBetween, daysInMonth, isIsoDate, parseIso, toIso } from './dates'
import type { IsoDate } from './dates'
import { MAX_CALENDAR_EVENTS } from './types'

/**
 * Pure iCalendar (RFC 5545) reader for importing dates such as school holidays.
 * Only what the planner needs: each VEVENT's dates and summary.
 *
 * Simplifications (school-holiday feeds are all-day events):
 * - Date-times are never converted between timezones: the date part is used as written
 *   (the `Z` suffix and any `TZID` parameter are ignored).
 * - Repeat rules: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT and UNTIL. A rule
 *   with any BY* part (or another FREQ) imports only its first occurrence.
 */

/** One event read from an `.ics` file, after expanding any supported repeat rule. */
export interface IcsEvent {
  /** Stable within one parse: the UID (plus the occurrence date for repeats), else a generated key. */
  key: string
  /** First date (inclusive). */
  start: IsoDate
  /** Last date (inclusive). All-day DTEND is exclusive in iCalendar, so this is DTEND minus a day. */
  end: IsoDate
  /** SUMMARY, unescaped and trimmed; empty if missing. */
  name: string
}

export interface IcsParseResult {
  /** Sorted by start, then end, then name. */
  events: IcsEvent[]
  /** X-WR-CALNAME, if present. */
  calendarName: string | null
  /** VEVENTs that couldn't be read (no or invalid DTSTART, end before start) or were cancelled. */
  skipped: number
  /** Events whose repeat rule isn't supported: only their first occurrence was imported. */
  unsupportedRepeats: number
  /** True when expanding repeats or reading events stopped at `maxEvents`. */
  truncated: boolean
}

export interface IcsParseOptions {
  /** Open-ended repeats (no COUNT or UNTIL) stop on or before this date. */
  repeatUntil: IsoDate
  /** Stop after this many events in total. */
  maxEvents?: number
}

/** Thrown when the text isn't an iCalendar file at all (no BEGIN:VCALENDAR). */
export class IcsFormatError extends Error {}

/** Safety net against pathological rules (e.g. a huge COUNT where every instance is excluded). */
const MAX_EXPANSION_STEPS = 100_000

interface Prop {
  name: string
  params: Map<string, string>
  value: string
}

/** Splits on `separator` outside double quotes. */
function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted
      current += ch
    } else if (ch === separator && !quoted) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/** Joins continuation lines (starting with a space or tab) onto the previous line. */
function unfold(text: string): string[] {
  const lines: string[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1)
    } else {
      lines.push(raw)
    }
  }
  return lines
}

/** Parses `NAME;PARAM=v;PARAM="a:b":VALUE`. A colon inside a quoted parameter isn't the separator. */
function parseLine(line: string): Prop | null {
  let quoted = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quoted = !quoted
    else if (ch === ':' && !quoted) {
      colon = i
      break
    }
  }
  if (colon < 1) return null
  const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';')
  const params = new Map<string, string>()
  for (const part of rawParams) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    params.set(part.slice(0, eq).trim().toUpperCase(), part.slice(eq + 1).replace(/^"(.*)"$/, '$1'))
  }
  return { name: rawName.trim().toUpperCase(), params, value: line.slice(colon + 1) }
}

/** Unescapes iCalendar TEXT (newlines become spaces) and collapses whitespace. */
function unescapeText(value: string): string {
  return value
    .replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c))
    .replace(/\s+/g, ' ')
    .trim()
}

interface IcsDate {
  date: IsoDate
  /** A bare date (VALUE=DATE) rather than a date-time. */
  allDay: boolean
  secondsOfDay: number
}

/** Reads `YYYYMMDD` or `YYYYMMDDTHHMMSS[Z]`; the date part is used as written. */
function parseIcsDate(value: string): IcsDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/i.exec(value.trim())
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  if (!isIsoDate(date)) return null
  if (m[4] === undefined) return { date, allDay: true, secondsOfDay: 0 }
  const [h, min, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)]
  if (h > 23 || min > 59 || s > 60) return null
  return { date, allDay: false, secondsOfDay: h * 3600 + min * 60 + s }
}

/** Reads a positive `P[n]W[n]D[T[n]H[n]M[n]S]` duration as whole days plus leftover seconds. */
function parseDuration(value: string): { days: number; seconds: number } | null {
  const m = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value.trim())
  if (!m) return null
  const n = (i: number) => Number(m[i] ?? 0)
  return { days: n(1) * 7 + n(2), seconds: n(3) * 3600 + n(4) * 60 + n(5) }
}

interface RepeatRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: IsoDate | null
}

/** Returns null when the rule uses anything beyond FREQ/INTERVAL/COUNT/UNTIL (or is malformed). */
function parseRule(value: string): RepeatRule | null {
  const parts = new Map<string, string>()
  for (const part of value.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 1) return null
    parts.set(part.slice(0, eq).trim().toUpperCase(), part.slice(eq + 1).trim().toUpperCase())
  }
  for (const key of parts.keys()) {
    if (!['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST'].includes(key)) return null
  }
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const positiveInt = (text: string | undefined, fallback: number | null): number | null | undefined => {
    if (text === undefined) return fallback
    return /^\d+$/.test(text) && Number(text) >= 1 ? Number(text) : undefined
  }
  const interval = positiveInt(parts.get('INTERVAL'), 1)
  const count = positiveInt(parts.get('COUNT'), null)
  if (interval === undefined || interval === null || count === undefined) return null
  let until: IsoDate | null = null
  const untilText = parts.get('UNTIL')
  if (untilText !== undefined) {
    until = parseIcsDate(untilText)?.date ?? null
    if (until === null) return null
  }
  return { freq, interval, count, until }
}

/**
 * Occurrence start dates of a repeat rule, beginning with `start` itself. Instances that
 * don't exist (31st in a short month, 29 Feb in a common year) are skipped and don't count
 * towards COUNT. Open-ended rules stop after `repeatUntil`.
 */
function* occurrenceStarts(start: IsoDate, rule: RepeatRule, repeatUntil: IsoDate): Generator<IsoDate> {
  const { year, month, day } = parseIso(start)
  const limit = rule.until ?? (rule.count === null ? repeatUntil : null)
  let produced = 0
  for (let step = 0; step < MAX_EXPANSION_STEPS; step++) {
    let candidate: IsoDate | null
    if (rule.freq === 'DAILY' || rule.freq === 'WEEKLY') {
      const offset = step * rule.interval * (rule.freq === 'DAILY' ? 1 : 7)
      if (offset > 3_000_000) return
      candidate = addDays(start, offset)
    } else {
      const totalMonths = month - 1 + step * rule.interval * (rule.freq === 'YEARLY' ? 12 : 1)
      const y = year + Math.floor(totalMonths / 12)
      const m = (totalMonths % 12) + 1
      if (y > 9999) return
      if (limit !== null && toIso(y, m, 1) > limit) return
      candidate = day <= daysInMonth(y, m) ? toIso(y, m, day) : null
    }
    if (candidate === null) continue
    if (limit !== null && candidate > limit) return
    yield candidate
    produced++
    if (rule.count !== null && produced >= rule.count) return
  }
}

interface RawEvent {
  index: number
  props: Prop[]
}

/** Splits the file into VEVENTs (ignoring nested components) and reads the calendar name. */
function readComponents(lines: string[]): { events: RawEvent[]; calendarName: string | null } {
  const events: RawEvent[] = []
  let calendarName: string | null = null
  let sawCalendar = false
  const stack: string[] = []
  let current: RawEvent | null = null
  for (const line of lines) {
    const prop = parseLine(line)
    if (!prop) continue
    if (prop.name === 'BEGIN') {
      const component = prop.value.trim().toUpperCase()
      if (component === 'VCALENDAR') sawCalendar = true
      if (component === 'VEVENT' && stack[stack.length - 1] === 'VCALENDAR') {
        current = { index: events.length, props: [] }
        events.push(current)
      }
      stack.push(component)
    } else if (prop.name === 'END') {
      const component = prop.value.trim().toUpperCase()
      if (stack[stack.length - 1] === component) stack.pop()
      if (component === 'VEVENT') current = null
    } else if (stack[stack.length - 1] === 'VEVENT' && current) {
      current.props.push(prop)
    } else if (stack.length === 1 && stack[0] === 'VCALENDAR' && prop.name === 'X-WR-CALNAME' && calendarName === null) {
      calendarName = unescapeText(prop.value) || null
    }
  }
  if (!sawCalendar) throw new IcsFormatError('This file isn’t an iCalendar (.ics) file.')
  return { events, calendarName }
}

/** Inclusive end date of an event, per the rules in `parseIcs`. May be before `start` (caller skips). */
function computeEnd(start: IcsDate, dtend: IcsDate | null, duration: { days: number; seconds: number } | null): IsoDate {
  if (dtend) {
    if (dtend.allDay) return dtend.date > start.date ? addDays(dtend.date, -1) : start.date
    // A date-time ending exactly at midnight doesn't occupy the new day.
    const midnight = dtend.secondsOfDay === 0 && dtend.date > start.date
    return midnight ? addDays(dtend.date, -1) : dtend.date
  }
  if (duration) {
    if (start.allDay) {
      const days = duration.days + Math.floor(duration.seconds / 86_400)
      return addDays(start.date, Math.max(days, 1) - 1)
    }
    const total = start.secondsOfDay + duration.seconds
    const days = duration.days + Math.floor(total / 86_400)
    const midnight = total % 86_400 === 0 && days > 0
    return addDays(start.date, midnight ? days - 1 : days)
  }
  return start.date
}

/**
 * Reads the VEVENTs of an iCalendar file.
 *
 * - All-day events: DTEND is exclusive, so the inclusive end is DTEND minus a day.
 * - Date-time events: dates are taken as written (no timezone conversion). An event ending
 *   exactly at midnight does not occupy that day. With DURATION instead of DTEND, whole days
 *   are added, plus a day when the hours part carries past midnight.
 * - Cancelled events, and events with a missing/invalid DTSTART or an end before the start,
 *   are counted in `skipped`.
 * - Repeats: see the file comment. EXDATE removes occurrences; a RECURRENCE-ID override of
 *   the same UID replaces the generated occurrence on that date.
 * - Exact duplicates (same start, end and name) are dropped. Output is sorted.
 *
 * @throws IcsFormatError if the text has no BEGIN:VCALENDAR.
 */
export function parseIcs(text: string, options: IcsParseOptions): IcsParseResult {
  const maxEvents = options.maxEvents ?? MAX_CALENDAR_EVENTS
  const { events: rawEvents, calendarName } = readComponents(unfold(text))

  const find = (raw: RawEvent, name: string) => raw.props.find((p) => p.name === name)
  const dateOf = (raw: RawEvent, name: string) => {
    const prop = find(raw, name)
    return prop ? parseIcsDate(prop.value) : null
  }

  // Dates replaced by a RECURRENCE-ID override, per UID.
  const overrides = new Map<string, Set<IsoDate>>()
  for (const raw of rawEvents) {
    const uid = find(raw, 'UID')?.value.trim()
    const recurrenceId = dateOf(raw, 'RECURRENCE-ID')
    if (!uid || !recurrenceId) continue
    const dates = overrides.get(uid) ?? new Set<IsoDate>()
    dates.add(recurrenceId.date)
    overrides.set(uid, dates)
  }

  const events: IcsEvent[] = []
  const seen = new Set<string>()
  const keys = new Set<string>()
  let skipped = 0
  let unsupportedRepeats = 0
  let truncated = false

  /** Adds an event; returns false once `maxEvents` is reached. */
  const add = (event: IcsEvent): boolean => {
    const signature = `${event.start}|${event.end}|${event.name}`
    if (seen.has(signature)) return true
    if (events.length >= maxEvents) {
      truncated = true
      return false
    }
    seen.add(signature)
    let key = event.key
    for (let n = 2; keys.has(key); n++) key = `${event.key}-${n}`
    keys.add(key)
    events.push({ ...event, key })
    return true
  }

  outer: for (const raw of rawEvents) {
    if (find(raw, 'STATUS')?.value.trim().toUpperCase() === 'CANCELLED') {
      skipped++
      continue
    }
    const start = dateOf(raw, 'DTSTART')
    if (!start) {
      skipped++
      continue
    }
    const durationProp = find(raw, 'DURATION')
    const end = computeEnd(start, dateOf(raw, 'DTEND'), durationProp ? parseDuration(durationProp.value) : null)
    if (end < start.date) {
      skipped++
      continue
    }
    const length = daysBetween(start.date, end)
    const name = unescapeText(find(raw, 'SUMMARY')?.value ?? '')
    const uid = find(raw, 'UID')?.value.trim() || null
    const baseKey = uid ?? `event-${raw.index}`

    const recurrenceId = dateOf(raw, 'RECURRENCE-ID')
    if (uid && recurrenceId) {
      if (!add({ key: `${uid}@${recurrenceId.date}`, start: start.date, end, name })) break
      continue
    }

    const rrule = find(raw, 'RRULE')
    const rule = rrule ? parseRule(rrule.value) : null
    if (rrule && !rule) unsupportedRepeats++

    const excluded = new Set<IsoDate>(uid ? overrides.get(uid) : undefined)
    for (const exdate of raw.props.filter((p) => p.name === 'EXDATE')) {
      for (const value of exdate.value.split(',')) {
        const parsed = parseIcsDate(value)
        if (parsed) excluded.add(parsed.date)
      }
    }

    const starts: Iterable<IsoDate> = rule ? occurrenceStarts(start.date, rule, options.repeatUntil) : [start.date]
    for (const s of starts) {
      if (excluded.has(s)) continue
      const event = { key: rule ? `${baseKey}@${s}` : baseKey, start: s, end: addDays(s, length), name }
      if (!add(event)) break outer
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { events, calendarName, skipped, unsupportedRepeats, truncated }
}
