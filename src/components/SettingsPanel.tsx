import { useState } from 'react'
import { CompanyDaysSection } from './CompanyDaysSection'
import { DayCountInput } from './DayCountInput'
import { MONTH_NAMES, daysInMonth } from '../domain/dates'
import { PERSON_NAME_MAX, REGIONS, type CompanyDay, type Person, type Region, type Settings } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import { PERSON_COLOURS } from '../theme'

const COLOUR_NAMES: Record<string, string> = {
  '#2f9e6a': 'Green',
  '#2563eb': 'Blue',
  '#db2777': 'Pink',
  '#0891b2': 'Cyan',
  '#7c3aed': 'Violet',
  '#8b5e34': 'Brown',
  '#dc2626': 'Red',
  '#475569': 'Slate',
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

interface Props {
  /** Small screens only: the panel gets a toggle and can be collapsed. Always open otherwise. */
  collapsible?: boolean
  /** Initial collapsed state when `collapsible` (collapsed for returning users). */
  defaultCollapsed?: boolean
  /** The active person's effective settings. */
  settings: Settings
  activePerson: Person
  peopleCount: number
  companyDays: CompanyDay[]
  dispatch: (action: PlannerAction) => void
}

export function SettingsPanel({ collapsible = false, defaultCollapsed = false, settings, activePerson, peopleCount, companyDays, dispatch }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const hidden = collapsible && collapsed
  const regionLabel = REGIONS.find((r) => r.id === settings.region)?.label ?? ''
  const update = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch })
  // Leap years don't matter for picking a reset day; 2001 is a non-leap year, so cap Feb at 28.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const commitName = () => {
    const trimmed = (nameDraft ?? '').trim()
    // An empty name reverts to the current one.
    if (trimmed && trimmed !== activePerson.name) dispatch({ type: 'renamePerson', id: activePerson.id, name: trimmed })
    setNameDraft(null)
  }
  const colour = activePerson.colour
  const colourIsPreset = PERSON_COLOURS.some((c) => c === colour)
  const possessive = peopleCount > 1 ? 'their' : 'my'
  const maxStartDay = daysInMonth(2001, settings.leaveYearStartMonth)

  return (
    <section className="panel settings" aria-labelledby="settings-heading">
      <h2 id="settings-heading">
        {collapsible ? (
          <button
            type="button"
            className="settings-toggle"
            aria-expanded={!collapsed}
            aria-controls="settings-body"
            onClick={() => setCollapsed((c) => !c)}
          >
            <span className="settings-toggle-text">
              <span>Settings</span>
              <span className="settings-summary">
                {activePerson.name} · {settings.allowanceDays} days · {regionLabel}
              </span>
            </span>
            <span className="settings-chevron" aria-hidden="true" />
          </button>
        ) : (
          'Settings'
        )}
      </h2>

      <div id="settings-body" className="settings-body" hidden={hidden}>
        <section className="settings-group settings-person" aria-labelledby="person-heading">
          <h3 id="person-heading">Person</h3>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              maxLength={PERSON_NAME_MAX}
              value={nameDraft ?? activePerson.name}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') {
                  setNameDraft(null)
                  e.currentTarget.blur()
                }
              }}
            />
          </label>

          <fieldset className="field">
            <legend>Colour</legend>
            <div className="colour-swatches">
              {PERSON_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="colour-swatch"
                  style={{ background: c }}
                  aria-pressed={colour.toLowerCase() === c}
                  aria-label={COLOUR_NAMES[c] ?? c}
                  title={COLOUR_NAMES[c] ?? c}
                  onClick={() => dispatch({ type: 'setPersonColour', id: activePerson.id, colour: c })}
                />
              ))}
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

          {peopleCount > 1 && (
            <button
              type="button"
              className="link remove-person"
              onClick={() => {
                if (confirm(`Remove ${activePerson.name} and all of their leave?`)) {
                  dispatch({ type: 'removePerson', id: activePerson.id })
                }
              }}
            >
              Remove {activePerson.name}
            </button>
          )}
        </section>

        <section className="settings-group" aria-labelledby="person-leave-heading">
          <h3 id="person-leave-heading">{activePerson.name}’s leave</h3>
          <div className="field-row">
            <DayCountInput
              label="Annual allowance (days)"
              value={settings.allowanceDays}
              onCommit={(allowanceDays) => update({ allowanceDays })}
            />
            <DayCountInput
              label="Carried over (days)"
              value={settings.carryOverDays}
              onCommit={(carryOverDays) => update({ carryOverDays })}
            />
          </div>

          <fieldset className="field">
            <legend>Working days</legend>
            <div className="weekday-toggles">
              {WEEKDAYS.map(({ dow, label }) => {
                const on = settings.workingDays.includes(dow)
                return (
                  <button
                    key={dow}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        workingDays: on
                          ? settings.workingDays.filter((d) => d !== dow)
                          : [...settings.workingDays, dow],
                      })
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.bankHolidaysDeducted}
              onChange={(e) => update({ bankHolidaysDeducted: e.target.checked })}
            />
            <span>Bank holidays come out of {possessive} allowance</span>
          </label>
        </section>

        <section className="settings-group" aria-labelledby="everyone-heading">
          <h3 id="everyone-heading">Everyone</h3>
          <fieldset className="field">
            <legend>Leave year starts on</legend>
            <div className="field-row">
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
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <label className="field">
            <span>Bank holidays</span>
            <select value={settings.region} onChange={(e) => update({ region: e.target.value as Region })}>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.showBridgeSuggestions}
              onChange={(e) => update({ showBridgeSuggestions: e.target.checked })}
            />
            <span>Suggest bridge days (short leave around bank holidays)</span>
          </label>

          <CompanyDaysSection companyDays={companyDays} dispatch={dispatch} />
        </section>
      </div>
    </section>
  )
}
