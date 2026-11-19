import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { CalendarsSection } from './CalendarsSection'
import { CompaniesSection } from './CompaniesSection'
import { DayCountInput } from './DayCountInput'
import { StyleField } from './StyleControls'
import { newId } from './newId'
import { formatBridgeDates } from '../domain/bridges'
import { MONTH_NAMES, daysInMonth, todayIso } from '../domain/dates'
import { fortnightStartFor, fortnightWeek, mondayOf } from '../domain/workPattern'
import {
  PERSON_NAME_MAX,
  REGIONS,
  type Company,
  type ImportedCalendar,
  type DateRange,
  type Person,
  type Region,
  type Settings,
} from '../domain/types'
import { companyOf, type PlannerAction } from '../state/plannerState'
import type { PersonStatus } from '../state/usePlanner'
import { PERSON_COLOURS, PERSON_COLOUR_NAMES } from '../theme'
import './SettingsDrawer.css'

export type SettingsTab = 'people' | 'plan'

export interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  /** The active person's effective settings. */
  settings: Settings
  activePerson: Person
  /** Everyone in the plan (for the person chooser). */
  people: PersonStatus[]
  companies: Company[]
  calendars: ImportedCalendar[]
  onImportCalendarFile: (file: File) => void
  /** The leave year being shown (for "Clear X's leave" and company day counts). */
  range: DateRange
  /** The leave year's label, e.g. "2026" or "2026/27". */
  label: string
  dispatch: (action: PlannerAction) => void
  onExportJson: () => void
  onImportFile: (file: File) => void
  /** Message from the last failed import, or null. */
  importError: string | null
}

const WEEKDAYS = [
  { dow: 1, label: 'Mon' },
  { dow: 2, label: 'Tue' },
  { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' },
  { dow: 5, label: 'Fri' },
  { dow: 6, label: 'Sat' },
  { dow: 0, label: 'Sun' },
]

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'plan', label: 'Plan' },
]

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function SettingsDrawer(props: SettingsDrawerProps) {
  const { open, onClose, tab, onTabChange, settings, activePerson, people, companies, range, label, dispatch } = props
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const uid = useId()
  const titleId = `${uid}-title`
  const tabId = (t: SettingsTab) => `${uid}-tab-${t}`
  const panelId = (t: SettingsTab) => `${uid}-panel-${t}`

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // `cancel` fires on Escape; `close` fires after any close. Both just tell the parent.
    const onCancel = (e: Event) => {
      e.preventDefault()
      onCloseRef.current()
    }
    const onDialogClose = () => {
      returnFocus.current?.focus()
      returnFocus.current = null
      onCloseRef.current()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('close', onDialogClose)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('close', onDialogClose)
    }
  }, [])

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.id === tab)
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    onTabChange(TABS[next].id)
    document.getElementById(tabId(TABS[next].id))?.focus()
  }

  return (
    <dialog ref={dialogRef} className="settings-drawer" aria-labelledby={titleId} onClick={onBackdropClick}>
      <div className="drawer-sheet">
        <header className="drawer-header">
          <div className="drawer-title-row">
            <h1 id={titleId} className="drawer-title">
              Settings
            </h1>
            <button type="button" className="btn btn-ghost icon-btn drawer-close" aria-label="Close settings" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div role="tablist" aria-label="Settings sections" className="drawer-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={tabId(t.id)}
                type="button"
                role="tab"
                className="drawer-tab"
                aria-selected={tab === t.id}
                aria-controls={panelId(t.id)}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => onTabChange(t.id)}
                onKeyDown={onTabKeyDown}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div className="drawer-body">
          {tab === 'people' ? (
            <div role="tabpanel" id={panelId('people')} aria-labelledby={tabId('people')} className="drawer-panel">
              <PeopleTab settings={settings} activePerson={activePerson} people={people} companies={companies} range={range} label={label} dispatch={dispatch} />
            </div>
          ) : (
            <div role="tabpanel" id={panelId('plan')} aria-labelledby={tabId('plan')} className="drawer-panel">
              <PlanTab {...props} />
            </div>
          )}
        </div>

        <footer className="drawer-footer">
          <span className="hint">Changes save automatically · v{__APP_VERSION__}</span>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </dialog>
  )
}

/* --- People tab ------------------------------------------------------------ */

