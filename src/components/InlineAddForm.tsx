import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'

interface Props {
  /** Visible text of the button that opens the form. */
  openLabel: string
  /** Icon shown before the label on the open button. */
  openIcon?: ReactNode
  /** Show only the icon (then `openLabel` becomes the button's aria-label). */
  iconOnly?: boolean
  openClassName?: string
  /** Accessible name of the text field. */
  inputLabel: string
  placeholder: string
  maxLength: number
  onAdd: (name: string) => void
}

/**
 * A button that turns into a one-field "name + Add / Cancel" form. Focus moves
 * into the field when it opens and back to the button when it closes.
 */
export function InlineAddForm({ openLabel, openIcon, iconOnly = false, openClassName = 'btn btn-ghost btn-sm', inputLabel, placeholder, maxLength, onAdd }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const wasAdding = useRef(false)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
    else if (wasAdding.current) openRef.current?.focus()
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
    onAdd(trimmed)
    close()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!adding) {
    return (
      <button
        ref={openRef}
        type="button"
        className={openClassName}
        aria-label={iconOnly ? openLabel : undefined}
        onClick={() => setAdding(true)}
      >
        {openIcon}
        {!iconOnly && openLabel}
      </button>
    )
  }

  return (
    <form className="inline-add" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        type="text"
        aria-label={inputLabel}
        placeholder={placeholder}
        maxLength={maxLength}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        Add
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
        Cancel
      </button>
    </form>
  )
}
