import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

/** Headers in the `/*` rule of public/_headers (Cloudflare). */
function cloudflareHeaders(): Record<string, string> {
  const lines = readFileSync(new URL('public/_headers', root), 'utf8').split('\n')
  const start = lines.indexOf('/*')
  expect(start).toBeGreaterThanOrEqual(0)
  const headers: Record<string, string> = {}
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break
    const colon = line.indexOf(':')
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return headers
}

/** Headers in the `/(.*)` rule of vercel.json. */
function vercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const rule = config.headers.find((r) => r.source === '/(.*)')
  expect(rule).toBeDefined()
  return Object.fromEntries(rule!.headers.map((h) => [h.key, h.value]))
}

describe('security headers', () => {
  it('are the same on Cloudflare and Vercel', () => {
    expect(cloudflareHeaders()).toEqual(vercelHeaders())
  })

  it('set a strict Content Security Policy and the other basics', () => {
    const headers = cloudflareHeaders()
    const csp = headers['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it("keep index.html free of inline scripts and styles the policy would block", () => {
    const html = readFileSync(new URL('index.html', root), 'utf8')
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    expect(html).not.toMatch(/<style[\s>]/)
    expect(html).not.toMatch(/\sstyle="/)
  })
})
