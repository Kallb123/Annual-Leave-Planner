import { describe, expect, it } from 'vitest'
import { PERSON_COLOURS, halfDayTint, isHexColour, nextPersonColour, textOn } from './theme'

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
    expect(textOn('#ffffff')).toBe('#1d2330')
    expect(textOn('#f4b740')).toBe('#1d2330')
  })
})
