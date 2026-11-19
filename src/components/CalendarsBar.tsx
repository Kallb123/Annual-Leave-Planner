import { useMemo, useRef } from 'react'
import { countCalendarDays } from '../domain/importedCalendars'
import type { DateRange, ImportedCalendar } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import { schoolHolidayAreas } from '../domain/schoolHolidays'
import { plural } from './calendarFormat'
import { EyeIcon, EyeOffIcon, PlusIcon } from './Icons'
import { CompanyMark } from './StyleControls'

const HAS_SCHOOL_HOLIDAYS = schoolHolidayAreas().length > 0

interface Props {
  calendars: ImportedCalendar[]
  /** The calendar's leave year being viewed, for each calendar's day count. */
  range: DateRange
  onImportFile: (file: File) => void
  /** Opens the school holidays picker. */
  onAddSchoolHolidays: () => void
  dispatch: (action: PlannerAction) => void
}

/** Side-rail list of imported calendars (e.g. school holidays), each with a show/hide toggle. */
export function CalendarsBar({ calendars, range, onImportFile, onAddSchoolHolidays, dispatch }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const counts = useMemo(
    () => new Map(calendars.map((c) => [c.id, countCalendarDays(c.events, range.start, range.end)])),
    [calendars, range],
  )

  return (
    <section className="rail-section" aria-labelledby="calendars-heading">
      <div className="rail-section-head">
        <h2 id="calendars-heading" className="section-label">
          Imported calendars
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
          <PlusIcon size={14} />
          Import .ics
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          hidden
          aria-label="Choose an .ics calendar file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onImportFile(file)
          }}
        />
      </div>
      {calendars.length === 0 ? (
        <p className="hint">Import an .ics file, such as school holidays, to show its dates on the calendar.</p>
      ) : (
        <ul className="rail-tiles">
          {calendars.map((calendar) => (
            <li key={calendar.id} className={`rail-tile${calendar.visible ? '' : ' rail-tile--dim'}`}>
              <CompanyMark company={calendar} />
              <span className="rail-tile-text">
                <span className="rail-tile-title">{calendar.name}</span>
                <span className="rail-tile-meta">{calendar.visible ? `${plural(counts.get(calendar.id) ?? 0, 'day')} this year` : 'Hidden'}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                aria-pressed={calendar.visible}
                aria-label={`Show ${calendar.name} on the calendar`}
                title={calendar.visible ? 'Hide from the calendar' : 'Show on the calendar'}
                onClick={() => dispatch({ type: 'setCalendarVisible', id: calendar.id, visible: !calendar.visible })}
              >
                {calendar.visible ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {HAS_SCHOOL_HOLIDAYS && (
        <button type="button" className="btn btn-link school-holidays-link" onClick={onAddSchoolHolidays}>
          Add school holidays for your area
        </button>
      )}
    </section>
  )
}
