import { eachDay, isIsoDate, type IsoDate } from './dates'
import {
  CALENDAR_EVENT_NAME_MAX,
  DEFAULT_CALENDAR_EVENT_NAME,
  MAX_CALENDAR_EVENTS,
  type CalendarEvent,
} from './types'

/** Event names on each date of an imported calendar. Multi-day events cover every date in their range. */
export interface CalendarDayIndex {
  /** Names of the events on `date`, in event order, or undefined for none. */
  get(date: IsoDate): readonly string[] | undefined
}

export const NO_CALENDAR_DAYS: CalendarDayIndex = { get: () => undefined }

/** Index an imported calendar's events by date. */
export function calendarDayIndex(events: readonly CalendarEvent[]): CalendarDayIndex {
  const byDate = new Map<IsoDate, string[]>()
  for (const event of events) {
    for (const date of eachDay(event.start, event.end)) {
      const names = byDate.get(date)
      if (!names) byDate.set(date, [event.name])
      else if (!names.includes(event.name)) names.push(event.name)
    }
  }
  return { get: (date) => byDate.get(date) }
}

/** Number of dates from `start` to `end` (inclusive) covered by at least one event. */
export function countCalendarDays(events: readonly CalendarEvent[], start: IsoDate, end: IsoDate): number {
  const dates = new Set<IsoDate>()
  for (const event of events) {
    if (event.end < start || event.start > end) continue
    const from = event.start < start ? start : event.start
    const to = event.end > end ? end : event.end
    for (const date of eachDay(from, to)) dates.add(date)
  }
  return dates.size
}

/** Trim and cap an event name, falling back to the default. */
export function cleanEventName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, CALENDAR_EVENT_NAME_MAX).trim() : ''
  return name || DEFAULT_CALENDAR_EVENT_NAME
}

/** Validate one untrusted event (from storage or an import). Null if unusable. */
export function sanitiseCalendarEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || !v.id || typeof v.start !== 'string' || !isIsoDate(v.start)) return null
  const end = typeof v.end === 'string' && isIsoDate(v.end) ? v.end : v.start
  if (end < v.start) return null
  return { id: v.id, start: v.start, end, name: cleanEventName(v.name) }
}

const byDate = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)

/** Drop invalid events and duplicate ids, cap the count, and sort by date. */
export function sanitiseCalendarEvents(value: unknown): CalendarEvent[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: CalendarEvent[] = []
  for (const item of value) {
    const event = sanitiseCalendarEvent(item)
    if (!event || seen.has(event.id)) continue
    seen.add(event.id)
    out.push(event)
    if (out.length >= MAX_CALENDAR_EVENTS) break
  }
  return out.sort(byDate)
}
