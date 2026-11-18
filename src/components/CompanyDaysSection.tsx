import { useState, type FormEvent } from 'react'
import { validateCompanyDayInput } from '../domain/companyDays'
import { MONTH_NAMES, parseIso } from '../domain/dates'
import { COMPANY_DAY_NAME_MAX, type CompanyDay } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import { newId } from './newId'

interface Props {
  companyDays: CompanyDay[]
  dispatch: (action: PlannerAction) => void
}

/** "24 December" for repeating days, "24 December 2026" otherwise. */
function describeDate(day: CompanyDay): string {
  const { year, month, day: d } = parseIso(day.date)
  const base = `${d} ${MONTH_NAMES[month - 1]}`
  return day.repeatsAnnually ? base : `${base} ${year}`
}

export function CompanyDaysSection({ companyDays, dispatch }: Props) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [deducted, setDeducted] = useState(false)
  const [repeatsAnnually, setRepeatsAnnually] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validateCompanyDayInput({ date, name })
    if (problem) {
      setError(problem)
      return
    }
    dispatch({
      type: 'addCompanyDay',
      day: { id: newId('cd'), date, name: name.trim(), deducted, repeatsAnnually },
    })
    setDate('')
    setName('')
    setDeducted(false)
    setRepeatsAnnually(false)
    setError(null)
  }

  return (
    <fieldset className="field company-days">
      <legend>Company days</legend>

      {companyDays.length > 0 && (
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
                onClick={() => dispatch({ type: 'removeCompanyDay', id: day.id })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="company-day-form" onSubmit={onSubmit} noValidate>
        <div className="field-row">
          <input
            type="date"
            aria-label="Company day date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={error !== null && !date}
          />
          <input
            type="text"
            aria-label="Company day name"
            placeholder="Name, e.g. Office closure"
            maxLength={COMPANY_DAY_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={deducted} onChange={(e) => setDeducted(e.target.checked)} />
          <span>Comes out of everyone’s allowance</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={repeatsAnnually}
            onChange={(e) => setRepeatsAnnually(e.target.checked)}
          />
          <span>Repeats every year</span>
        </label>
        <p className="field-error" role="alert">
          {error}
        </p>
        <button type="submit" className="secondary">
          Add company day
        </button>
      </form>
    </fieldset>
  )
}
