import { dayOfWeek, daysBetween, MONTH_NAMES, parseIso, type IsoDate } from '../domain/dates'

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const part = (date: IsoDate) => {
  const { day, month } = parseIso(date)
  return `${WEEKDAY_SHORT[dayOfWeek(date)]} ${day} ${MONTH_NAMES[month - 1].slice(0, 3)}`
}

/** "Mon 27 Oct – Fri 31 Oct 2025 · 5 days", or "Mon 27 Oct 2025" for a single day. */
export function describeEventDates(start: IsoDate, end: IsoDate): string {
  const sy = parseIso(start).year
  const ey = parseIso(end).year
  if (start === end) return `${part(start)} ${sy}`
  const days = daysBetween(start, end) + 1
  const from = sy === ey ? part(start) : `${part(start)} ${sy}`
  return `${from} – ${part(end)} ${ey} · ${days} days`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
