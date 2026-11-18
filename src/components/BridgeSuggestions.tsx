import { bridgeSummary, formatBridgeDates, type Bridge } from '../domain/bridges'

const MAX_SHOWN = 5

interface Props {
  bridges: Bridge[]
  /** Book a whole run as full days. */
  onBook: (bridge: Bridge) => void
}

/** Compact list of the best bridge suggestions. Renders nothing when there are none. */
export function BridgeSuggestions({ bridges, onBook }: Props) {
  if (bridges.length === 0) return null
  return (
    <section className="bridges" aria-labelledby="bridges-heading">
      <h3 id="bridges-heading">Bridge suggestions</h3>
      <ul className="bridge-list">
        {bridges.slice(0, MAX_SHOWN).map((b) => (
          <li key={b.start}>
            <span>
              <strong>{bridgeSummary(b)}</strong>
              <span className="bridge-dates"> {formatBridgeDates(b.start, b.end)}</span>
            </span>
            <button type="button" className="secondary" onClick={() => onBook(b)}>
              Book
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
