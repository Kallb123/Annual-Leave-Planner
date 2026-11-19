import data from '../data/school-holidays.json'
import { isIsoDate, type IsoDate } from './dates'
import type { IcsParseResult } from './ics'

/**
 * Bundled school holiday dates for selected local authorities, so people can add them
 * without finding an `.ics` file. Maintained by hand in `src/data/school-holidays.json`
 * from each council's published term dates (see the README).
 */

export interface SchoolHoliday {
  /** First day of the holiday (inclusive). */
  start: IsoDate
  /** Last day of the holiday (inclusive). */
  end: IsoDate
  /** e.g. "October half term". */
  name: string
}

export interface SchoolHolidayArea {
  /** Stable slug, e.g. "sheffield". */
  id: string
  /** Short place name shown in the picker, e.g. "Sheffield". */
  name: string
  /** The council that sets the dates, e.g. "Sheffield City Council". */
  authority: string
  /** Grouping in the picker, e.g. "South Yorkshire". */
  region: string
  /** The council's term dates page. */
  source: string
  /** When the dates were last checked against `source`. */
  checked: IsoDate
  /** Sorted by start date; never overlapping. */
  holidays: SchoolHoliday[]
}

export interface SchoolHolidayData {
  areas: SchoolHolidayArea[]
}

const bundled = data as SchoolHolidayData

/** Every bundled area, sorted by region then name. */
export function schoolHolidayAreas(source: SchoolHolidayData = bundled): SchoolHolidayArea[] {
  return [...source.areas].sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name))
}

/** Areas grouped by region, in `schoolHolidayAreas` order. */
export function schoolHolidayRegions(source: SchoolHolidayData = bundled): { region: string; areas: SchoolHolidayArea[] }[] {
  const groups: { region: string; areas: SchoolHolidayArea[] }[] = []
  for (const area of schoolHolidayAreas(source)) {
    const last = groups[groups.length - 1]
    if (last?.region === area.region) last.areas.push(area)
    else groups.push({ region: area.region, areas: [area] })
  }
  return groups
}

/** Name suggested for the calendar made from an area, e.g. "School holidays (Sheffield)". */
export const schoolHolidayCalendarName = (area: SchoolHolidayArea) => `School holidays (${area.name})`

/**
 * An area's holidays in the shape the `.ics` import preview takes, so they go through the
 * same review step. Holidays that ended before `from` are left out.
 */
export function schoolHolidayImport(area: SchoolHolidayArea, from: IsoDate): IcsParseResult {
  return {
    events: area.holidays
      .filter((h) => h.end >= from)
      .map((h) => ({ key: `${area.id}:${h.start}`, start: h.start, end: h.end, name: h.name })),
    calendarName: schoolHolidayCalendarName(area),
    skipped: 0,
    unsupportedRepeats: 0,
    truncated: false,
  }
}

/** Problems with the bundled data, for the tests: empty when it's all usable. */
export function schoolHolidayDataProblems(source: SchoolHolidayData = bundled): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const area of source.areas) {
    const at = area.id || '(no id)'
    if (!/^[a-z0-9-]+$/.test(area.id)) problems.push(`${at}: id must be a lower-case slug`)
    if (ids.has(area.id)) problems.push(`${at}: duplicate id`)
    ids.add(area.id)
    for (const key of ['name', 'authority', 'region'] as const) {
      if (typeof area[key] !== 'string' || !area[key].trim()) problems.push(`${at}: missing ${key}`)
    }
    if (!/^https:\/\//.test(area.source)) problems.push(`${at}: source must be an https URL`)
    if (!isIsoDate(area.checked)) problems.push(`${at}: checked must be a date`)
    if (area.holidays.length === 0) problems.push(`${at}: no holidays`)
    let previous: SchoolHoliday | null = null
    for (const h of area.holidays) {
      const what = `${at} ${h.start} ${h.name}`
      if (!isIsoDate(h.start) || !isIsoDate(h.end)) problems.push(`${what}: invalid date`)
      else if (h.end < h.start) problems.push(`${what}: ends before it starts`)
      if (!h.name?.trim()) problems.push(`${what}: missing name`)
      if (previous && h.start <= previous.end) problems.push(`${what}: overlaps or is out of order after ${previous.start}`)
      previous = h
    }
  }
  return problems
}
