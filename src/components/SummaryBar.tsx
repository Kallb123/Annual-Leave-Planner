import type { AllowanceSummary } from '../domain/allowance'
import { AlertIcon } from './Icons'
import { share } from './format'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface Props {
  summary: AllowanceSummary
  name: string
  colour: string
  /** Leave year label, e.g. "2026" or "2026/27". */
  label: string
  allowanceDays: number
  carryOverDays: number
  /** Over-entitlement message, or null when within entitlement. */
  warning?: string | null
  /** Phones: a smaller card with the figures on one line. */
  compact?: boolean
}

/** The active person's allowance: a big "days left" figure, a usage bar and the breakdown. */
export function SummaryBar({ summary, name, colour, label, allowanceDays, carryOverDays, warning = null, compact = false }: Props) {
  const negative = summary.remaining < 0
  const stats = [
    {
      label: 'Entitlement',
      value: summary.entitlement,
      note: carryOverDays ? `(${fmt(allowanceDays)} + ${fmt(carryOverDays)} carried)` : undefined,
    },
    { label: 'Booked', value: summary.booked, swatch: colour },
    ...(summary.bankHolidaysDeducted
      ? [{ label: 'Bank holidays', value: summary.bankHolidaysDeducted, swatch: 'var(--bar-bank-holiday)' }]
      : []),
    ...(summary.companyDaysDeducted
      ? [{ label: 'Company days', value: summary.companyDaysDeducted, swatch: 'var(--c-companyDayMark)' }]
      : []),
    { label: 'Remaining', value: summary.remaining, swatch: 'var(--c-track)', warn: negative },
  ]

  // One persistent live region wraps both the figures and the warning, so a
  // change is announced once and the warning's insertion is reliably spoken.
  return (
    <section className={`card summary-card${compact ? ' summary-card--compact' : ''}`} aria-label={`${name}’s allowance`} aria-live="polite">
      <div className="summary-main">
        {!compact && (
          <span className="summary-who">
            <span className="summary-dot" style={{ background: colour }} aria-hidden="true" />
            {name} · {label}
          </span>
        )}
        <span className="summary-left">
          <span className={`summary-number num${negative ? ' is-warn' : ''}`}>{fmt(summary.remaining)}</span>
          <span className="summary-unit">{Math.abs(summary.remaining) === 1 ? 'day left' : 'days left'}</span>
          {compact && <span className="summary-of">of {fmt(summary.entitlement)}</span>}
        </span>
      </div>
      <div className="summary-detail">
        <div className="usage-bar usage-bar--large" aria-hidden="true">
          <span style={{ width: share(summary.booked, summary.entitlement), background: colour }} />
          <span style={{ width: share(summary.bankHolidaysDeducted, summary.entitlement), background: 'var(--bar-bank-holiday)' }} />
          <span style={{ width: share(summary.companyDaysDeducted, summary.entitlement), background: 'var(--c-companyDayMark)' }} />
        </div>
        <dl className="summary-stats">
          {stats
            .filter((s) => !compact || s.label !== 'Entitlement')
            .map((s) => (
              <div key={s.label} className={`summary-stat${s.warn ? ' is-warn' : ''}`}>
                <dt>
                  {s.swatch && <span className="summary-swatch" style={{ background: s.swatch }} aria-hidden="true" />}
                  {s.label}
                </dt>
                <dd className="num">
                  {fmt(s.value)}
                  {s.note && !compact && <span className="summary-note"> {s.note}</span>}
                </dd>
              </div>
            ))}
        </dl>
      </div>
      {warning && (
        <p className="warning summary-warning">
          <AlertIcon />
          <span>
            <strong>Over entitlement.</strong> {warning}
          </span>
        </p>
      )}
    </section>
  )
}
