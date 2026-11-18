import type { DayCell, MonthView, YearView } from '../domain/calendar'
import { WEEKDAY_INITIALS_MON_FIRST } from '../domain/dates'
import { legendItems } from '../theme'

interface Props {
  view: YearView
  onToggleDay: (date: string) => void
}

export function YearCalendar({ view, onToggleDay }: Props) {
  return (
    <div className="year">
      {view.months.map((m) => (
        <Month key={`${m.year}-${m.month}`} month={m} onToggleDay={onToggleDay} />
      ))}
    </div>
  )
}

function Month({
  month,
  onToggleDay,
}: {
  month: MonthView
  onToggleDay: (date: string) => void
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
                <Day key={cell.date} cell={cell} onToggle={onToggleDay} />
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

function Day({ cell, onToggle }: { cell: DayCell; onToggle: (date: string) => void }) {
  const bookable = cell.inRange && cell.kind === 'working'
  const classes = [
    'day',
    `day--${cell.kind}`,
    cell.leave && `day--leave-${cell.leave}`,
    !cell.inRange && 'day--out-of-range',
    cell.isToday && 'day--today',
  ]
    .filter(Boolean)
    .join(' ')

  const description = [
    cell.holidayName,
    cell.leave === 'full' && 'Annual leave',
    cell.leave === 'half' && 'Half day leave',
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
      onClick={() => onToggle(cell.date)}
    >
      {cell.day}
    </button>
  )
}

export function Legend() {
  return (
    <ul className="legend">
      {legendItems.map((item) => (
        <li key={item.key}>
          <span className="swatch" style={{ background: `var(--c-${item.key})` }} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
