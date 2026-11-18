import { formatDays } from '../domain/allowance'
import { formatBridgeDates, type Bridge } from '../domain/bridges'

const MAX_SHOWN = 5

interface Props {
  bridges: Bridge[]
  /** Whose leave they'd be booked as. */
  name: string
  /** Book a whole run as full days. */
  onBook: (bridge: Bridge) => void
  /** Phones: only the best suggestion, as one card. */
  compact?: boolean
}

/** The best bridge suggestions with a one-click Book button. Renders nothing when there are none. */
export function BridgeSuggestions({ bridges, name, onBook, compact = false }: Props) {
  if (bridges.length === 0) return null

  if (compact) {
    const b = bridges[0]
    return (
      <section className="bridge-tile bridge-tile--card" aria-label="Bridge idea">
        <span className="rail-tile-text">
          <span className="rail-tile-meta">Bridge idea{bridges.length > 1 ? ` · best of ${Math.min(bridges.length, MAX_SHOWN)}` : ''}</span>
          <span className="rail-tile-title">
            Book {formatDays(b.leaveDays)}, get {b.totalDaysOff} off
          </span>
          <span className="rail-tile-meta">{formatBridgeDates(b.start, b.end)}</span>
        </span>
        <button type="button" className="btn btn-secondary" onClick={() => onBook(b)}>
          Book
        </button>
      </section>
    )
  }

  return (
    <section className="rail-section" aria-labelledby="bridges-heading">
      <div className="rail-section-intro">
        <h2 id="bridges-heading" className="section-label">
          Bridge ideas for {name}
        </h2>
        <p className="hint">Short gaps between bank holidays, company days and weekends.</p>
      </div>
      <ul className="rail-tiles">
        {bridges.slice(0, MAX_SHOWN).map((b) => (
          <li key={b.start} className="bridge-tile">
            <span className="rail-tile-text">
              <span className="rail-tile-title">
                Book {formatDays(b.leaveDays)}, get {b.totalDaysOff} off
              </span>
              <span className="rail-tile-meta">{formatBridgeDates(b.start, b.end)}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label={`Book ${formatBridgeDates(b.start, b.end)}`}
              onClick={() => onBook(b)}
            >
              Book
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
