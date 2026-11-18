import { MONTH_NAMES, parseIso } from '../domain/dates'
import type { Company, CompanyDay } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'

interface Props {
  /** The active person's company, if any. */
  company: Company | undefined
  dispatch: (action: PlannerAction) => void
}

/** "24 December" for repeating days, "24 December 2026" otherwise. */
function describeDate(day: CompanyDay): string {
  const { year, month, day: d } = parseIso(day.date)
  const base = `${d} ${MONTH_NAMES[month - 1]}`
  return day.repeatsAnnually ? base : `${base} ${year}`
}

export function CompanyDaysSection({ company, dispatch }: Props) {
  const companyDays = company?.days ?? []
  return (
    <fieldset className="field company-days">
      <legend>Company days</legend>

      {companyDays.length > 0 && company && (
        <ul className="company-day-list">
          {companyDays.map((day) => (
            <li key={day.id}>
              <span className="company-day-text">
                <strong>{day.name}</strong>
                <span className="company-day-meta">
                  {describeDate(day)}
                  {day.repeatsAnnually && ' · repeats every year'}
                  {day.deducted && ' · comes out of allowance'}
                </span>
              </span>
              <button
                type="button"
                className="link"
                aria-label={`Remove ${day.name}`}
                onClick={() => dispatch({ type: 'removeCompanyDay', companyId: company.id, id: day.id })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
