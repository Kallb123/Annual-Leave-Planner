import { useState } from 'react'
import { MONTH_NAMES, parseIso } from '../domain/dates'
import { COMPANY_NAME_MAX, type Company, type CompanyDay } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'

interface Props {
  companies: Company[]
  dispatch: (action: PlannerAction) => void
}

/** "24 December" for repeating days, "24 December 2026" otherwise. */
function describeDate(day: CompanyDay): string {
  const { year, month, day: d } = parseIso(day.date)
  const base = `${d} ${MONTH_NAMES[month - 1]}`
  return day.repeatsAnnually ? base : `${base} ${year}`
}

export function CompaniesSection({ companies, dispatch }: Props) {
  return (
    <fieldset className="field company-days">
      <legend>Companies</legend>
      <p className="field-hint">Add company days by choosing a company above the calendar and clicking days.</p>
      {companies.length === 0 && <p className="field-hint">No companies yet.</p>}
      {companies.map((company) => (
        <CompanyRow key={company.id} company={company} dispatch={dispatch} />
      ))}
    </fieldset>
  )
}

function CompanyRow({ company, dispatch }: { company: Company; dispatch: (action: PlannerAction) => void }) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const commitName = () => {
    const trimmed = (nameDraft ?? '').trim()
    // An empty name reverts to the current one.
    if (trimmed && trimmed !== company.name) dispatch({ type: 'renameCompany', id: company.id, name: trimmed })
    setNameDraft(null)
  }

  return (
    <div className="company-block">
      <div className="company-block-head">
        <input
          type="text"
          aria-label={`Name of ${company.name}`}
          maxLength={COMPANY_NAME_MAX}
          value={nameDraft ?? company.name}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              setNameDraft(null)
              e.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          className="link remove-person"
          aria-label={`Remove ${company.name}`}
          onClick={() => {
            if (confirm(`Remove ${company.name} and all of its company days?`)) {
              dispatch({ type: 'removeCompany', id: company.id })
            }
          }}
        >
          Remove
        </button>
      </div>
      {company.days.length === 0 ? (
        <p className="field-hint">No company days.</p>
      ) : (
        <ul className="company-day-list">
          {company.days.map((day) => (
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
    </div>
  )
}
