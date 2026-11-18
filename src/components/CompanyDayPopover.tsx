import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { describeSelection } from '../domain/companyDays'
import type { IsoDate } from '../domain/dates'
import { COMPANY_DAY_NAME_MAX, DEFAULT_COMPANY_DAY_NAME, type CompanyDay } from '../domain/types'

export interface CompanyDayChoice {
  name: string
  deducted: boolean
  repeatsAnnually: boolean
}

interface Props {
  dates: IsoDate[]
  companyName: string
  /** The company's existing days on the selected dates (repeating days included). */
  existing: CompanyDay[]
  /** The day button the popover hangs off. */
  anchor: HTMLElement
  onAssign: (choice: CompanyDayChoice) => void
  onDelete: () => void
  /** Called for Cancel, Escape and outside clicks; the caller returns focus to the day. */
  onClose: () => void
}

const MARGIN = 8

/** Fixed position under (or over) the anchor, clamped to the viewport. */
function place(anchor: DOMRect, width: number, height: number): CSSProperties {
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const left = Math.max(MARGIN, Math.min(anchor.left + anchor.width / 2 - width / 2, vw - width - MARGIN))
  const below = anchor.bottom + MARGIN
  const top = below + height <= vh - MARGIN ? below : Math.max(MARGIN, anchor.top - MARGIN - height)
  return { left, top }
}

/** Small dialog for choosing what the selected days mean for a company. Bottom sheet on phones (CSS). */
export function CompanyDayPopover({ dates, companyName, existing, anchor, onAssign, onDelete, onClose }: Props) {
  const headingId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const only = dates.length === 1 && existing.length === 1 ? existing[0] : null
  const [name, setName] = useState(only?.name ?? '')
  const [repeats, setRepeats] = useState(only?.repeatsAnnually ?? false)
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 })
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Follow the anchor on scroll and resize.
  useLayoutEffect(() => {
    const update = () => {
      const el = ref.current
      if (el) setStyle(place(anchor.getBoundingClientRect(), el.offsetWidth, el.offsetHeight))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  useEffect(() => {
    const down = (e: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const assign = (deducted: boolean) =>
    onAssign({ name: name.trim() || DEFAULT_COMPANY_DAY_NAME, deducted, repeatsAnnually: repeats })
  const repeating = existing.some((d) => d.repeatsAnnually)

  return (
    <div ref={ref} className="company-popover" role="dialog" aria-modal="false" aria-labelledby={headingId} style={style} onKeyDown={onKeyDown}>
      <h4 id={headingId} className="company-popover-title">
        <span>{describeSelection(dates)}</span>
        <span className="company-popover-company">{companyName}</span>
      </h4>
      <label className="field">
        <span>Name</span>
        <input
          ref={inputRef}
          type="text"
          maxLength={COMPANY_DAY_NAME_MAX}
          placeholder={DEFAULT_COMPANY_DAY_NAME}
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Enter must not trigger a button by accident (Delete least of all).
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
        />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
        <span>Repeats every year</span>
      </label>
      <div className="company-popover-actions">
        <button type="button" className={only?.deducted === true ? 'primary' : 'secondary'} aria-pressed={only ? only.deducted : undefined} onClick={() => assign(true)}>
          Comes out of allowance
        </button>
        <button type="button" className={only?.deducted === false ? 'primary' : 'secondary'} aria-pressed={only ? !only.deducted : undefined} onClick={() => assign(false)}>
          Doesn't come out of allowance
        </button>
        {existing.length > 0 && (
          <button type="button" className="secondary danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
      {existing.length > 0 && repeating && <p className="field-hint">Deletes it from every year.</p>}
    </div>
  )
}
