import type { CSSProperties } from 'react'
import { formatDays } from '../domain/allowance'
import { PERSON_NAME_MAX, type Company, type DayStyle } from '../domain/types'
import { companyOf, type PlannerAction } from '../state/plannerState'
import type { PersonStatus } from '../state/usePlanner'
import { PlusIcon } from './Icons'
import { InlineAddForm } from './InlineAddForm'
import { newId } from './newId'
import { share, workPatternLabel } from './format'

const dotClass = (style: DayStyle) => `person-dot${style === 'outline' ? ' person-dot--outline' : ''}`

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface Props {
  people: PersonStatus[]
  /** The leave-year label the calendar shows; a person on a different leave year is labelled with theirs. */
  viewLabel: string
  companies: Company[]
  /** True while the calendar is editing a company's days, so no one is shown as selected. */
  editing?: boolean
  /** Cards for the side rail, or a scrolling row of chips for phones. */
  variant?: 'cards' | 'chips'
  dispatch: (action: PlannerAction) => void
}

/**
 * Choose whose leave the calendar edits, and add someone. Shown even for one
 * person so the feature is discoverable.
 */
export function PeopleBar({ people, viewLabel, companies, editing = false, variant = 'cards', dispatch }: Props) {
  const add = (name: string) => dispatch({ type: 'addPerson', id: newId('p'), name })

  if (variant === 'chips') {
    return (
      <div className="people-chips" role="group" aria-label="Booking for">
        {people.map(({ person, active, summary, label }) => (
          <button
            key={person.id}
            type="button"
            className="chip person-chip"
            aria-pressed={active && !editing}
            style={{ '--person-colour': person.colour } as CSSProperties}
            onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
          >
            <span className={dotClass(person.style)} aria-hidden="true" />
            <span className="person-chip-name">{person.name}</span>
            {person.tracksAllowance ? (
              <span className={`person-chip-left num${summary.remaining < 0 ? ' is-warn' : ''}`}>{fmt(summary.remaining)} left</span>
            ) : (
              <span className="person-chip-left num">{fmt(summary.booked)} marked</span>
            )}
            {label !== viewLabel && <span className="person-chip-left num">{label}</span>}
          </button>
        ))}
        <InlineAddForm
          openLabel="Add person"
          openIcon={<PlusIcon />}
          iconOnly
          openClassName="chip person-chip-add"
          inputLabel="New person’s name"
          placeholder="Name"
          maxLength={PERSON_NAME_MAX}
          onAdd={add}
        />
      </div>
    )
  }

  return (
    <section className="rail-section" aria-labelledby="people-heading">
      <div className="rail-section-head">
        <h2 id="people-heading" className="section-label">
          People
        </h2>
        <InlineAddForm
          openLabel="Add person"
          openIcon={<PlusIcon size={14} />}
          inputLabel="New person’s name"
          placeholder="Name"
          maxLength={PERSON_NAME_MAX}
          onAdd={add}
        />
      </div>
      <ul className="person-cards">
        {people.map(({ person, active, summary, label }) => {
          const company = companyOf(companies, person)
          const ownYear = label !== viewLabel
          const negative = summary.remaining < 0
          const deducted = summary.bankHolidaysDeducted + summary.companyDaysDeducted
          return (
            <li key={person.id}>
              <button
                type="button"
                className="person-card"
                aria-pressed={active && !editing}
                aria-label={
                  person.tracksAllowance
                    ? `${person.name}, ${formatDays(summary.remaining)} left of ${formatDays(summary.entitlement)}${ownYear ? `, leave year ${label}` : ''}`
                    : `${person.name}, ${formatDays(summary.booked)} marked${ownYear ? `, leave year ${label}` : ''}`
                }
                style={{ '--person-colour': person.colour } as CSSProperties}
                onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
              >
                <span className="person-card-top">
                  <span className={dotClass(person.style)} aria-hidden="true" />
                  <span className="person-card-who">
                    <span className="person-card-name">{person.name}</span>
                    <span className="person-card-meta">
                      {person.tracksAllowance ? workPatternLabel(person) : 'Marks dates'}
                      {person.tracksAllowance && company ? ` · ${company.name}` : ''}
                    </span>
                  </span>
                  <span className="person-card-left">
                    {person.tracksAllowance ? (
                      <>
                        <span className={`person-card-remaining num${negative ? ' is-warn' : ''}`}>{fmt(summary.remaining)}</span>
                        <span className="person-card-of">of {fmt(summary.entitlement)} left{ownYear ? ` · ${label}` : ''}</span>
                      </>
                    ) : (
                      <>
                        <span className="person-card-remaining num">{fmt(summary.booked)}</span>
                        <span className="person-card-of">days marked{ownYear ? ` · ${label}` : ''}</span>
                      </>
                    )}
                  </span>
                </span>
                {person.tracksAllowance && (
                  <span className="usage-bar" aria-hidden="true">
                    <span style={{ width: share(summary.booked, summary.entitlement), background: person.colour }} />
                    <span className="usage-bar-deducted" style={{ width: share(deducted, summary.entitlement) }} />
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
