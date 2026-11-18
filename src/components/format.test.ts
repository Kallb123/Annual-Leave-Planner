import { describe, expect, it } from 'vitest'
import { workPatternLabel, workingDaysLabel } from './format'

describe('workPatternLabel', () => {
  const fortnightStart = '2026-11-16'
  it('labels a weekly pattern like workingDaysLabel', () => {
    const workingDays = [1, 2, 3, 4, 5]
    expect(workPatternLabel({ workingDays, workingDaysWeek2: null, fortnightStart })).toBe(workingDaysLabel(workingDays))
  })
  it('labels a fortnightly pattern with both weeks', () => {
    expect(workPatternLabel({ workingDays: [1, 2, 3, 4, 5], workingDaysWeek2: [1, 2, 3, 4], fortnightStart })).toBe(
      'Mon–Fri / Mon–Thu',
    )
  })
})
