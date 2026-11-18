import type { AllowanceSummary } from '../domain/allowance'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function SummaryBar({ summary }: { summary: AllowanceSummary }) {
  const stats = [
    { label: 'Entitlement', value: summary.entitlement },
    { label: 'Booked', value: summary.booked },
    ...(summary.bankHolidaysDeducted
      ? [{ label: 'Bank holidays', value: summary.bankHolidaysDeducted }]
      : []),
    { label: 'Remaining', value: summary.remaining, warn: summary.remaining < 0 },
  ]
  return (
    <dl className="summary" aria-live="polite">
      {stats.map((s) => (
        <div key={s.label} className={`stat${s.warn ? ' stat--warn' : ''}`}>
          <dt>{s.label}</dt>
          <dd>{fmt(s.value)}</dd>
        </div>
      ))}
    </dl>
  )
}
