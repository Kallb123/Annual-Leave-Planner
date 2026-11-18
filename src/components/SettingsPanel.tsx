import { CompanyDaysSection } from './CompanyDaysSection'
import { DayCountInput } from './DayCountInput'
import { MONTH_NAMES, daysInMonth } from '../domain/dates'
import { REGIONS, type CompanyDay, type Region, type Settings } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'

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
  settings: Settings
  companyDays: CompanyDay[]
  dispatch: (action: PlannerAction) => void
}

export function SettingsPanel({ settings, companyDays, dispatch }: Props) {
  const update = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch })
  // Leap years don't matter for picking a reset day; 2001 is a non-leap year, so cap Feb at 28.
  const maxStartDay = daysInMonth(2001, settings.leaveYearStartMonth)

  return (
    <section className="panel settings" aria-labelledby="settings-heading">
      <h2 id="settings-heading">Settings</h2>

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
          checked={settings.bankHolidaysDeducted}
          onChange={(e) => update({ bankHolidaysDeducted: e.target.checked })}
        />
        <span>Bank holidays come out of my allowance</span>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.showBridgeSuggestions}
          onChange={(e) => update({ showBridgeSuggestions: e.target.checked })}
        />
        <span>Suggest bridge days (short leave around bank holidays)</span>
      </label>

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

      <CompanyDaysSection companyDays={companyDays} dispatch={dispatch} />
    </section>
  )
}
