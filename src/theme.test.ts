import { describe, expect, it } from 'vitest'
import {
  COMPANY_COLOURS,
  COMPANY_COLOUR_NAMES,
  DEFAULT_COMPANY_COLOUR,
  PERSON_COLOURS,
  companyDayColours,
  halfDayTint,
  isHexColour,
  nextCompanyColour,
  nextPersonColour,
  shade,
  textOn,
} from './theme'

describe('isHexColour', () => {
  it('accepts #rrggbb in either case', () => {
    expect(isHexColour('#2f9e6a')).toBe(true)
    expect(isHexColour('#ABCDEF')).toBe(true)
  })
  it('rejects everything else', () => {
    for (const v of ['#abc', '2f9e6a', '#gggggg', '#2f9e6a0', '', 'red', null, undefined, 12]) {
      expect(isHexColour(v)).toBe(false)
    }
  })
})

describe('nextPersonColour', () => {
  it('starts with the first colour', () => {
    expect(nextPersonColour([])).toBe(PERSON_COLOURS[0])
  })
  it('skips colours in use, ignoring case', () => {
    expect(nextPersonColour([PERSON_COLOURS[0].toUpperCase()])).toBe(PERSON_COLOURS[1])
    expect(nextPersonColour([PERSON_COLOURS[1]])).toBe(PERSON_COLOURS[0])
  })
  it('cycles once every colour is taken', () => {
    expect(nextPersonColour([...PERSON_COLOURS])).toBe(PERSON_COLOURS[0])
    expect(nextPersonColour([...PERSON_COLOURS, '#000000'])).toBe(PERSON_COLOURS[1])
  })
})

describe('halfDayTint', () => {
  it('mixes with white', () => {
    expect(halfDayTint('#000000', 0)).toBe('#ffffff')
    expect(halfDayTint('#123456', 1)).toBe('#123456')
    expect(halfDayTint('#000000', 0.5)).toBe('#808080')
  })
  it('always returns a valid, lighter-or-equal hex', () => {
    const t = halfDayTint('#2f9e6a')
    expect(isHexColour(t)).toBe(true)
    expect(parseInt(t.slice(1, 3), 16)).toBeGreaterThanOrEqual(0x2f)
  })
  it('keeps leading zeros', () => {
    expect(halfDayTint('#000000', 1)).toBe('#000000')
  })
})

describe('textOn', () => {
  it('uses white on dark and dark on light colours', () => {
    expect(textOn('#000000')).toBe('#ffffff')
    expect(textOn('#2563eb')).toBe('#ffffff')
    expect(textOn('#ffffff')).toBe('#1e1d1a')
    expect(textOn('#f4b740')).toBe('#1e1d1a')
  })
})

describe('company colours', () => {
  it('starts with the original purple and has a name for every preset', () => {
    expect(COMPANY_COLOURS[0]).toBe('#6f5bb8')
    expect(DEFAULT_COMPANY_COLOUR).toBe('#6f5bb8')
    expect(COMPANY_COLOURS).toHaveLength(6)
    for (const c of COMPANY_COLOURS) {
      expect(isHexColour(c)).toBe(true)
      expect(COMPANY_COLOUR_NAMES[c]).toBeTruthy()
    }
    expect(new Set(COMPANY_COLOURS).size).toBe(6)
  })
  it('nextCompanyColour skips used presets and cycles', () => {
    expect(nextCompanyColour([])).toBe(COMPANY_COLOURS[0])
    expect(nextCompanyColour([COMPANY_COLOURS[0].toUpperCase()])).toBe(COMPANY_COLOURS[1])
    expect(nextCompanyColour([...COMPANY_COLOURS])).toBe(COMPANY_COLOURS[0])
    expect(nextCompanyColour([...COMPANY_COLOURS, '#000000'])).toBe(COMPANY_COLOURS[1])
  })
})

describe('shade', () => {
  it('mixes with black', () => {
    expect(shade('#ffffff', 0.5)).toBe('#808080')
    expect(shade('#6f5bb8', 1)).toBe('#6f5bb8')
    expect(shade('#6f5bb8', 0)).toBe('#000000')
  })
})

describe('companyDayColours', () => {
  const luma = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff)
  }
  it('gives valid, correctly ordered tones for the default colour', () => {
    const c = companyDayColours(DEFAULT_COMPANY_COLOUR)
    for (const v of Object.values(c)) expect(isHexColour(v)).toBe(true)
    expect(luma(c.fill)).toBeGreaterThan(luma(c.mark))
    expect(luma(c.mark)).toBeGreaterThan(luma(DEFAULT_COMPANY_COLOUR))
    expect(luma(c.text)).toBeLessThan(luma(DEFAULT_COMPANY_COLOUR))
  })
})
