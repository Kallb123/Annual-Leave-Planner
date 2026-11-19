import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const indexHtml = readFileSync(new URL('index.html', root), 'utf8')
const SITE = 'https://annual-leave-planner.kallum.uk/'

function meta(attr: 'property' | 'name', key: string): string | undefined {
  const match = indexHtml.match(new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`))
  return match?.[1]
}

describe('link preview metadata (Open Graph)', () => {
  it('has the tags WhatsApp, Slack and other apps read', () => {
    expect(meta('property', 'og:type')).toBe('website')
    expect(meta('property', 'og:title')).toBe('Annual Leave Planner')
    expect(meta('property', 'og:description')).toBe(meta('name', 'description'))
    expect(meta('property', 'og:url')).toBe(SITE)
    expect(meta('property', 'og:image:alt')).toBeTruthy()
    expect(meta('name', 'twitter:card')).toBe('summary_large_image')
    expect(indexHtml).toContain(`<link rel="canonical" href="${SITE}" />`)
  })

  it('points og:image at an absolute production URL for a file in public/', () => {
    const image = meta('property', 'og:image')
    expect(image).toMatch(new RegExp(`^${SITE}og-image[^/]*\\.png$`))
    const file = new URL(`public/${image!.slice(SITE.length)}`, root)
    expect(existsSync(file)).toBe(true)
  })

  it('uses a 1200x630 PNG small enough for WhatsApp', () => {
    const file = new URL(`public/${meta('property', 'og:image')!.slice(SITE.length)}`, root)
    const png = readFileSync(file)
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    // The IHDR chunk holds the width and height as big-endian 32-bit numbers.
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    expect([width, height]).toEqual([1200, 630])
    expect(meta('property', 'og:image:width')).toBe(String(width))
    expect(meta('property', 'og:image:height')).toBe(String(height))
    expect(statSync(file).size).toBeLessThan(300 * 1024)
  })
})
