/**
 * Single source of truth for calendar colours.
 *
 * The on-screen calendar reads these through CSS custom properties (applied
 * in `main.tsx`), and the PNG exporter reads them directly, so the exported
 * image always matches what the user sees.
 */
export const palette = {
  /** Cards, panels, the PNG background. */
  background: '#ffffff',
  /** The warm page ground behind the cards. */
  surface: '#f6f5f1',
  text: '#1e1d1a',
  textMuted: '#6b675f',
  border: '#e6e3dc',
  /** Hairlines inside a card. */
  divider: '#efede7',
  /** Empty part of progress bars and other quiet fills. */
  track: '#eceae4',
  /** Primary buttons and selected controls. */
  ink: '#1e1d1a',
  /** Focus rings, links and bridge suggestions. */
  accent: '#2f4ad0',

  nonWorking: '#f2f0eb',
  nonWorkingText: '#6f6b62',
  bankHoliday: '#f3e2b6',
  bankHolidayText: '#6a4a10',
  companyDay: '#e5def5',
  companyDayText: '#47397a',
  /** A stronger company-day tone for small marks (bars, legend dots). */
  companyDayMark: '#b9abe3',
  leave: '#2f7a6b',
  leaveHalf: '#d5e4e1',
  today: '#1e1d1a',
  warn: '#b3261e',
} as const

/**
 * Default colours handed to people in order. All are dark enough for white
 * text (WCAG AA) and distinct from each other and from the bank holiday,
 * company day and non-working fills. Users can pick any colour.
 */
export const PERSON_COLOURS = [
  '#2f7a6b', // teal
  '#4a55c2', // indigo
  '#b23f66', // rose
  '#2c6e9e', // ocean
  '#7b4ba8', // plum
  '#8a5a2b', // walnut
  '#b5452f', // clay
  '#4a5565', // slate
] as const

/** Accessible names for the preset colours (custom colours fall back to their hex value). */
export const PERSON_COLOUR_NAMES: Record<string, string> = {
  '#2f7a6b': 'Teal',
  '#4a55c2': 'Indigo',
  '#b23f66': 'Rose',
  '#2c6e9e': 'Ocean',
  '#7b4ba8': 'Plum',
  '#8a5a2b': 'Walnut',
  '#b5452f': 'Clay',
  '#4a5565': 'Slate',
}

/** Preset colours for a company's days. The first reproduces the original purple. */
export const COMPANY_COLOURS = [
  '#6f5bb8', // violet
  '#2a8aa6', // lagoon
  '#c4871a', // amber
  '#4f8a3c', // fern
  '#c2547a', // blossom
  '#5f6b7a', // steel
] as const

/** Accessible names for the company presets (custom colours fall back to their hex value). */
export const COMPANY_COLOUR_NAMES: Record<string, string> = {
  '#6f5bb8': 'Violet',
  '#2a8aa6': 'Lagoon',
  '#c4871a': 'Amber',
  '#4f8a3c': 'Fern',
  '#c2547a': 'Blossom',
  '#5f6b7a': 'Steel',
}

/** Colour given to a company when none is chosen. */
export const DEFAULT_COMPANY_COLOUR: string = COMPANY_COLOURS[0]

/**
 * Preset colours for imported calendars (e.g. school holidays). Distinct from the
 * person and company presets so overlays don't read as leave or company days.
 */
export const CALENDAR_COLOURS = [
  '#d0742a', // tangerine
  '#2f8f5b', // meadow
  '#3a6fc4', // cornflower
  '#a2489b', // orchid
  '#9a7b1c', // ochre
  '#56707f', // pewter
] as const

/** Accessible names for the calendar presets (custom colours fall back to their hex value). */
export const CALENDAR_COLOUR_NAMES: Record<string, string> = {
  '#d0742a': 'Tangerine',
  '#2f8f5b': 'Meadow',
  '#3a6fc4': 'Cornflower',
  '#a2489b': 'Orchid',
  '#9a7b1c': 'Ochre',
  '#56707f': 'Pewter',
}

/** First calendar preset nobody is using yet, cycling through the list once all are taken. */
export function nextCalendarColour(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return CALENDAR_COLOURS.find((c) => !taken.has(c)) ?? CALENDAR_COLOURS[used.length % CALENDAR_COLOURS.length]
}

/** First company preset nobody is using yet, cycling through the list once all are taken. */
export function nextCompanyColour(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return COMPANY_COLOURS.find((c) => !taken.has(c)) ?? COMPANY_COLOURS[used.length % COMPANY_COLOURS.length]
}

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
 * A darker shade: the colour mixed with black.
 * `amount` is how much of the original colour to keep (0–1).
 */
export function shade(hex: string, amount = 0.65): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c * amount)
  const r = mix((n >> 16) & 0xff)
  const g = mix((n >> 8) & 0xff)
  const b = mix(n & 0xff)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Tones for a company's days derived from its colour: cell fill, text on that fill, and a stronger mark/outline tone. */
export function companyDayColours(colour: string): { fill: string; text: string; mark: string } {
  return { fill: halfDayTint(colour, 0.2), text: shade(colour, 0.65), mark: halfDayTint(colour, 0.5) }
}

/**
 * Black or white, whichever reads better on `hex` (WCAG relative luminance).
 */
export function textOn(hex: string): '#ffffff' | '#1e1d1a' {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff)
  // Contrast with white is 1.05/(L+0.05); with the dark text colour (L≈0.0124) it is (L+0.05)/0.0624.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0624 ? '#ffffff' : '#1e1d1a'
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
