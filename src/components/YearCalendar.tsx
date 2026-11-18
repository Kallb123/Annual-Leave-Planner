import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { WEEKDAY_INITIALS_MON_FIRST, dayOfWeek, eachDay } from '../domain/dates'
import type { Company, CompanyDay, LeavePortion } from '../domain/types'
import { nextPortion } from '../state/plannerState'
import type { DayCell, MonthView, PersonLeave, YearView } from '../domain/calendar'
import { bridgeSummary, type Bridge } from '../domain/bridges'
import { halfDayTint, legendItems, textOn } from '../theme'
import { CompanyDayPopover, type CompanyDayChoice } from './CompanyDayPopover'
import './YearCalendar.css'

interface Props {
  view: YearView
  /** The active person's colour, used for hover and drag-selection outlines. */
  activeColour: string
  /** Suggested bridge days (screen only; the PNG never draws these). */
  bridgeByDate?: ReadonlyMap<string, Bridge>
  onToggleDay: (date: string) => void
  onSetRange: (start: string, end: string, portion: LeavePortion | undefined) => void
  /** Set while editing a company's days: clicks and drags open the company-day popover instead of booking leave. */
  company?: Company | null
  /** The editing company's days by date (repeating days included). */
  companyDayAt?: (date: string) => CompanyDay | undefined
  onAssignCompanyDays?: (companyId: string, dates: string[], choice: CompanyDayChoice) => void
  onRemoveCompanyDays?: (companyId: string, dates: string[]) => void
}

const dateAt = (x: number, y: number): string | null =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null

const dayButton = (date: string) => document.querySelector<HTMLElement>(`button[data-date="${date}"]`)

