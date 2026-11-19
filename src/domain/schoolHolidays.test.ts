import { describe, expect, it } from 'vitest'
import {
  schoolHolidayAreas,
  schoolHolidayDataProblems,
  schoolHolidayImport,
  schoolHolidayRegions,
  type SchoolHolidayArea,
  type SchoolHolidayData,
} from './schoolHolidays'

const area = (id: string, region: string, holidays: SchoolHolidayArea['holidays'] = []): SchoolHolidayArea => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  authority: `${id} Council`,
  region,
  source: `https://example.gov.uk/${id}`,
  checked: '2026-11-19',
  holidays,
})

const holidays = [
  { start: '2026-07-22', end: '2026-08-31', name: 'Summer holiday' },
  { start: '2026-10-26', end: '2026-10-30', name: 'October half term' },
  { start: '2026-12-21', end: '2027-01-01', name: 'Christmas holiday' },
]

describe('bundled school holiday data', () => {
  it('has no problems', () => {
    expect(schoolHolidayDataProblems()).toEqual([])
  })
})

describe('schoolHolidayDataProblems', () => {
  it('accepts sorted, non-overlapping holidays', () => {
    expect(schoolHolidayDataProblems({ areas: [area('leeds', 'West Yorkshire', holidays)] })).toEqual([])
  })

  it('reports bad ids, dates, overlaps and missing fields', () => {
    const data: SchoolHolidayData = {
      areas: [
        area('leeds', 'West Yorkshire', [
          { start: '2026-10-26', end: '2026-10-30', name: 'Half term' },
          { start: '2026-10-30', end: '2026-11-02', name: 'Overlap' },
          { start: '2026-12-21', end: '2026-12-20', name: 'Backwards' },
          { start: '2027-02-30', end: '2027-02-30', name: 'Not a date' },
        ]),
        area('leeds', 'West Yorkshire', holidays),
        { ...area('Bad Id', '', []), source: 'http://example.com' },
      ],
    }
    const problems = schoolHolidayDataProblems(data)
    expect(problems).toEqual(
      expect.arrayContaining([
        'leeds 2026-10-30 Overlap: overlaps or is out of order after 2026-10-26',
        'leeds 2026-12-21 Backwards: ends before it starts',
        'leeds 2027-02-30 Not a date: invalid date',
        'leeds: duplicate id',
        'Bad Id: id must be a lower-case slug',
        'Bad Id: missing region',
        'Bad Id: source must be an https URL',
        'Bad Id: no holidays',
      ]),
    )
  })
})

describe('schoolHolidayRegions', () => {
  it('groups areas by region, each sorted by name', () => {
    const data = { areas: [area('wakefield', 'West Yorkshire'), area('sheffield', 'South Yorkshire'), area('leeds', 'West Yorkshire')] }
    expect(schoolHolidayAreas(data).map((a) => a.id)).toEqual(['sheffield', 'leeds', 'wakefield'])
    expect(schoolHolidayRegions(data).map((g) => [g.region, g.areas.map((a) => a.id)])).toEqual([
      ['South Yorkshire', ['sheffield']],
      ['West Yorkshire', ['leeds', 'wakefield']],
    ])
  })
})

describe('schoolHolidayImport', () => {
  it('converts holidays to import preview events, leaving out ones already over', () => {
    const result = schoolHolidayImport(area('sheffield', 'South Yorkshire', holidays), '2026-10-01')
    expect(result).toEqual({
      events: [
        { key: 'sheffield:2026-10-26', start: '2026-10-26', end: '2026-10-30', name: 'October half term' },
        { key: 'sheffield:2026-12-21', start: '2026-12-21', end: '2027-01-01', name: 'Christmas holiday' },
      ],
      calendarName: 'School holidays (Sheffield)',
      skipped: 0,
      unsupportedRepeats: 0,
      truncated: false,
    })
  })

  it('keeps a holiday that is still going on', () => {
    const result = schoolHolidayImport(area('sheffield', 'South Yorkshire', holidays), '2026-08-01')
    expect(result.events.map((e) => e.name)).toEqual(['Summer holiday', 'October half term', 'Christmas holiday'])
  })
})
