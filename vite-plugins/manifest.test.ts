import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('public/manifest.webmanifest', root), 'utf8'))
const indexHtml = readFileSync(new URL('index.html', root), 'utf8')

describe('web app manifest', () => {
  it('has the fields needed to be installable', () => {
    expect(manifest.name).toBe('Annual Leave Planner')
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toMatch(/^\./) // relative, so any Vite `base` works
    expect(manifest.scope).toMatch(/^\./)
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('declares 192 and 512 icons plus a maskable one, and the files exist', () => {
    const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons
    const has = (sizes: string, purpose: string) => icons.some((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose)
    expect(has('192x192', 'any')).toBe(true)
    expect(has('512x512', 'any')).toBe(true)
    expect(has('512x512', 'maskable')).toBe(true)
    for (const icon of icons) expect(existsSync(new URL(`public/${icon.src}`, root))).toBe(true)
  })

  it('is linked from index.html along with the iOS home screen tags', () => {
    expect(indexHtml).toContain('rel="manifest"')
    expect(indexHtml).toContain('name="theme-color"')
    expect(indexHtml).toContain('rel="apple-touch-icon"')
    expect(existsSync(new URL('public/icons/apple-touch-icon.png', root))).toBe(true)
  })
})