export function YearCalendar({
  view,
  activeColour,
  bridgeByDate,
  onToggleDay,
  onSetRange,
  company = null,
  companyDayAt,
  onAssignCompanyDays,
  onRemoveCompanyDays,
}: Props) {
  const companyMode = company !== null
  const [openPopover, setPopover] = useState<{ dates: string[]; anchorDate: string; companyId: string } | null>(null)
  // Leaving company mode (or switching company) closes the popover.
  const popover = openPopover && openPopover.companyId === company?.id ? openPopover : null
  const popoverAnchor = popover ? dayButton(popover.anchorDate) : null

  const cells = useMemo(() => {
    const map = new Map<string, DayCell>()
    for (const m of view.months) for (const w of m.weeks) for (const c of w) if (c) map.set(c.date, c)
    return map
  }, [view])
  const isBookable = useCallback(
    (d: string) => {
      const c = cells.get(d)
      if (!c || !c.inRange) return false
      return companyMode || c.kind === 'working'
    },
    [cells, companyMode],
  )
  /** What a drag or shift-click covers: leave skips non-working days; company days also skip weekends and bank holidays. */
  const datesBetween = useCallback(
    (a: string, b: string) => {
      const [from, to] = a <= b ? [a, b] : [b, a]
      return eachDay(from, to).filter((d) => {
        if (!isBookable(d)) return false
        if (!companyMode) return true
        const dow = dayOfWeek(d)
        return dow !== 0 && dow !== 6 && !cells.get(d)?.holidayName
      })
    },
    [cells, isBookable, companyMode],
  )

  // Latest callback for the window-level drag listeners.
  const onSetRangeRef = useRef(onSetRange)
  const companyRangeRef = useRef((_dates: string[], _anchorDate: string) => {})
  useEffect(() => {
    onSetRangeRef.current = onSetRange
    companyRangeRef.current = (dates, anchorDate) => {
      if (dates.length > 0 && company) setPopover({ dates, anchorDate, companyId: company.id })
    }
  })

  const anchor = useRef<string | null>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<{ start: string; end: string } | null>(null)
  const dragRef = useRef<{ start: string; end: string } | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const selecting = useMemo(() => {
    if (!drag) return null
    return new Set(datesBetween(drag.start, drag.end))
  }, [drag, datesBetween])

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.shiftKey || !e.isPrimary) return
    const start = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date
    if (!start || !isBookable(start)) return
    // Target for the whole drag: what a click on the first day would do.
    const portion = companyMode ? undefined : nextPortion(cells.get(start)?.leave ?? undefined)
    dragRef.current = { start, end: start }

    const move = (ev: globalThis.PointerEvent) => {
      // Touch pointers stay captured to the original element, so hit-test by position.
      const d = dateAt(ev.clientX, ev.clientY)
      const cur = dragRef.current
      if (!d || !cur || d === cur.end) return
      dragRef.current = { start: cur.start, end: d }
      // Only show a selection once the pointer has left the first day.
      setDrag(d === cur.start ? null : dragRef.current)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      cleanup.current = null
      dragRef.current = null
      setDrag(null)
    }
    const up = () => {
      const final = dragRef.current
      stop()
      if (!final || final.start === final.end) return // a plain click; onClick handles it
      if (companyMode) companyRangeRef.current(datesBetween(final.start, final.end), final.end)
      else onSetRangeRef.current(final.start, final.end, portion)
      anchor.current = final.start
      // Swallow the click the browser may still fire on the same element.
      suppressClick.current = true
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
    cleanup.current = stop
  }

  /** Close the popover and put focus back on the day it came from. */
  function closePopover() {
    const date = popover?.anchorDate
    setPopover(null)
    if (date) dayButton(date)?.focus()
  }

  function onDayClick(e: MouseEvent<HTMLDivElement>) {
    const date = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date
    if (!date || !isBookable(date) || suppressClick.current) return
    const from = anchor.current
    if (company) {
      const dates = e.shiftKey && from && from !== date && isBookable(from) ? datesBetween(from, date) : [date]
      setPopover(dates.length > 0 ? { dates, anchorDate: date, companyId: company.id } : null)
    } else if (e.shiftKey && from && from !== date && isBookable(from)) {
      // The anchor was just booked/cleared by its own click or drag, so the range
      // copies the anchor's current state (full, half or cleared).
      onSetRange(from, date, cells.get(from)?.leave ?? undefined)
    } else {
      onToggleDay(date)
    }
    anchor.current = date
  }

  return (
    <div
      className="year"
      style={{ '--person-colour': activeColour } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={onDayClick}
    >
      {view.months.map((m) => (
        <Month key={`${m.year}-${m.month}`} month={m} selecting={selecting} bridgeByDate={bridgeByDate} companyMode={companyMode} />
      ))}
      {company && popover && popoverAnchor && (
        <CompanyDayPopover
          // A new selection starts with fresh fields.
          key={popover.dates.join()}
          dates={popover.dates}
          companyName={company.name}
          existing={popover.dates.flatMap((d) => companyDayAt?.(d) ?? [])}
          anchor={popoverAnchor}
          onClose={closePopover}
          onAssign={(choice) => {
            onAssignCompanyDays?.(company.id, popover.dates, choice)
            closePopover()
          }}
          onDelete={() => {
            onRemoveCompanyDays?.(company.id, popover.dates)
            closePopover()
          }}
        />
      )}
    </div>
  )
}

