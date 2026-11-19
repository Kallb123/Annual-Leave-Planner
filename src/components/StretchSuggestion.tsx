import { formatBridgeDates } from '../domain/bridges'
import { daysBetween, type IsoDate } from '../domain/dates'
import { formatStretchLength, stretchMidpoint, type LongestStretch } from '../domain/stretches'

interface Props {
  stretch: LongestStretch | null
  /** Whose leave it describes. */
  name: string
  today: IsoDate
  /** Phones: one card. */
  compact?: boolean
}

/** The longest stretch of the leave year without a week off. Renders nothing when there is none. */
export function StretchSuggestion({ stretch, name, today, compact = false }: Props) {
  if (!stretch) return null

  const dates = formatBridgeDates(stretch.start, stretch.end)
  const length = formatStretchLength(stretch.days)
  // Aim for the middle of what's left of the stretch, so the tip never points into the past.
  const from = stretch.start < today ? today : stretch.start
  const mid = stretchMidpoint({ start: from, days: daysBetween(from, stretch.end) + 1 })
  const tip = stretch.end < today ? 'Already behind you.' : `A week off around ${formatBridgeDates(mid, mid)} would break it up.`
  const title = stretch.hasWeekOff ? `${length} without a week off` : `No week off yet: ${length}`

  if (compact) {
    return (
      <section className="rail-tile stretch-tile stretch-tile--card" aria-label="Longest stretch without a week off">
        <span className="rail-tile-text">
          <span className="rail-tile-meta">Longest stretch · {dates}</span>
          <span className="rail-tile-title">{title}</span>
          <span className="rail-tile-meta">{tip}</span>
        </span>
      </section>
    )
  }

  return (
    <section className="rail-section" aria-labelledby="stretch-heading">
      <div className="rail-section-intro">
        <h2 id="stretch-heading" className="section-label">
          Longest stretch for {name}
        </h2>
        <p className="hint">The longest run of the leave year without at least seven days off in a row.</p>
      </div>
      <div className="rail-tile stretch-tile">
        <span className="rail-tile-text">
          <span className="rail-tile-title">{title}</span>
          <span className="rail-tile-meta">{dates}</span>
          <span className="rail-tile-meta">{tip}</span>
        </span>
      </div>
    </section>
  )
}
