import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { buildPrecacheList, computeVersion, renderServiceWorker, type BuiltFile } from './precache.ts'

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

/**
 * Production builds only: once everything is in the output directory, write
 * `sw.js` with the real precache list and a version derived from the content.
 * See docs/architecture.md ("Offline and updates").
 */
export function serviceWorkerPlugin(): Plugin {
  let outDir = ''
  return {
    name: 'alp-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir)
    },
    writeBundle() {
      const files: BuiltFile[] = listFiles(outDir)
        .map((file) => ({ path: relative(outDir, file).split(sep).join('/'), content: readFileSync(file) }))
        .filter((f) => f.path !== 'sw.js')
      const precache = buildPrecacheList(files.map((f) => f.path))
      const included = files.filter((f) => precache.includes(f.path === 'index.html' ? './' : f.path))
      const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
      // The worker's own logic is part of the version too.
      const version = computeVersion([...included, { path: 'sw.template.js', content: template }])
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, version, precache))
    },
  }
}
