import { useId, useState } from 'react'
import { parseDayCount } from '../domain/dayCount'

interface Props {
  label: string
  /** The last valid saved value. */
  value: number
  onCommit: (value: number) => void
  /** Optional unit shown inside the field, e.g. "days". */
  suffix?: string
}

/**
 * A text field for a day count. While focused it edits a local draft string, so
 * it can be cleared or partly typed freely. The draft is validated and saved on
 * blur or Enter; Escape discards it. Invalid input is never saved: the field
 * reverts to the last valid value and an inline error explains why.
 */
export function DayCountInput({ label, value, onCommit, suffix }: Props) {
  const id = useId()
  const errorId = `${id}-error`
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const result = parseDayCount(draft)
    if (result.ok) {
      setError(null)
      if (result.value !== value) onCommit(result.value)
    } else {
      setError(result.error)
    }
    setDraft(null)
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="day-count-box" data-invalid={error ? 'true' : undefined}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? String(value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setDraft(null)
            setError(null)
          }
        }}
      />
      {suffix && (
        <span className="day-count-suffix" aria-hidden="true">
          {suffix}
        </span>
      )}
      </span>
      <p id={errorId} className="field-error" role="alert">
        {error}
      </p>
    </div>
  )
}
