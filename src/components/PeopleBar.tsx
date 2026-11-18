import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { PERSON_NAME_MAX } from '../domain/types'
import type { PlannerAction } from '../state/plannerState'
import type { PersonStatus } from '../state/usePlanner'
import { newId } from './newId'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface Props {
  people: PersonStatus[]
  dispatch: (action: PlannerAction) => void
}

/**
 * Chips for choosing whose leave the calendar edits, plus an inline form to
 * add someone. Shown even for one person so the feature is discoverable.
 */
export function PeopleBar({ people, dispatch }: Props) {
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
    dispatch({ type: 'addPerson', id: newId('p'), name: trimmed })
    close()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <div className="people-bar" role="group" aria-labelledby="people-bar-label">
      <span id="people-bar-label" className="people-bar-label">
        Booking for
      </span>
      <ul className="people-list">
        {people.map(({ person, active, summary }) => {
          const negative = summary.remaining < 0
          return (
            <li key={person.id}>
              <button
                type="button"
                className="person-chip"
                aria-pressed={active}
                style={{ '--person-colour': person.colour } as CSSProperties}
                onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
              >
                <span className="person-dot" aria-hidden="true" />
                <span className="person-name">{person.name}</span>
                <span className={`person-left${negative ? ' person-left--warn' : ''}`}>{fmt(summary.remaining)} left</span>
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
            aria-label="New person’s name"
            placeholder="Name"
            maxLength={PERSON_NAME_MAX}
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
          + Add person
        </button>
      )}
    </div>
  )
}
