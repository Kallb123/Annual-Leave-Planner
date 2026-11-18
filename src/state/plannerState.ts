import { isBookable } from '../domain/allowance'
import { bankHolidayIndex } from '../domain/bankHolidays'
import { companyDayIndex, sanitiseCompanyDay, sanitiseCompanyDays } from '../domain/companyDays'
import { eachDay, isIsoDate } from '../domain/dates'
import {
  DEFAULT_PERSON_NAME,
  DEFAULT_PERSON_SETTINGS,
  DEFAULT_SETTINGS,
  PERSON_NAME_MAX,
  PERSON_SETTING_KEYS,
  REGIONS,
  type CompanyDay,
  type LeaveEntries,
  type LeavePortion,
  type Person,
  type PersonSettings,
  type Settings,
  type SharedSettings,
} from '../domain/types'
import { PERSON_COLOURS, isHexColour, nextPersonColour } from '../theme'

/**
 * Everything the user has entered. This is the only state that is persisted;
 * everything else (leave years, summaries, calendar cells) is derived.
 */
export interface PlannerState {
  /** Settings that apply to everyone: leave year start, region, bridge suggestions. */
  shared: SharedSettings
  /** Never empty, in display order. */
  people: Person[]
  /** Always the id of someone in `people`. */
  activePersonId: string
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
  | { type: 'addPerson'; id: string; name: string; colour?: string }
  | { type: 'removePerson'; id: string }
  | { type: 'renamePerson'; id: string; name: string }
  | { type: 'setPersonColour'; id: string; colour: string }
  | { type: 'selectPerson'; id: string }
  | { type: 'addCompanyDay'; day: CompanyDay }
  | { type: 'removeCompanyDay'; id: string }
  | { type: 'shiftYear'; by: number }
  | { type: 'resetYear' }

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** The effective settings for one person: shared settings plus their own. */
export function personSettings(shared: SharedSettings, person: Person): Settings {
  return {
    ...shared,
    allowanceDays: person.allowanceDays,
    carryOverDays: person.carryOverDays,
    workingDays: person.workingDays,
    bankHolidaysDeducted: person.bankHolidaysDeducted,
  }
}

/** The person being edited. Falls back to the first person, which only matters for malformed state. */
export function activePerson(state: Pick<PlannerState, 'people' | 'activePersonId'>): Person {
  return state.people.find((p) => p.id === state.activePersonId) ?? state.people[0]
}

const PERSON_KEY_SET: ReadonlySet<string> = new Set(PERSON_SETTING_KEYS)

function splitSettings(s: Settings): { shared: SharedSettings; person: PersonSettings } {
  const shared: Record<string, unknown> = {}
  const person: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) (PERSON_KEY_SET.has(k) ? person : shared)[k] = v
  return { shared: shared as SharedSettings, person: person as PersonSettings }
}

const cleanName = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, PERSON_NAME_MAX).trim() : ''

function updateActive(state: PlannerState, change: (p: Person) => Person): PlannerState {
  return { ...state, people: state.people.map((p) => (p.id === state.activePersonId ? change(p) : p)) }
}

function updatePerson(state: PlannerState, id: string, change: (p: Person) => Person): PlannerState {
  if (!state.people.some((p) => p.id === id)) return state
  return { ...state, people: state.people.map((p) => (p.id === id ? change(p) : p)) }
}

