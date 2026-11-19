import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import type { IcsParseResult } from '../domain/ics'
import { CALENDAR_NAME_MAX, type DayStyle } from '../domain/types'
import { CALENDAR_COLOURS, CALENDAR_COLOUR_NAMES } from '../theme'
import { describeEventDates, plural } from './calendarFormat'
import { MONTH_NAMES, parseIso } from '../domain/dates'
import { ColourField, StyleField } from './StyleControls'
import './CalendarImportDialog.css'

/** What App holds while the import dialog is open: either a parsed file or a reason it couldn't be read. */
export type CalendarImport =
  | { fileName: string; result: IcsParseResult; error?: undefined; source?: CalendarImportSource }
  | { fileName: string; error: string; result?: undefined; source?: undefined }

/** Where bundled dates (rather than a file) came from; shown in place of the file name. */
export interface CalendarImportSource {
  /** e.g. "Sheffield City Council". */
  label: string
  url: string
  /** When the dates were last checked against `url`. */
  checked: string
}

export interface CalendarImportChoice {
  name: string
  colour: string
  style: DayStyle
  events: { start: string; end: string; name: string }[]
}

interface Props {
  /** Null while closed. */
  data: CalendarImport | null
  /** Colour suggested for the new calendar. */
  defaultColour: string
  onImport: (choice: CalendarImportChoice) => void
  onClose: () => void
}

export function CalendarImportDialog({ data, defaultColour, onImport, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const titleId = useId()
  const open = data !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      dialog.querySelector<HTMLElement>('input[type="text"], .btn')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
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

  return (
    <dialog ref={dialogRef} className="export-dialog import-dialog" aria-labelledby={titleId} onClick={onBackdropClick}>
      {/* Mounted only while open, so the form starts fresh for each file. */}
      {data && (
        <ImportForm key={data.fileName} titleId={titleId} data={data} defaultColour={defaultColour} onImport={onImport} onClose={onClose} />
      )}
    </dialog>
  )
}

function ImportForm({ titleId, data, defaultColour, onImport, onClose }: Omit<Props, 'data'> & { titleId: string; data: CalendarImport }) {
  const { fileName, result, error, source } = data
  const events = useMemo(() => result?.events ?? [], [result])
  const [name, setName] = useState(() =>
    (result?.calendarName?.trim() || fileName.replace(/\.ics$/i, '')).slice(0, CALENDAR_NAME_MAX),
  )
  const [colour, setColour] = useState(defaultColour)
  const [style, setStyle] = useState<DayStyle>('outline')
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())

  const selected = events.filter((e) => !unchecked.has(e.key))
  const canImport = selected.length > 0 && name.trim() !== ''

  const toggle = (key: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canImport) return
    onImport({ name: name.trim(), colour, style, events: selected.map((ev) => ({ start: ev.start, end: ev.end, name: ev.name })) })
  }

  if (error !== undefined || !result) {
    return (
      <div className="export-sheet">
        <h1 id={titleId} className="export-title">
          Import calendar
        </h1>
        <p className="import-file">{fileName}</p>
        <p className="warning" role="alert">
          <span>{error}</span>
        </p>
        <div className="export-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const notes: string[] = []
  if (source && events.length === 0) notes.push('There are no upcoming dates for this area yet.')
  if (result.skipped > 0) notes.push(`${plural(result.skipped, 'event')} couldn’t be read and ${result.skipped === 1 ? 'was' : 'were'} left out.`)
  if (result.unsupportedRepeats > 0)
    notes.push(`${plural(result.unsupportedRepeats, 'repeating event')} use${result.unsupportedRepeats === 1 ? 's' : ''} a repeat pattern we don’t support, so only the first date of ${result.unsupportedRepeats === 1 ? 'it is' : 'each are'} included.`)
  if (result.truncated) notes.push('This file has more events than can be imported, so some at the end are missing.')

  return (
    <form className="export-sheet import-sheet" onSubmit={onSubmit} noValidate>
      <div>
        <h1 id={titleId} className="export-title">
          {source ? 'Add school holidays' : 'Import calendar'}
        </h1>
        {source ? (
          <p className="import-file">
            Dates from{' '}
            <a className="import-source" href={source.url} target="_blank" rel="noreferrer">
              {source.label}
            </a>
            , checked {formatChecked(source.checked)}.
          </p>
        ) : (
          <p className="import-file">{fileName}</p>
        )}
      </div>

      <div className="import-fields">
        <label className="field">
          <span className="field-label">Name</span>
          <input type="text" value={name} maxLength={CALENDAR_NAME_MAX} aria-invalid={name.trim() === '' || undefined} onChange={(e) => setName(e.target.value)} />
        </label>
        <ColourField colours={CALENDAR_COLOURS} names={CALENDAR_COLOUR_NAMES} value={colour} onChange={setColour} />
        <StyleField legend="Style" colour={colour} value={style} hint="Outline suits dates you plan around, like school holidays." onChange={setStyle} />
      </div>

      {notes.map((n) => (
        <p key={n} className="notice" role="status">
          {n}
        </p>
      ))}

      {events.length === 0 ? (
        source ? null : <p className="hint import-empty">No events with dates were found in this file.</p>
      ) : (
        <div className="import-events">
          <div className="import-events-head">
            <span className="import-count" role="status">
              {selected.length} of {events.length} selected
            </span>
            <span className="import-events-actions">
              <button type="button" className="btn btn-link" onClick={() => setUnchecked(new Set())} disabled={unchecked.size === 0}>
                Select all
              </button>
              <button type="button" className="btn btn-link" onClick={() => setUnchecked(new Set(events.map((e) => e.key)))} disabled={selected.length === 0}>
                Select none
              </button>
            </span>
          </div>
          <ul className="import-list">
            {events.map((ev) => (
              <li key={ev.key}>
                <label className="import-event">
                  <input type="checkbox" checked={!unchecked.has(ev.key)} onChange={() => toggle(ev.key)} />
                  <span className="import-event-text">
                    <span className="import-event-name">{ev.name || 'Event'}</span>
                    <span className="hint">{describeEventDates(ev.start, ev.end)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="export-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canImport}>
          Import {plural(selected.length, 'event')}
        </button>
      </div>
    </form>
  )
}

/** "19 November 2026". */
function formatChecked(date: string): string {
  const { day, month, year } = parseIso(date)
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`
}
