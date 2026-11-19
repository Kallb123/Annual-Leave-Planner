import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MONTH_NAMES, daysInMonth, parseIso } from '../domain/dates'
import { COMPANY_NAME_MAX, type Company, type CompanyDay, type Person } from '../domain/types'
import { companyOf, type PlannerAction } from '../state/plannerState'
import { COMPANY_COLOURS, COMPANY_COLOUR_NAMES } from '../theme'
import { newId } from './newId'
import { ColourField, StyleField, CompanyMark } from './StyleControls'

interface Props {
  companies: Company[]
  /** Everyone in the plan, to list each company's members. */
  people: Person[]
  dispatch: (action: PlannerAction) => void
}

/** "24 December" for repeating days, "24 December 2026" otherwise. */
function describeDate(day: CompanyDay): string {
  const { year, month, day: d } = parseIso(day.date)
  const base = `${d} ${MONTH_NAMES[month - 1]}`
  return day.repeatsAnnually ? base : `${base} ${year}`
}

function describeRepeat(day: CompanyDay): string {
  const when = day.repeatsAnnually ? 'Every year' : 'One-off'
  return day.deducted ? `${when} · Comes out of the allowance` : when
}

export function CompaniesSection({ companies, people, dispatch }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const wasAdding = useRef(false)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
    else if (wasAdding.current) addRef.current?.focus()
    wasAdding.current = adding
  }, [adding])

  const close = () => {
    setAdding(false)
    setName('')
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    dispatch({ type: 'addCompany', id: newId('c'), name: trimmed })
    close()
  }

  return (
    <div className="company-section">
      <div className="company-section-head">
        <h3 id="companies-heading" className="section-label">
          Companies
        </h3>
        {!adding && (
          <button ref={addRef} type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M7 2.5v9M2.5 7h9" />
            </svg>
            Add company
          </button>
        )}
      </div>
      {adding && (
        <form className="drawer-inline-form" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text"
            aria-label="Company name"
            placeholder="Company name"
            maxLength={COMPANY_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
          />
          <button type="submit" className="btn btn-secondary">
            Add
          </button>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
        </form>
      )}
      {companies.length === 0 ? (
        <p className="hint">No companies yet.</p>
      ) : (
        <div className="company-list">
          {companies.map((company) => (
            <CompanyBlock
              key={company.id}
              company={company}
              members={people.filter((p) => companyOf(companies, p)?.id === company.id)}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
      <p className="hint">To add company days, choose “Edit days” next to the company on the calendar.</p>
    </div>
  )
}

function CompanyBlock({
  company,
  members,
  dispatch,
}: {
  company: Company
  members: Person[]
  dispatch: (action: PlannerAction) => void
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const commitName = () => {
    const trimmed = (nameDraft ?? '').trim()
    // An empty name reverts to the current one.
    if (trimmed && trimmed !== company.name) dispatch({ type: 'renameCompany', id: company.id, name: trimmed })
    setNameDraft(null)
  }

  // Leap years don't matter for picking a reset day; 2001 is a non-leap year, so cap Feb at 28.
  const maxStartDay = daysInMonth(2001, company.leaveYearStartMonth)
  const setStart = (month: number, day: number) =>
    dispatch({
      type: 'setCompanyLeaveYearStart',
      id: company.id,
      month,
      day: Math.min(day, daysInMonth(2001, month)),
    })

  return (
    <div className="company-block">
      <div className="company-block-head">
        <CompanyMark company={company} />
        <div className="company-block-main">
          <input
            type="text"
            className="company-name-input"
            aria-label={`Name of ${company.name}`}
            maxLength={COMPANY_NAME_MAX}
            value={nameDraft ?? company.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setNameDraft(null)
                e.currentTarget.blur()
              }
            }}
          />
          <span className="hint">{members.length > 0 ? members.map((p) => p.name).join(', ') : 'No one yet'}</span>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
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
      <div className="company-style-fields">
        <fieldset className="field">
          <legend>Leave year starts on</legend>
          <div className="drawer-year-start">
            <select
              aria-label={`Start day for ${company.name}`}
              value={Math.min(company.leaveYearStartDay, maxStartDay)}
              onChange={(e) => setStart(company.leaveYearStartMonth, Number(e.target.value))}
            >
              {Array.from({ length: maxStartDay }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              aria-label={`Start month for ${company.name}`}
              value={company.leaveYearStartMonth}
              onChange={(e) => setStart(Number(e.target.value), company.leaveYearStartDay)}
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        <ColourField
          colours={COMPANY_COLOURS}
          names={COMPANY_COLOUR_NAMES}
          value={company.colour}
          onChange={(colour) => dispatch({ type: 'setCompanyColour', id: company.id, colour })}
        />
        <StyleField
          legend="Style"
          colour={company.colour}
          value={company.style}
          hint="Outline suits dates that need cover, such as school holidays."
          onChange={(style) => dispatch({ type: 'setCompanyStyle', id: company.id, style })}
        />
      </div>
      {company.days.length === 0 ? (
        <p className="hint company-empty">No company days.</p>
      ) : (
        <ul className="company-day-list">
          {company.days.map((day) => (
            <li key={day.id}>
              <span className="company-day-text">
                <span className="company-day-title">
                  {describeDate(day)} · {day.name}
                </span>
                <span className="hint">{describeRepeat(day)}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                aria-label={`Remove ${day.name}`}
                onClick={() => dispatch({ type: 'removeCompanyDay', companyId: company.id, id: day.id })}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
