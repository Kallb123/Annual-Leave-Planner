// Renders the SVG icon sources in scripts/icons/ to the PNGs in public/icons/.
// Run with `npm run generate-icons`. Needs Playwright with Chromium available
// (not a project dependency; the build doesn't depend on this script).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const sources = new URL('./icons/', import.meta.url)
const out = new URL('../public/icons/', import.meta.url)

const targets = [
  { svg: 'icon.svg', file: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', file: 'icon-512.png', size: 512 },
  { svg: 'icon-maskable.svg', file: 'icon-512-maskable.png', size: 512 },
  // iOS rounds the corners itself and dislikes transparency, so use the full-bleed one.
  { svg: 'icon-maskable.svg', file: 'apple-touch-icon.png', size: 180 },
]

await mkdir(out, { recursive: true })
const browser = await chromium.launch()
try {
  for (const { svg, file, size } of targets) {
    const markup = await readFile(new URL(svg, sources), 'utf8')
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
    )
    await writeFile(new URL(file, out), await page.screenshot({ omitBackground: true }))
    await page.close()
    console.log(`public/icons/${file}`)
  }
} finally {
  await browser.close()
}
