import type { AllowanceSummary } from '../domain/allowance'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface Props {
  summary: AllowanceSummary
  /** Over-entitlement message, or null when within entitlement. */
  warning?: string | null
}

export function SummaryBar({ summary, warning = null }: Props) {
  const stats = [
    { label: 'Entitlement', value: summary.entitlement },
    { label: 'Booked', value: summary.booked },
    ...(summary.bankHolidaysDeducted
      ? [{ label: 'Bank holidays', value: summary.bankHolidaysDeducted }]
      : []),
    ...(summary.companyDaysDeducted
      ? [{ label: 'Company days', value: summary.companyDaysDeducted }]
      : []),
    { label: 'Remaining', value: summary.remaining, warn: summary.remaining < 0 },
  ]
  // One persistent live region wraps both the figures and the warning, so a
  // change is announced once and the warning's insertion is reliably spoken.
  return (
    <div aria-live="polite">
      <dl className="summary">
        {stats.map((s) => (
          <div key={s.label} className={`stat${s.warn ? ' stat--warn' : ''}`}>
            <dt>{s.label}</dt>
            <dd>{fmt(s.value)}</dd>
          </div>
        ))}
      </dl>
      {warning && (
        <p className="warning">
          <span aria-hidden="true">⚠</span>
          <span>
            <strong>Over entitlement.</strong> {warning}
          </span>
        </p>
      )}
    </div>
  )
}
