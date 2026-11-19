import { useEffect, useId, useRef, type MouseEvent } from 'react'
import { schoolHolidayRegions, type SchoolHolidayArea } from '../domain/schoolHolidays'
import './CalendarImportDialog.css'

interface Props {
  open: boolean
  /** Called with the chosen area; the parent then opens the import preview. */
  onPick: (area: SchoolHolidayArea) => void
  onClose: () => void
}

const REGIONS = schoolHolidayRegions()

/** Lists the council areas with bundled school holidays, grouped by region. */
export function SchoolHolidaysDialog({ open, onPick, onClose }: Props) {
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
      dialog.querySelector<HTMLElement>('.school-area')?.focus()
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
      // Picking an area opens the import preview, which takes focus itself.
      if (returnFocus.current?.isConnected && !document.querySelector('dialog[open]')) returnFocus.current.focus()
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
      <div className="export-sheet import-sheet">
        <div>
          <h1 id={titleId} className="export-title">
            School holidays
          </h1>
          <p className="import-file">Choose your council to add its school holidays as a calendar. You can untick any you don’t want next.</p>
        </div>
        <div className="school-areas">
          {REGIONS.map(({ region, areas }) => (
            <section key={region} aria-label={region}>
              <h2 className="section-label">{region}</h2>
              <ul className="school-area-list">
                {areas.map((area) => (
                  <li key={area.id}>
                    <button type="button" className="school-area" onClick={() => onPick(area)}>
                      <span className="import-event-name">{area.name}</span>
                      <span className="hint">{area.authority}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="hint">
          These are the council’s dates for community and voluntary-controlled schools. Academies, free schools and church schools can set their own, and
          training (INSET) days vary by school, so check with your school.
        </p>
        <div className="export-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  )
}
