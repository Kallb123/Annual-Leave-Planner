import { describe, expect, it } from 'vitest'
import { buildPrecacheList, computeVersion, renderServiceWorker } from './precache.ts'

describe('buildPrecacheList', () => {
  it('lists index.html as ./, keeps assets and drops sw.js, _headers and source maps', () => {
    const list = buildPrecacheList([
      'sw.js',
      '_headers',
      'index.html',
      'assets/index-abc.js',
      'assets/index-abc.js.map',
      'assets/index-def.css',
      'manifest.webmanifest',
      'icons/icon-192.png',
    ])
    expect(list).toEqual(['./', 'assets/index-abc.js', 'assets/index-def.css', 'icons/icon-192.png', 'manifest.webmanifest'])
  })
})

describe('computeVersion', () => {
  const a = { path: 'a.js', content: 'one' }
  const b = { path: 'b.js', content: 'two' }

  it('is stable and independent of input order', () => {
    expect(computeVersion([a, b])).toBe(computeVersion([b, a]))
    expect(computeVersion([a, b])).toMatch(/^[0-9a-f]{12}$/)
  })

  it('changes when content or file names change', () => {
    const base = computeVersion([a, b])
    expect(computeVersion([a, { ...b, content: 'three' }])).not.toBe(base)
    expect(computeVersion([a, { ...b, path: 'c.js' }])).not.toBe(base)
  })
})

describe('renderServiceWorker', () => {
  const template = "const VERSION = '__VERSION__'\nconst PRECACHE = /*__PRECACHE__*/ []\n"

  it('fills in the version and precache list', () => {
    expect(renderServiceWorker(template, 'abc123', ['./', 'a.js'])).toBe(
      'const VERSION = "abc123"\nconst PRECACHE = ["./","a.js"]\n',
    )
  })

  it('throws when a placeholder is missing', () => {
    expect(() => renderServiceWorker('const x = 1', 'v', [])).toThrow()
  })
})
