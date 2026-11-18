import { isBookable } from '../domain/allowance'
import { bankHolidayIndex } from '../domain/bankHolidays'
import { companyDayIndex, sanitiseCompanyDay, sanitiseCompanyDays } from '../domain/companyDays'
import { eachDay, isIsoDate } from '../domain/dates'
import {
  DEFAULT_SETTINGS,
  REGIONS,
  type CompanyDay,
  type LeaveEntries,
  type LeavePortion,
  type Settings,
} from '../domain/types'

/**
 * Everything the user has entered. This is the only state that is persisted;
 * everything else (leave years, summaries, calendar cells) is derived.
 */
export interface PlannerState {
  settings: Settings
  leave: LeaveEntries
  /** Employer closures and extra holidays, sorted by date. */
  companyDays: CompanyDay[]
  /** Leave years forward/back from the one containing today. Not persisted. */
  yearOffset: number
}

export type PlannerAction =
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'cycleLeave'; date: string }
  | { type: 'setLeaveRange'; start: string; end: string; portion: LeavePortion | undefined }
  | { type: 'clearLeaveInRange'; start: string; end: string }
  | { type: 'addCompanyDay'; day: CompanyDay }
  | { type: 'removeCompanyDay'; id: string }
  | { type: 'shiftYear'; by: number }
  | { type: 'resetYear' }

/** Click cycle for a bookable day: none → full → half → none. */
export function nextPortion(current: LeavePortion | undefined): LeavePortion | undefined {
  if (current === undefined) return 'full'
  if (current === 'full') return 'half'
  return undefined
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'updateSettings':
      return {
        ...state,
        settings: sanitiseSettings({ ...state.settings, ...action.patch }, state.settings),
      }
    case 'cycleLeave': {
      const leave = { ...state.leave }
      const next = nextPortion(leave[action.date])
      if (next) leave[action.date] = next
      else delete leave[action.date]
      return { ...state, leave }
    }
    case 'setLeaveRange': {
      // Start/end may arrive in either order (drag or shift-click backwards).
      const [from, to] = action.start <= action.end ? [action.start, action.end] : [action.end, action.start]
      // The holiday index is derived from settings here rather than passed in, so
      // the action stays a plain serialisable value.
      const holidays = bankHolidayIndex(state.settings.region)
      const companyDays = companyDayIndex(state.companyDays)
      const leave = { ...state.leave }
      for (const date of eachDay(from, to)) {
        if (!isBookable(date, state.settings, holidays, companyDays)) continue
        if (action.portion) leave[date] = action.portion
        else delete leave[date]
      }
      return { ...state, leave }
    }
    case 'clearLeaveInRange': {
      const leave = Object.fromEntries(
        Object.entries(state.leave).filter(([d]) => d < action.start || d > action.end),
      )
      return { ...state, leave }
    }
    case 'addCompanyDay': {
      // Invalid input and duplicate ids are ignored; the UI validates first.
      const day = sanitiseCompanyDay(action.day)
      if (!day || state.companyDays.some((d) => d.id === day.id)) return state
      return { ...state, companyDays: sanitiseCompanyDays([...state.companyDays, day]) }
    }
    case 'removeCompanyDay':
      return { ...state, companyDays: state.companyDays.filter((d) => d.id !== action.id) }
    case 'shiftYear':
      return { ...state, yearOffset: state.yearOffset + action.by }
    case 'resetYear':
      return { ...state, yearOffset: 0 }
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'annual-leave-planner'
const SCHEMA_VERSION = 2

/**
 * Stored shape history:
 * - v1: `{ version, settings, leave }`
 * - v2: adds `companyDays`
 */
interface StoredStateV2 {
  version: 2
  settings: Settings
  leave: LeaveEntries
  companyDays: CompanyDay[]
}

type StoredContent = Omit<StoredStateV2, 'version'>

export function initialState(storage: Storage | undefined = safeLocalStorage()): PlannerState {
  const stored = storage ? readStored(storage) : null
  return {
    settings: stored?.settings ?? DEFAULT_SETTINGS,
    leave: stored?.leave ?? {},
    companyDays: stored?.companyDays ?? [],
    yearOffset: 0,
  }
}

export function persist(state: PlannerState, storage: Storage | undefined = safeLocalStorage()) {
  if (!storage) return
  const payload: StoredStateV2 = {
    version: SCHEMA_VERSION,
    settings: state.settings,
    leave: state.leave,
    companyDays: state.companyDays,
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota exceeded or storage disabled: the app still works for this session.
  }
}

function readStored(storage: Storage): StoredContent | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    return migrateStored(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Bring any known stored version up to the current shape, validating every
 * field. Returns null for unknown versions or non-objects. Add a case here
 * whenever SCHEMA_VERSION is bumped.
 */
export function migrateStored(parsed: unknown): StoredContent | null {
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as { version?: unknown; settings?: unknown; leave?: unknown; companyDays?: unknown }
  if (p.version !== 1 && p.version !== 2) return null
  return {
    settings: sanitiseSettings({ ...DEFAULT_SETTINGS, ...(p.settings as Partial<Settings>) }),
    leave: sanitiseLeave(p.leave),
    // v1 had no company days, so `companyDays` is simply absent and becomes [].
    companyDays: sanitiseCompanyDays(p.version === 1 ? [] : p.companyDays),
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Validation: settings come from form inputs and localStorage, so never trust them.
// ---------------------------------------------------------------------------

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const toHalf = (n: number) => Math.round(n * 2) / 2
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Clamp and validate settings. Invalid values fall back to `d` (e.g. the previous settings). */
export function sanitiseSettings(s: Settings, d: Settings = DEFAULT_SETTINGS): Settings {
  const workingDays = Array.isArray(s.workingDays)
    ? [...new Set(s.workingDays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
    : d.workingDays
  return {
    allowanceDays: clamp(toHalf(num(s.allowanceDays, d.allowanceDays)), 0, 366),
    carryOverDays: clamp(toHalf(num(s.carryOverDays, d.carryOverDays)), 0, 366),
    leaveYearStartMonth: clamp(Math.round(num(s.leaveYearStartMonth, d.leaveYearStartMonth)), 1, 12),
    leaveYearStartDay: clamp(Math.round(num(s.leaveYearStartDay, d.leaveYearStartDay)), 1, 31),
    region: REGIONS.some((r) => r.id === s.region) ? s.region : d.region,
    workingDays,
    bankHolidaysDeducted: typeof s.bankHolidaysDeducted === 'boolean' ? s.bankHolidaysDeducted : d.bankHolidaysDeducted,
    showBridgeSuggestions:
      typeof s.showBridgeSuggestions === 'boolean' ? s.showBridgeSuggestions : d.showBridgeSuggestions,
  }
}

function sanitiseLeave(value: unknown): LeaveEntries {
  if (!value || typeof value !== 'object') return {}
  const out: LeaveEntries = {}
  for (const [date, portion] of Object.entries(value)) {
    if (isIsoDate(date) && (portion === 'full' || portion === 'half')) out[date] = portion
  }
  return out
}
