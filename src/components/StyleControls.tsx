import type { CSSProperties } from 'react'
import { DAY_STYLES, type Company, type DayStyle } from '../domain/types'
import { companyDayColours } from '../theme'

/** A `.company-mark` swatch showing the company's colour and style. */
export function CompanyMark({ company }: { company: Pick<Company, 'colour' | 'style'> }) {
  const { fill, mark } = companyDayColours(company.colour)
  return (
    <span
      className={`company-mark${company.style === 'outline' ? ' company-mark--outline' : ''}`}
      style={{ '--company-fill': fill, '--company-mark': mark, '--company-colour': company.colour } as CSSProperties}
      aria-hidden="true"
    />
  )
}

/** Filled / Outline choice, each option with a tiny preview swatch in `colour`. */
export function StyleField({
  legend,
  colour,
  value,
  hint,
  onChange,
}: {
  legend: string
  colour: string
  value: DayStyle
  hint: string
  onChange: (style: DayStyle) => void
}) {
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="segmented" style={{ '--swatch-colour': colour } as CSSProperties}>
        {DAY_STYLES.map((s) => (
          <button key={s.id} type="button" aria-pressed={value === s.id} onClick={() => value === s.id || onChange(s.id)}>
            <span className={`style-swatch style-swatch--${s.id}`} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
      <span className="hint">{hint}</span>
    </fieldset>
  )
}

/** Preset swatches plus a custom colour input. */
export function ColourField({
  colours,
  names,
  value,
  legend = 'Colour',
  onChange,
}: {
  colours: readonly string[]
  names: Record<string, string>
  value: string
  legend?: string
  onChange: (colour: string) => void
}) {
  const isPreset = colours.some((c) => c === value.toLowerCase())
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="colour-swatches">
        {colours.map((c) => {
          const on = value.toLowerCase() === c
          const colourName = names[c] ?? c
          return (
            <button key={c} type="button" className="colour-swatch" aria-pressed={on} aria-label={colourName} title={colourName} onClick={() => onChange(c)}>
              <span className="colour-swatch-fill" style={{ background: c }}>
                {on && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m3 7.5 2.5 2.5L11 4.5" />
                  </svg>
                )}
              </span>
            </button>
          )
        })}
        <input
          type="color"
          className={`colour-custom${isPreset ? '' : ' colour-custom--active'}`}
          aria-label="Custom colour"
          title="Custom colour"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </fieldset>
  )
}
