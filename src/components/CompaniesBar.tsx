import { useMemo } from 'react'
import { countCompanyDays } from '../domain/companyDays'
import { COMPANY_NAME_MAX, type Company, type DateRange, type Person } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import { PlusIcon } from './Icons'
import { InlineAddForm } from './InlineAddForm'
import { newId } from './newId'
import { CompanyMark } from './StyleControls'

interface Props {
  companies: Company[]
  people: Person[]
  editingCompanyId: string | null
  /** Each company's own leave year (at the current year offset), for its day count. */
  ranges: ReadonlyMap<string, DateRange>
  dispatch: (action: PlannerAction) => void
}

/**
 * Side-rail list of companies. "Edit days" puts the calendar into company mode
 * for that company; "Done" (or pressing it again) leaves it.
 */
export function CompaniesBar({ companies, people, editingCompanyId, ranges, dispatch }: Props) {
  const counts = useMemo(
    () =>
      new Map(
        companies.map((c) => {
          const r = ranges.get(c.id)
          return [c.id, r ? countCompanyDays(c.days, r.start, r.end) : 0]
        }),
      ),
    [companies, ranges],
  )

  return (
    <section className="rail-section" aria-labelledby="companies-heading">
      <div className="rail-section-head">
        <h2 id="companies-heading" className="section-label">
          Company days
        </h2>
        <InlineAddForm
          openLabel="Add company"
          openIcon={<PlusIcon size={14} />}
          inputLabel="New company’s name"
          placeholder="Company name"
          maxLength={COMPANY_NAME_MAX}
          onAdd={(name) => dispatch({ type: 'addCompany', id: newId('c'), name })}
        />
      </div>
      {companies.length === 0 ? (
        <p className="hint">Add a company to mark office closures and extra days off.</p>
      ) : (
        <ul className="rail-tiles">
          {companies.map((company) => {
            const count = counts.get(company.id) ?? 0
            const members = people.filter((p) => p.companyId === company.id).map((p) => p.name)
            const editing = company.id === editingCompanyId
            return (
              <li key={company.id} className="rail-tile">
                <CompanyMark company={company} />
                <span className="rail-tile-text">
                  <span className="rail-tile-title">{company.name}</span>
                  <span className="rail-tile-meta">
                    {count === 1 ? '1 day' : `${count} days`} this year
                    {members.length > 0 ? ` · ${members.join(', ')}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className={`btn btn-sm ${editing ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={editing}
                  aria-label={editing ? `Done editing ${company.name} days` : `Edit ${company.name} days`}
                  onClick={() => dispatch(editing ? { type: 'stopEditingCompany' } : { type: 'selectCompany', id: company.id })}
                >
                  {editing ? 'Done' : 'Edit days'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * Phones: what tapping a day does. "Book leave", or edit the days of one
 * company (the one being edited, else the active person's, else the first).
 */
export function ModeToggle({
  company,
  editing,
  dispatch,
}: {
  company: Company
  editing: boolean
  dispatch: (action: PlannerAction) => void
}) {
  return (
    <div className="segmented mode-toggle" role="group" aria-label="What tapping a day does">
      <button type="button" aria-pressed={!editing} onClick={() => editing && dispatch({ type: 'stopEditingCompany' })}>
        Book leave
      </button>
      <button type="button" aria-pressed={editing} onClick={() => !editing && dispatch({ type: 'selectCompany', id: company.id })}>
        <span className="mode-toggle-name">{company.name}</span>&nbsp;days
      </button>
    </div>
  )
}
