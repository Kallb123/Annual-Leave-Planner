/**
 * Single source of truth for calendar colours.
 *
 * The on-screen calendar reads these through CSS custom properties (applied
 * in `main.tsx`), and the PNG exporter reads them directly, so the exported
 * image always matches what the user sees.
 */
export const palette = {
  background: '#ffffff',
  surface: '#f6f7f9',
  text: '#1d2330',
  textMuted: '#6b7280',
  border: '#e3e6eb',
  accent: '#2f6fed',

  nonWorking: '#eef0f3',
  bankHoliday: '#f4b740',
  companyDay: '#c3a6ec',
  leave: '#2f9e6a',
  leaveHalf: '#9fd8bb',
  today: '#2f6fed',
  warn: '#c2410c',
} as const

/**
 * Default colours handed to people in order (the first matches the original
 * single-person leave green). Chosen to stay distinct from each other and from
 * the bank holiday, company day and non-working fills. Users can pick any colour.
 */
export const PERSON_COLOURS = [
  '#2f9e6a', // green
  '#2563eb', // blue
  '#db2777', // pink
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#8b5e34', // brown
  '#dc2626', // red
  '#475569', // slate
] as const

/** First default colour nobody is using yet, cycling through the list once all are taken. */
export function nextPersonColour(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return PERSON_COLOURS.find((c) => !taken.has(c)) ?? PERSON_COLOURS[used.length % PERSON_COLOURS.length]
}

/** True for a `#rrggbb` hex colour. */
export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/**
 * The lighter shade used for half days: the colour mixed with white.
 * `amount` is how much of the original colour to keep (0–1).
 */
export function halfDayTint(hex: string, amount = 0.45): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount))
  const r = mix((n >> 16) & 0xff)
  const g = mix((n >> 8) & 0xff)
  const b = mix(n & 0xff)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Black or white, whichever reads better on `hex` (WCAG relative luminance).
 */
export function textOn(hex: string): '#ffffff' | '#1d2330' {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff)
  // Contrast with white is 1.05/(L+0.05); with the dark text colour it is (L+0.05)/0.0186+0.05.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.065 ? '#ffffff' : '#1d2330'
}

export type PaletteKey = keyof typeof palette

export function applyPaletteToCss(root: HTMLElement = document.documentElement) {
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--c-${key}`, value)
  }
}

/**
 * Fixed legend entries. Leave colours depend on the people in the plan, so
 * each renderer adds those itself (see `YearCalendar`'s `Legend` and `renderPng`).
 */
export const legendItems: { key: PaletteKey; label: string }[] = [
  { key: 'bankHoliday', label: 'Bank holiday' },
  { key: 'companyDay', label: 'Company day' },
  { key: 'nonWorking', label: 'Non-working day' },
]
