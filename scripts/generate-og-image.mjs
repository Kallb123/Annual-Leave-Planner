// Renders scripts/og-image/og-image.html to public/og-image.png, the link
// preview image (Open Graph) shown by WhatsApp, Slack and other apps.
// Run with `npm run generate-og-image`. Needs Playwright with Chromium available
// (not a project dependency; the build doesn't depend on this script).
//
// Apps cache link previews for a long time, so if the image changes, give it a
// new filename and update the og:image tags in index.html.
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const source = new URL('./og-image/og-image.html', import.meta.url)
const out = new URL('../public/og-image.png', import.meta.url)

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.goto(source.href)
  await page.evaluate(() => document.fonts.ready)
  await writeFile(out, await page.screenshot())
  console.log('public/og-image.png')
} finally {
  await browser.close()
}
