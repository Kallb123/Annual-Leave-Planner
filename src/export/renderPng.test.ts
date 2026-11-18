import { describe, expect, it, vi } from 'vitest'
import { buildYearView } from '../domain/calendar'
import { NO_COMPANY_DAYS } from '../domain/companyDays'
import { DEFAULT_SETTINGS } from '../domain/types'
import { computeLayout, loadExportFonts } from './renderPng'

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
