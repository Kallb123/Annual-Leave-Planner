import { describe, expect, it, vi } from 'vitest'
import { buildYearView } from '../domain/calendar'
import { NO_COMPANY_DAYS } from '../domain/companyDays'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { DayCell, PersonLeave } from '../domain/calendar'
import { outlineLayers, outlineSides, summaryParts, computeLayout, loadExportFonts } from './renderPng'

const view = buildYearView({ start: '2026-01-01', end: '2026-12-31' }, DEFAULT_SETTINGS, {}, new Map(), NO_COMPANY_DAYS)

describe('computeLayout', () => {
  it('defaults to one person and one legend row', () => {
    const l = computeLayout(view)
    expect(l.columns).toBe(4)
    expect(l.rows).toBe(3)
    expect(l.headerHeight).toBe(96)
    expect(l.legendRows).toBe(1)
    expect(computeLayout(view, 4, 1)).toEqual(l)
  })

  it('keeps the single-person header height for two people and grows beyond', () => {
    const one = computeLayout(view, 4, 1)
    const two = computeLayout(view, 4, 2)
    const six = computeLayout(view, 4, 6)
    expect(two.headerHeight).toBeGreaterThanOrEqual(one.headerHeight)
    expect(six.headerHeight).toBeGreaterThan(two.headerHeight)
    expect(six.height - one.height).toBe(six.headerHeight - one.headerHeight)
    expect(six.width).toBe(one.width)
  })

  it('adds height for each extra legend row', () => {
    const one = computeLayout(view, 4, 3, 1)
    const two = computeLayout(view, 4, 3, 2)
    expect(two.legendRows).toBe(2)
    expect(two.height).toBeGreaterThan(one.height)
    expect(computeLayout(view, 4, 3, 0).legendRows).toBe(1)
  })
})

describe('loadExportFonts', () => {
  it('resolves when document.fonts is unavailable', async () => {
    await expect(loadExportFonts()).resolves.toBeUndefined()
  })

  it('resolves when a font fails to load', async () => {
    vi.stubGlobal('document', { fonts: { load: () => Promise.reject(new Error('nope')) } })
    try {
      await expect(loadExportFonts()).resolves.toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('loads every weight it draws with', async () => {
    const load = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('document', { fonts: { load } })
    try {
      await loadExportFonts()
      expect(load).toHaveBeenCalledTimes(5)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

const summary = { entitlement: 25, booked: 4.5, bankHolidaysDeducted: 0, companyDaysDeducted: 0, remaining: 20.5 }

describe('summaryParts', () => {
  it('shows the allowance figures for someone who takes leave', () => {
    const texts = summaryParts({ summary, tracksAllowance: true }, true).map((p) => p.text)
    expect(texts).toEqual(['Entitlement 25', 'Booked 4.5', 'Remaining 20.5'])
  })

  it('shows only "Marked n" for someone who just marks dates', () => {
    expect(summaryParts({ summary, tracksAllowance: false }, true).map((p) => p.text)).toEqual(['Marked 4.5'])
    expect(summaryParts({ summary, tracksAllowance: false }, false).map((p) => p.text)).toEqual(['Marked 4.5'])
  })
})

describe('outlineSides', () => {
  it('opens a side only when joined and not at the edge of the week row', () => {
    expect(outlineSides(true, true, 2)).toEqual({ left: true, right: true })
    expect(outlineSides(true, true, 0)).toEqual({ left: false, right: true })
    expect(outlineSides(true, true, 6)).toEqual({ left: true, right: false })
    expect(outlineSides(false, false, 3)).toEqual({ left: false, right: false })
  })
})

describe('outlineLayers', () => {
  const person = (over: Partial<PersonLeave>): PersonLeave => ({
    personId: 'p',
    name: 'P',
    colour: '#112233',
    style: 'outline',
    tracksAllowance: false,
    portion: 'full',
    joinsPrev: false,
    joinsNext: true,
    overLimit: false,
    active: true,
    ...over,
  })
  const cell = (over: Partial<DayCell>): DayCell => {
    const base = view.months[0].weeks.flat().find((c): c is DayCell => c !== null)!
    return { ...base, ...over }
  }
  const outlined = { name: 'Co', colour: '#6f5bb8', style: 'outline' as const }

  it('draws outline people only, with filled people left to the cell fill', () => {
    const layers = outlineLayers(
      cell({ people: [person({}), person({ style: 'fill', colour: '#ff0000' }), person({ portion: 'half', colour: '#00ff00' })] }),
      null,
    )
    expect(layers).toEqual([
      { colour: '#112233', half: false, joinsPrev: false, joinsNext: true },
      { colour: '#00ff00', half: true, joinsPrev: false, joinsNext: true },
    ])
  })

  it('adds an outlined company on a company day, joined to its neighbours', () => {
    const layers = outlineLayers(cell({ kind: 'company-day', companyJoinsPrev: true, companyJoinsNext: false }), outlined)
    expect(layers).toEqual([{ colour: '#6f5bb8', half: false, joinsPrev: true, joinsNext: false }])
  })

  it('ignores a filled company and non-company days', () => {
    expect(outlineLayers(cell({ kind: 'company-day' }), { ...outlined, style: 'fill' })).toEqual([])
    expect(outlineLayers(cell({ kind: 'working' }), outlined)).toEqual([])
  })
})
