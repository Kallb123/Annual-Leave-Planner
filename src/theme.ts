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

export type PaletteKey = keyof typeof palette

export function applyPaletteToCss(root: HTMLElement = document.documentElement) {
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--c-${key}`, value)
  }
}

export const legendItems: { key: PaletteKey; label: string }[] = [
  { key: 'leave', label: 'Annual leave' },
  { key: 'leaveHalf', label: 'Half day' },
  { key: 'bankHoliday', label: 'Bank holiday' },
  { key: 'companyDay', label: 'Company day' },
  { key: 'nonWorking', label: 'Non-working day' },
]