/** Click cycle for a bookable day: none → full → half → none. */
export function nextPortion(current: LeavePortion | undefined): LeavePortion | undefined {
  if (current === undefined) return 'full'
  if (current === 'full') return 'half'
  return undefined
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'updateSettings': {
      const current = personSettings(state.shared, activePerson(state))
      const { shared, person } = splitSettings(sanitiseSettings({ ...current, ...action.patch }, current))
      return { ...updateActive(state, (p) => ({ ...p, ...person })), shared }
    }
    case 'cycleLeave':
      return updateActive(state, (p) => {
        const leave = { ...p.leave }
        const next = nextPortion(leave[action.date])
        if (next) leave[action.date] = next
        else delete leave[action.date]
        return { ...p, leave }
      })
    case 'setLeaveRange': {
      // Start/end may arrive in either order (drag or shift-click backwards).
      const [from, to] = action.start <= action.end ? [action.start, action.end] : [action.end, action.start]
      // The holiday index is derived from settings here rather than passed in, so
      // the action stays a plain serialisable value.
      const holidays = bankHolidayIndex(state.shared.region)
      const companyDays = companyDayIndex(state.companyDays)
      return updateActive(state, (p) => {
        const settings = personSettings(state.shared, p)
        const leave = { ...p.leave }
        for (const date of eachDay(from, to)) {
          if (!isBookable(date, settings, holidays, companyDays)) continue
          if (action.portion) leave[date] = action.portion
          else delete leave[date]
        }
        return { ...p, leave }
      })
    }
    case 'clearLeaveInRange':
      return updateActive(state, (p) => ({
        ...p,
        leave: Object.fromEntries(Object.entries(p.leave).filter(([d]) => d < action.start || d > action.end)),
      }))
    case 'addPerson': {
      const name = cleanName(action.name)
      if (!name || state.people.some((p) => p.id === action.id)) return state
      const colour = isHexColour(action.colour)
        ? action.colour.toLowerCase()
        : nextPersonColour(state.people.map((p) => p.colour))
      const person: Person = { ...DEFAULT_PERSON_SETTINGS, id: action.id, name, colour, leave: {} }
      return { ...state, people: [...state.people, person], activePersonId: person.id }
    }
    case 'removePerson': {
      const index = state.people.findIndex((p) => p.id === action.id)
      if (index < 0 || state.people.length <= 1) return state
      const people = state.people.filter((p) => p.id !== action.id)
      const activePersonId =
        state.activePersonId === action.id ? people[Math.min(index, people.length - 1)].id : state.activePersonId
      return { ...state, people, activePersonId }
    }
    case 'renamePerson': {
      const name = cleanName(action.name)
      return name ? updatePerson(state, action.id, (p) => ({ ...p, name })) : state
    }
    case 'setPersonColour': {
      if (!isHexColour(action.colour)) return state
      const colour = action.colour.toLowerCase()
      return updatePerson(state, action.id, (p) => ({ ...p, colour }))
    }
    case 'selectPerson':
      return state.people.some((p) => p.id === action.id) ? { ...state, activePersonId: action.id } : state
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
const SCHEMA_VERSION = 3

/** Id given to the person created from v1/v2 data or on first visit. */
const DEFAULT_PERSON_ID = 'person-1'

/**
 * Stored shape history:
 * - v1: `{ version, settings, leave }`
 * - v2: adds `companyDays`
 * - v3: several people. `settings` splits into `shared` and per-person settings,
 *   and `leave` moves onto each person: `{ version, shared, people, activePersonId, companyDays }`
 */
interface StoredStateV3 {
  version: 3
  shared: SharedSettings
  people: Person[]
  activePersonId: string
  companyDays: CompanyDay[]
}

type StoredContent = Omit<StoredStateV3, 'version'>

function defaultPerson(): Person {
  return {
    ...DEFAULT_PERSON_SETTINGS,
    id: DEFAULT_PERSON_ID,
    name: DEFAULT_PERSON_NAME,
    colour: PERSON_COLOURS[0],
    leave: {},
  }
}

export function initialState(storage: Storage | undefined = safeLocalStorage()): PlannerState {
  const stored = storage ? readStored(storage) : null
  if (stored) return { ...stored, yearOffset: 0 }
  return {
    shared: splitSettings(DEFAULT_SETTINGS).shared,
    people: [defaultPerson()],
    activePersonId: DEFAULT_PERSON_ID,
    companyDays: [],
    yearOffset: 0,
  }
}

/**
 * True when storage already holds valid saved planner data (a returning user).
 * Call it before the first `persist`, which would otherwise make every visit look returning.
 */
export function hasSavedState(storage: Storage | undefined = safeLocalStorage()): boolean {
  return storage ? readStored(storage) !== null : false
}

export function persist(state: PlannerState, storage: Storage | undefined = safeLocalStorage()) {
  if (!storage) return
  const payload: StoredStateV3 = {
    version: SCHEMA_VERSION,
    shared: state.shared,
    people: state.people,
    activePersonId: state.activePersonId,
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
  const p = parsed as Record<string, unknown>
  if (p.version === 1 || p.version === 2) {
    const { shared, person } = splitSettings(
      sanitiseSettings({ ...DEFAULT_SETTINGS, ...(asObject(p.settings) as Partial<Settings>) }),
    )
    return {
      shared,
      people: [{ ...defaultPerson(), ...person, leave: sanitiseLeave(p.leave) }],
      activePersonId: DEFAULT_PERSON_ID,
      // v1 had no company days, so `companyDays` is simply absent and becomes [].
      companyDays: sanitiseCompanyDays(p.version === 1 ? [] : p.companyDays),
    }
  }
  if (p.version !== 3) return null
  const shared = splitSettings(
    sanitiseSettings({ ...DEFAULT_SETTINGS, ...(asObject(p.shared) as Partial<Settings>) }),
  ).shared
  const people = sanitisePeople(p.people)
  const activePersonId =
    typeof p.activePersonId === 'string' && people.some((x) => x.id === p.activePersonId)
      ? p.activePersonId
      : people[0].id
  return { shared, people, activePersonId, companyDays: sanitiseCompanyDays(p.companyDays) }
}

const asObject = (v: unknown): object => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

function sanitisePeople(value: unknown): Person[] {
  const people: Person[] = []
  const ids = new Set<string>()
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || ids.has(r.id)) continue
    ids.add(r.id)
    const index = people.length
    const settings = sanitiseSettings({ ...DEFAULT_SETTINGS, ...DEFAULT_PERSON_SETTINGS, ...pickPersonKeys(r) })
    people.push({
      ...splitSettings(settings).person,
      id: r.id,
      name: cleanName(r.name) || (index === 0 ? DEFAULT_PERSON_NAME : `Person ${index + 1}`),
      colour: isHexColour(r.colour) ? r.colour.toLowerCase() : nextPersonColour(people.map((x) => x.colour)),
      leave: sanitiseLeave(r.leave),
    })
  }
  return people.length ? people : [defaultPerson()]
}

function pickPersonKeys(r: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {}
  for (const k of PERSON_SETTING_KEYS) if (k in r) out[k] = r[k]
  return out as Partial<Settings>
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
