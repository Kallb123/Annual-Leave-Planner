import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { WEEKDAY_INITIALS_MON_FIRST, eachDay } from '../domain/dates'
import type { LeavePortion } from '../domain/types'
import { nextPortion } from '../state/plannerState'
import type { DayCell, MonthView, YearView } from '../domain/calendar'
import { bridgeSummary, type Bridge } from '../domain/bridges'
import { legendItems } from '../theme'

interface Props {
  view: YearView
  /** Suggested bridge days (screen only; the PNG never draws these). */
  bridgeByDate?: ReadonlyMap<string, Bridge>
  onToggleDay: (date: string) => void
  onSetRange: (start: string, end: string, portion: LeavePortion | undefined) => void
}

const dateAt = (x: number, y: number): string | null =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null

export function YearCalendar({ view, bridgeByDate, onToggleDay, onSetRange }: Props) {
  const cells = useMemo(() => {
    const map = new Map<string, DayCell>()
    for (const m of view.months) for (const w of m.weeks) for (const c of w) if (c) map.set(c.date, c)
    return map
  }, [view])
  const isBookable = useCallback(
    (d: string) => {
      const c = cells.get(d)
      return !!c && c.inRange && c.kind === 'working'
    },
    [cells],
  )

  // Latest callback for the window-level drag listeners.
  const onSetRangeRef = useRef(onSetRange)
  useEffect(() => {
    onSetRangeRef.current = onSetRange
  })

  const anchor = useRef<string | null>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<{ start: string; end: string } | null>(null)
  const dragRef = useRef<{ start: string; end: string } | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const selecting = useMemo(() => {
    if (!drag) return null
    const [a, b] = drag.start <= drag.end ? [drag.start, drag.end] : [drag.end, drag.start]
    return new Set(eachDay(a, b).filter(isBookable))
  }, [drag, isBookable])

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.shiftKey || !e.isPrimary) return
    const start = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date
    if (!start || !isBookable(start)) return
    // Target for the whole drag: what a click on the first day would do.
    const portion = nextPortion(cells.get(start)?.leave ?? undefined)
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
      onSetRangeRef.current(final.start, final.end, portion)
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

  function onDayClick(e: MouseEvent<HTMLDivElement>) {
    const date = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date
    if (!date || !isBookable(date) || suppressClick.current) return
    const from = anchor.current
    if (e.shiftKey && from && from !== date && isBookable(from)) {
      // The anchor was just booked/cleared by its own click or drag, so the range
      // copies the anchor's current state (full, half or cleared).
      onSetRange(from, date, cells.get(from)?.leave ?? undefined)
    } else {
      onToggleDay(date)
    }
    anchor.current = date
  }

  return (
    <div className="year" onPointerDown={onPointerDown} onClick={onDayClick}>
      {view.months.map((m) => (
        <Month key={`${m.year}-${m.month}`} month={m} selecting={selecting} bridgeByDate={bridgeByDate} />
      ))}
    </div>
  )
}

function Month({
  month,
  selecting,
  bridgeByDate,
}: {
  month: MonthView
  selecting: Set<string> | null
  bridgeByDate?: ReadonlyMap<string, Bridge>
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
                <Day key={cell.date} cell={cell} selecting={!!selecting?.has(cell.date)} bridge={bridgeByDate?.get(cell.date)} />
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

function Day({ cell, selecting, bridge }: { cell: DayCell; selecting: boolean; bridge?: Bridge }) {
  const bookable = cell.inRange && cell.kind === 'working'
  const classes = [
    'day',
    `day--${cell.kind}`,
    cell.leave && `day--leave-${cell.leave}`,
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
    cell.leave === 'full' && 'Annual leave',
    cell.leave === 'half' && 'Half day leave',
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
      aria-pressed={bookable ? cell.leave !== null : undefined}
      data-date={cell.date}
    >
      {cell.day}
    </button>
  )
}

export function Legend({ showBridge = false }: { showBridge?: boolean }) {
  return (
    <ul className="legend">
      {legendItems.map((item) => (
        <li key={item.key}>
          <span className="swatch" style={{ background: `var(--c-${item.key})` }} />
          {item.label}
        </li>
      ))}
      {/* On screen only: the PNG legend is built from `legendItems` directly and omits this. */}
      {showBridge && (
        <li>
          <span className="swatch swatch--bridge" />
          Suggested bridge
        </li>
      )}
    </ul>
  )
}
