import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { MONTH_NAMES } from '../domain/dates'
import { formatMonthSpan, monthCount, monthSpanError, sameMonthSpan, type MonthSpan } from '../domain/exportRange'
import { DownloadIcon } from './Icons'
import './ExportDialog.css'

interface Props {
  open: boolean
  /** The viewed leave year's months; the form resets to this each time the dialog opens. */
  defaultSpan: MonthSpan
  /** e.g. "2026/27"; used in a "Reset to leave year 2026/27" link-button shown when the span differs from defaultSpan. */
  leaveYearLabel: string
  exporting: boolean
  onExport: (span: MonthSpan) => void
  onClose: () => void
}

/** Raw form state: years stay as text so typing is never interrupted. */
interface Draft {
  startMonth: number
  startYear: string
  endMonth: number
  endYear: string
}

const toDraft = (span: MonthSpan): Draft => ({
  startMonth: span.start.month,
  startYear: String(span.start.year),
  endMonth: span.end.month,
  endYear: String(span.end.year),
})

/** Empty or non-numeric years become NaN, which monthSpanError rejects. */
const parseYear = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN)

const toSpan = (d: Draft): MonthSpan => ({
  start: { year: parseYear(d.startYear), month: d.startMonth },
  end: { year: parseYear(d.endYear), month: d.endMonth },
})

export function ExportDialog({ open, defaultSpan, leaveYearLabel, exporting, onExport, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      dialog.querySelector<HTMLElement>('select')?.focus()
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

  return (
    <dialog ref={dialogRef} className="export-dialog" aria-labelledby={titleId} onClick={onBackdropClick}>
      {/* Mounted only while open, so the form starts from defaultSpan every time. */}
      {open && (
        <ExportForm
          titleId={titleId}
          defaultSpan={defaultSpan}
          leaveYearLabel={leaveYearLabel}
          exporting={exporting}
          onExport={onExport}
          onClose={onClose}
        />
      )}
    </dialog>
  )
}

type FormProps = Omit<Props, 'open'> & { titleId: string }

function ExportForm({ titleId, defaultSpan, leaveYearLabel, exporting, onExport, onClose }: FormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(defaultSpan))
  const span = toSpan(draft)
  const error = monthSpanError(span)
  const changed = !sameMonthSpan(span, defaultSpan)
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!error && !exporting) onExport(span)
  }

  const count = error ? 0 : monthCount(span)

  return (
    <form className="export-sheet" onSubmit={onSubmit} noValidate>
      <h1 id={titleId} className="export-title">
        Download PNG
      </h1>
      <p className="hint">Choose the months to include in the image.</p>

      <div className="export-rows">
        <SpanRow
          label="From"
          month={draft.startMonth}
          year={draft.startYear}
          invalid={error !== null}
          onMonth={(startMonth) => update({ startMonth })}
          onYear={(startYear) => update({ startYear })}
        />
        <SpanRow
          label="To"
          month={draft.endMonth}
          year={draft.endYear}
          invalid={error !== null}
          onMonth={(endMonth) => update({ endMonth })}
          onYear={(endYear) => update({ endYear })}
        />
      </div>

      <div className="export-summary">
        {error ? (
          <p className="export-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="export-count" role="status">
            {formatMonthSpan(span)} · {count} {count === 1 ? 'month' : 'months'}
          </p>
        )}
        {changed && (
          <button type="button" className="btn btn-link" onClick={() => setDraft(toDraft(defaultSpan))}>
            Reset to leave year {leaveYearLabel}
          </button>
        )}
      </div>

      <div className="export-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={error !== null || exporting}>
          <DownloadIcon />
          {exporting ? 'Exporting…' : 'Download'}
        </button>
      </div>
    </form>
  )
}

interface SpanRowProps {
  label: string
  month: number
  year: string
  invalid: boolean
  onMonth: (month: number) => void
  onYear: (year: string) => void
}

function SpanRow({ label, month, year, invalid, onMonth, onYear }: SpanRowProps) {
  return (
    <div className="export-row" role="group" aria-label={label}>
      <span className="export-row-label" aria-hidden="true">
        {label}
      </span>
      <select aria-label={`${label} month`} value={month} onChange={(e) => onMonth(Number(e.target.value))}>
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${label} year`}
        aria-invalid={invalid || undefined}
        min={1000}
        max={9999}
        step={1}
        value={year}
        onChange={(e) => onYear(e.target.value)}
      />
    </div>
  )
}
