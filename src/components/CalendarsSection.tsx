import { useRef, useState } from 'react'
import { CALENDAR_NAME_MAX, type ImportedCalendar } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import { CALENDAR_COLOURS, CALENDAR_COLOUR_NAMES } from '../theme'
import { describeEventDates, plural } from './calendarFormat'
import { PlusIcon } from './Icons'
import { ColourField, CompanyMark, StyleField } from './StyleControls'

interface Props {
  calendars: ImportedCalendar[]
  onImportFile: (file: File) => void
  dispatch: (action: PlannerAction) => void
}

export function CalendarsSection({ calendars, onImportFile, dispatch }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="company-section">
      <div className="company-section-head">
        <h3 id="calendars-section-heading" className="section-label">
          Imported calendars
        </h3>
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
        <div className="company-list">
          {calendars.map((calendar) => (
            <CalendarBlock key={calendar.id} calendar={calendar} dispatch={dispatch} />
          ))}
        </div>
      )}
      <p className="hint">Imported dates are for information only. They never change anyone’s allowance.</p>
    </div>
  )
}

function CalendarBlock({ calendar, dispatch }: { calendar: ImportedCalendar; dispatch: (action: PlannerAction) => void }) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const commitName = () => {
    const trimmed = (nameDraft ?? '').trim()
    if (trimmed && trimmed !== calendar.name) dispatch({ type: 'renameCalendar', id: calendar.id, name: trimmed })
    setNameDraft(null)
  }

  return (
    <div className="company-block">
      <div className="company-block-head">
        <CompanyMark company={calendar} />
        <div className="company-block-main">
          <input
            type="text"
            className="company-name-input"
            aria-label={`Name of ${calendar.name}`}
            maxLength={CALENDAR_NAME_MAX}
            value={nameDraft ?? calendar.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setNameDraft(null)
                e.currentTarget.blur()
              }
            }}
          />
          <span className="hint">{plural(calendar.events.length, 'event')}</span>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          aria-label={`Remove ${calendar.name}`}
          onClick={() => {
            if (confirm(`Remove ${calendar.name} and its ${plural(calendar.events.length, 'event')}?`)) {
              dispatch({ type: 'removeCalendar', id: calendar.id })
            }
          }}
        >
          Remove
        </button>
      </div>
      <div className="company-style-fields">
        <div className="switch-row">
          <span className="switch-row-text">
            <span id={`${calendar.id}-vis`} className="switch-row-label">
              Show on calendar
            </span>
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={calendar.visible}
            aria-labelledby={`${calendar.id}-vis`}
            onClick={() => dispatch({ type: 'setCalendarVisible', id: calendar.id, visible: !calendar.visible })}
          >
            <span className="switch-thumb" />
          </button>
        </div>
        <ColourField
          colours={CALENDAR_COLOURS}
          names={CALENDAR_COLOUR_NAMES}
          value={calendar.colour}
          onChange={(colour) => dispatch({ type: 'setCalendarColour', id: calendar.id, colour })}
        />
        <StyleField
          legend="Style"
          colour={calendar.colour}
          value={calendar.style}
          hint="Outline suits dates you plan around, like school holidays."
          onChange={(style) => dispatch({ type: 'setCalendarStyle', id: calendar.id, style })}
        />
      </div>
      <details className="calendar-events">
        <summary>{plural(calendar.events.length, 'event')}</summary>
        {calendar.events.length === 0 ? (
          <p className="hint company-empty">No events.</p>
        ) : (
          <ul className="company-day-list">
            {calendar.events.map((event) => (
              <li key={event.id}>
                <span className="company-day-text">
                  <span className="company-day-title">{event.name}</span>
                  <span className="hint">{describeEventDates(event.start, event.end)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost icon-btn"
                  aria-label={`Remove ${event.name}`}
                  onClick={() => dispatch({ type: 'removeCalendarEvent', calendarId: calendar.id, eventId: event.id })}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="m4 4 8 8M12 4l-8 8" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}
