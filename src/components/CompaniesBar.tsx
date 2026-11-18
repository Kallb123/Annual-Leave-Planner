import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { countCompanyDays } from '../domain/companyDays'
import { COMPANY_NAME_MAX, type Company, type DateRange } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import { newId } from './newId'

interface Props {
  companies: Company[]
  editingCompanyId: string | null
  /** The leave year being shown, for the per-company day counts. */
  range: DateRange
  dispatch: (action: PlannerAction) => void
}

/**
 * Chips for choosing a company whose days the calendar edits, plus an inline
 * form to add one. Same pattern as PeopleBar.
 */
export function CompaniesBar({ companies, editingCompanyId, range, dispatch }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const wasAdding = useRef(false)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
    else if (wasAdding.current) addButtonRef.current?.focus()
    wasAdding.current = adding
  }, [adding])

  const counts = useMemo(
    () => new Map(companies.map((c) => [c.id, countCompanyDays(c.days, range.start, range.end)])),
    [companies, range.start, range.end],
  )
  const editing = companies.find((c) => c.id === editingCompanyId)

  function close() {
    setAdding(false)
    setName('')
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    dispatch({ type: 'addCompany', id: newId('c'), name: trimmed })
    close()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <div className="companies">
      <div className="people-bar companies-bar" role="group" aria-labelledby="companies-bar-label">
        <span id="companies-bar-label" className="people-bar-label">
          Company days for
        </span>
        <ul className="people-list">
          {companies.map((company) => {
            const count = counts.get(company.id) ?? 0
            return (
              <li key={company.id}>
                <button
                  type="button"
                  className="person-chip company-chip"
                  aria-pressed={company.id === editingCompanyId}
                  onClick={() =>
                    dispatch(company.id === editingCompanyId ? { type: 'stopEditingCompany' } : { type: 'selectCompany', id: company.id })
                  }
                >
                  <span className="person-dot" aria-hidden="true" />
                  <span className="person-name">{company.name}</span>
                  <span className="person-left">{count === 1 ? '1 day' : `${count} days`}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {adding ? (
          <form className="person-form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              type="text"
              aria-label="New company’s name"
              placeholder="Company name"
              maxLength={COMPANY_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" className="secondary">
              Add
            </button>
            <button type="button" className="link" onClick={close}>
              Cancel
            </button>
          </form>
        ) : (
          <button ref={addButtonRef} type="button" className="secondary person-add" onClick={() => setAdding(true)}>
            + Add company
          </button>
        )}
      </div>
      {editing && (
        <div className="company-hint">
          <span>
            Click a day to add, change or delete a company day for <strong>{editing.name}</strong>. Drag to pick several days.
          </span>
          <button type="button" className="secondary" onClick={() => dispatch({ type: 'stopEditingCompany' })}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}