function Month({
  month,
  selecting,
  bridgeByDate,
  companyMode,
}: {
  month: MonthView
  selecting: Set<string> | null
  bridgeByDate?: ReadonlyMap<string, Bridge>
  companyMode: boolean
}) {
  return (
    <section className="month" aria-label={month.label}>
      <h3>{month.label}</h3>
      <div className="month-grid" role="grid">
        <div role="row" className="weekday-row">
          {WEEKDAY_INITIALS_MON_FIRST.map((d, i) => (
            <span key={i} role="columnheader" className="weekday">
              {d}
            </span>
          ))}
        </div>
        {month.weeks.map((week, w) => (
          <div role="row" key={w} className="week">
            {week.map((cell, d) =>
              cell ? (
                <Day key={cell.date} cell={cell} selecting={!!selecting?.has(cell.date)} bridge={bridgeByDate?.get(cell.date)} companyMode={companyMode} />
              ) : (
                <span key={d} role="gridcell" className="day day--empty" />
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Day({ cell, selecting, bridge, companyMode }: { cell: DayCell; selecting: boolean; bridge?: Bridge; companyMode: boolean }) {
  const bookable = cell.inRange && (companyMode || cell.kind === 'working')
  const classes = [
    'day',
    `day--${cell.kind}`,
    cell.people.length > 0 && 'day--has-leave',
    !cell.inRange && 'day--out-of-range',
    cell.isToday && 'day--today',
    cell.overLimit && 'day--over-limit',
    selecting && 'day--selecting',
    bridge && 'day--bridge',
  ]
    .filter(Boolean)
    .join(' ')

  const description = [
    cell.holidayName,
    cell.companyDayName,
    cell.people.length > 0 && cell.people.map((p) => `${p.name}: ${p.portion === 'half' ? 'half day' : 'annual leave'}`).join(', '),
    cell.overLimit && 'over entitlement',
    bridge && `Suggested: ${bridgeSummary(bridge).charAt(0).toLowerCase()}${bridgeSummary(bridge).slice(1)}`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      role="gridcell"
      className={classes}
      disabled={!bookable}
      title={description || undefined}
      aria-label={`${cell.date}${description ? ` – ${description}` : ''}`}
      aria-pressed={bookable ? (companyMode ? cell.companyDay !== null : cell.leave !== null) : undefined}
      data-date={cell.date}
      style={leaveStyle(cell.people)}
    >
      <span className={numClass(cell.people)}>{cell.day}</span>
    </button>
  )
}

const HALF_TINT = 0.2

const personFill = (p: PersonLeave) => (p.portion === 'half' ? halfDayTint(p.colour, HALF_TINT) : p.colour)

/** Background and ring for a day with leave: one colour, or equal diagonal bands for several people. */
function leaveStyle(people: PersonLeave[]): CSSProperties | undefined {
  if (people.length === 0) return undefined
  if (people.length === 1) {
    const [p] = people
    return {
      background: personFill(p),
      color: p.portion === 'full' ? textOn(p.colour) : undefined,
      ...(p.portion === 'half' ? { '--ring': `inset 0 0 0 1.5px ${p.colour}` } : null),
    } as CSSProperties
  }
  const step = 100 / people.length
  const bands = people.map((p, i) => `${personFill(p)} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
  return { background: `linear-gradient(135deg, ${bands.join(', ')})` }
}

function numClass(people: PersonLeave[]): string {
  if (people.length < 2) return 'day-num'
  return people.every((p) => p.portion === 'full') ? 'day-num day-num--on-colour' : 'day-num day-num--pill'
}

export function Legend({
  people,
  activeColour,
  showBridge = false,
}: {
  people: { id: string; name: string; colour: string }[]
  activeColour: string
  showBridge?: boolean
}) {
  return (
    <ul className="legend" aria-label="Key">
      {people.map((p) => (
        <li key={p.id}>
          <span className="swatch" style={{ background: p.colour }} />
          {p.name}
        </li>
      ))}
      <li>
        <span
          className="swatch"
          style={{ background: halfDayTint(activeColour, HALF_TINT), boxShadow: `inset 0 0 0 1.5px ${activeColour}` }}
        />
        Half day
      </li>
      {legendItems.map((item) => (
        <li key={item.key}>
          <span className="swatch" style={{ background: `var(--c-${item.key})` }} />
          {item.label}
        </li>
      ))}
      {/* On screen only: the PNG legend is built from `legendItems` directly and omits these two. */}
      {showBridge && (
        <li>
          <span className="swatch swatch--bridge" />
          Bridge idea
        </li>
      )}
      <li>
        <span className="swatch swatch--today" />
        Today
      </li>
    </ul>
  )
}
