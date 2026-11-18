#!/usr/bin/env node
/**
 * Refreshes src/data/bank-holidays.json from the GOV.UK bank holidays API.
 *
 *   npm run update-bank-holidays            # fails loudly on error
 *   npm run update-bank-holidays -- --soft  # keeps the existing file on error
 *
 * The output is a trimmed copy (date + title only) so the bundle stays small.
 * Only dates from the start of last year onward are kept: older dates are
 * never shown in the planner.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://www.gov.uk/bank-holidays.json'
const OUT = fileURLToPath(new URL('../src/data/bank-holidays.json', import.meta.url))
const REGIONS = ['england-and-wales', 'scotland', 'northern-ireland']
const soft = process.argv.includes('--soft')

async function main() {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`GOV.UK responded ${res.status}`)
  const raw = await res.json()

  const cutoff = `${new Date().getUTCFullYear() - 1}-01-01`
  const divisions = {}
  for (const region of REGIONS) {
    const events = raw[region]?.events
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error(`No events for ${region} in GOV.UK response`)
    }
    divisions[region] = events
      .filter((e) => e.date >= cutoff)
      .map((e) => ({ date: e.date, title: e.title }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const previous = JSON.parse(await readFile(OUT, 'utf8'))
  if (JSON.stringify(previous.divisions) === JSON.stringify(divisions)) {
    console.log('Bank holidays already up to date.')
    return
  }

  const out = { source: SOURCE, fetchedAt: new Date().toISOString(), divisions }
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n')
  const last = divisions['england-and-wales'].at(-1)?.date
  console.log(`Updated bank holidays (data now runs to ${last}).`)
}

main().catch((err) => {
  if (soft) {
    console.warn(`Could not refresh bank holidays, keeping bundled copy: ${err.message}`)
  } else {
    console.error(err)
    process.exitCode = 1
  }
})