type PeopleTabProps = Pick<
  SettingsDrawerProps,
  'settings' | 'activePerson' | 'people' | 'companies' | 'range' | 'label' | 'dispatch'
>

function PeopleTab({ settings, activePerson, people, companies, range, label, dispatch }: PeopleTabProps) {
  const update = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch })
  const name = activePerson.name
  const colour = activePerson.colour
  const colourIsPreset = PERSON_COLOURS.some((c) => c === colour.toLowerCase())
  const entitlement = settings.allowanceDays + settings.carryOverDays

  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const commitName = () => {
    const trimmed = (nameDraft ?? '').trim()
    // An empty name reverts to the current one.
    if (trimmed && trimmed !== name) dispatch({ type: 'renamePerson', id: activePerson.id, name: trimmed })
    setNameDraft(null)
  }

  return (
    <>
      <PersonChooser people={people} dispatch={dispatch} />

      <section className="drawer-section" aria-labelledby="drawer-person-h">
        <h2 id="drawer-person-h" className="section-label">
          Person
        </h2>
        <div className={activePerson.tracksAllowance ? 'drawer-grid-2' : undefined}>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              maxLength={PERSON_NAME_MAX}
              value={nameDraft ?? name}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') {
                  // Revert the edit without also closing the drawer.
                  e.preventDefault()
                  e.stopPropagation()
                  setNameDraft(null)
                  e.currentTarget.blur()
                }
              }}
            />
          </label>
          {activePerson.tracksAllowance && (
          <label className="field">
            <span>Company</span>
            <select
              value={companyOf(companies, activePerson)?.id ?? ''}
              onChange={(e) => dispatch({ type: 'setPersonCompany', personId: activePerson.id, companyId: e.target.value || null })}
            >
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          )}
        </div>
        <fieldset className="field">
          <legend id="drawer-type-l">Type</legend>
          <div className="segmented" role="group" aria-labelledby="drawer-type-l">
            {[
              { value: true, label: 'Takes leave' },
              { value: false, label: 'Marks dates' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={activePerson.tracksAllowance === o.value}
                onClick={() =>
                  activePerson.tracksAllowance === o.value ||
                  dispatch({ type: 'setPersonTracksAllowance', id: activePerson.id, tracksAllowance: o.value })
                }
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="hint">
            Marks dates suits school holidays or other days someone needs to cover: any day can be marked and there’s no allowance.
          </span>
        </fieldset>
        <fieldset className="field">
          <legend>Colour</legend>
          <div className="colour-swatches">
            {PERSON_COLOURS.map((c) => {
              const on = colour.toLowerCase() === c
              const colourName = PERSON_COLOUR_NAMES[c] ?? c
              return (
                <button
                  key={c}
                  type="button"
                  className="colour-swatch"
                  aria-pressed={on}
                  aria-label={colourName}
                  title={colourName}
                  onClick={() => dispatch({ type: 'setPersonColour', id: activePerson.id, colour: c })}
                >
                  <span className="colour-swatch-fill" style={{ background: c }}>
                    {on && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m3 7.5 2.5 2.5L11 4.5" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })}
            <input
              type="color"
              className={`colour-custom${colourIsPreset ? '' : ' colour-custom--active'}`}
              aria-label="Custom colour"
              title="Custom colour"
              value={colour}
              onChange={(e) => dispatch({ type: 'setPersonColour', id: activePerson.id, colour: e.target.value })}
            />
          </div>
        </fieldset>
        <StyleField
          legend="Style"
          colour={colour}
          value={activePerson.style}
          hint="Outline draws a border around runs of days instead of filling them."
          onChange={(style) => dispatch({ type: 'setPersonStyle', id: activePerson.id, style })}
        />
      </section>

      {activePerson.tracksAllowance && (
      <section className="drawer-section drawer-divided" aria-labelledby="drawer-allowance-h">
        <h2 id="drawer-allowance-h" className="section-label">
          {name}’s allowance
        </h2>
        <div className="drawer-grid-2">
          <DayCountInput label="Annual allowance" suffix="days" value={settings.allowanceDays} onCommit={(allowanceDays) => update({ allowanceDays })} />
          <DayCountInput label="Carried over" suffix="days" value={settings.carryOverDays} onCommit={(carryOverDays) => update({ carryOverDays })} />
        </div>
        <p className="drawer-note">
          Entitlement for {label}: <strong>{fmt(entitlement)} days</strong>
        </p>

        <WorkingPattern settings={settings} update={update} />

        <SwitchRow
          label="Bank holidays come out of the allowance"
          hint={`Turn on if ${name}’s contract counts bank holidays as leave.`}
          checked={settings.bankHolidaysDeducted}
          onChange={(bankHolidaysDeducted) => update({ bankHolidaysDeducted })}
        />
      </section>
      )}

      <section className="drawer-section drawer-divided drawer-danger" aria-label="Clear or remove">
        <button
          type="button"
          className="btn btn-ghost drawer-danger-btn"
          onClick={() => {
            if (confirm(`Clear all of ${name}’s ${activePerson.tracksAllowance ? 'leave' : 'dates'} in ${label}?`)) {
              dispatch({ type: 'clearLeaveInRange', start: range.start, end: range.end })
            }
          }}
        >
          Clear {name}’s {activePerson.tracksAllowance ? 'leave' : 'dates'} in {label}
        </button>
        {people.length > 1 && (
          <button
            type="button"
            className="btn btn-danger drawer-danger-btn"
            onClick={() => {
              if (confirm(`Remove ${name} and all of their ${activePerson.tracksAllowance ? 'leave' : 'dates'}?`)) {
                dispatch({ type: 'removePerson', id: activePerson.id })
              }
            }}
          >
            Remove {name} and their {activePerson.tracksAllowance ? 'leave' : 'dates'}
          </button>
        )}
      </section>
    </>
  )
}

function PersonChooser({ people, dispatch }: { people: PersonStatus[]; dispatch: (action: PlannerAction) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const wasAdding = useRef(false)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
    else if (wasAdding.current) addButtonRef.current?.focus()
    wasAdding.current = adding
  }, [adding])

  const close = () => {
    setAdding(false)
    setName('')
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    // The reducer selects the new person.
    dispatch({ type: 'addPerson', id: newId('p'), name: trimmed })
    close()
  }

  return (
    <div role="group" aria-label="Choose a person" className="person-chooser">
      {people.map(({ person, active }) => (
        <button
          key={person.id}
          type="button"
          className="chip"
          aria-pressed={active}
          onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
        >
          <span
            className={`chip-dot${person.style === 'outline' ? ' chip-dot--outline' : ''}`}
            style={{ '--dot-colour': person.colour } as CSSProperties}
            aria-hidden="true"
          />
          {person.name}
        </button>
      ))}
      {adding ? (
        <form className="drawer-inline-form" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text"
            aria-label="New person’s name"
            placeholder="Name"
            maxLength={PERSON_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
          />
          <button type="submit" className="btn btn-secondary">
            Add
          </button>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
        </form>
      ) : (
        <button ref={addButtonRef} type="button" className="chip chip-add" onClick={() => setAdding(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M7 2.5v9M2.5 7h9" />
          </svg>
          Add person
        </button>
      )}
    </div>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="switch-row">
      <span className="switch-row-text">
        <span id={`${id}-l`} className="switch-row-label">
          {label}
        </span>
        <span id={`${id}-h`} className="hint">
          {hint}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-h`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}

/* --- Plan tab -------------------------------------------------------------- */

function PlanTab({ settings, people, companies, calendars, onImportCalendarFile, dispatch, onExportJson, onImportFile, importError }: SettingsDrawerProps) {
  const update = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch })
  // Leap years don't matter for picking a reset day; 2001 is a non-leap year, so cap Feb at 28.
  const maxStartDay = daysInMonth(2001, settings.leaveYearStartMonth)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <section className="drawer-section" aria-labelledby="drawer-year-h">
        <div className="drawer-section-head">
          <h2 id="drawer-year-h" className="section-label">
            Default leave year
          </h2>
          <p className="hint">For people with no company, and for new companies. Each company sets its own under Companies, below.</p>
        </div>
        <fieldset className="field">
          <legend>Starts on</legend>
          <div className="drawer-year-start">
            <select
              aria-label="Start day"
              value={Math.min(settings.leaveYearStartDay, maxStartDay)}
              onChange={(e) => update({ leaveYearStartDay: Number(e.target.value) })}
            >
              {Array.from({ length: maxStartDay }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              aria-label="Start month"
              value={settings.leaveYearStartMonth}
              onChange={(e) => update({ leaveYearStartMonth: Number(e.target.value) })}
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </section>

      <section className="drawer-section drawer-divided" aria-labelledby="drawer-bh-h">
        <h2 id="drawer-bh-h" className="section-label">
          Bank holidays
        </h2>
        <div className="segmented" role="radiogroup" aria-labelledby="drawer-bh-h">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={settings.region === r.id}
              onClick={() => update({ region: r.id as Region })}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="hint">From GOV.UK. Published about a year ahead.</p>
        <SwitchRow
          label="Suggest bridge days"
          hint="Highlights short runs of working days between bank holidays, company days and weekends. Never shown in the PNG."
          checked={settings.showBridgeSuggestions}
          onChange={(showBridgeSuggestions) => update({ showBridgeSuggestions })}
        />
      </section>

      <section className="drawer-section drawer-divided" aria-labelledby="companies-heading">
        <CompaniesSection companies={companies} people={people.map((p) => p.person)} dispatch={dispatch} />
      </section>

      <section className="drawer-section drawer-divided" aria-labelledby="calendars-section-heading">
        <CalendarsSection calendars={calendars} onImportFile={onImportCalendarFile} dispatch={dispatch} />
      </section>

      <section className="drawer-section drawer-divided" aria-labelledby="drawer-backup-h">
        <div className="drawer-section-head">
          <h2 id="drawer-backup-h" className="section-label">
            Backup
          </h2>
          <p className="hint">Your plan is saved in this browser only. Export it to keep a copy or move it to another device.</p>
        </div>
        <div className="drawer-buttons">
          <button type="button" className="btn btn-secondary" onClick={onExportJson}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
            </svg>
            Export plan
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10" />
            </svg>
            Import plan
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onImportFile(file)
            }}
          />
        </div>
        {importError && (
          <p className="warning" role="alert">
            <span>
              {importError} Your current plan hasn’t changed.
            </span>
          </p>
        )}
      </section>
    </>
  )
}

function WeekdayGrid({ days, label, onChange }: { days: number[]; label?: string; onChange: (days: number[]) => void }) {
  return (
    <div className="weekday-grid" role={label ? 'group' : undefined} aria-label={label}>
      {WEEKDAYS.map(({ dow, label: dayLabel }) => {
        const on = days.includes(dow)
        return (
          <button
            key={dow}
            type="button"
            className="weekday-toggle"
            aria-pressed={on}
            onClick={() => onChange(on ? days.filter((d) => d !== dow) : [...days, dow])}
          >
            {dayLabel}
          </button>
        )
      })}
    </div>
  )
}

function WorkingPattern({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const id = useId()
  const today = todayIso()
  const week2 = settings.workingDaysWeek2
  const fortnightly = week2 !== null
  const thisWeek = fortnightWeek(today, settings.fortnightStart)
  const mondayLabel = formatBridgeDates(mondayOf(today), mondayOf(today))
  return (
    <fieldset className="field">
      <legend id={`${id}-pattern`}>Working days</legend>
      <div className="segmented" role="radiogroup" aria-labelledby={`${id}-pattern`}>
        <button
          type="button"
          role="radio"
          aria-checked={!fortnightly}
          onClick={() => !fortnightly || update({ workingDaysWeek2: null })}
        >
          Same every week
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={fortnightly}
          onClick={() =>
            fortnightly ||
            update({ workingDaysWeek2: [...settings.workingDays], fortnightStart: fortnightStartFor(today, 1) })
          }
        >
          Fortnightly
        </button>
      </div>
      {week2 === null ? (
        <WeekdayGrid days={settings.workingDays} onChange={(workingDays) => update({ workingDays })} />
      ) : (
        <>
          <span className="pattern-week-label">Week 1</span>
          <WeekdayGrid label="Week 1" days={settings.workingDays} onChange={(workingDays) => update({ workingDays })} />
          <span className="pattern-week-label">Week 2</span>
          <WeekdayGrid label="Week 2" days={week2} onChange={(workingDaysWeek2) => update({ workingDaysWeek2 })} />
          <span className="pattern-week-label" id={`${id}-now`}>
            This week (w/c {mondayLabel}) is
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${id}-now`}>
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={thisWeek === n}
                onClick={() => update({ fortnightStart: fortnightStartFor(today, n) })}
              >
                Week {n}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="hint">
        {fortnightly ? 'For a 9-day fortnight, untick the day off in one week. ' : ''}Leave can only be booked on working days.
      </span>
    </fieldset>
  )
}
