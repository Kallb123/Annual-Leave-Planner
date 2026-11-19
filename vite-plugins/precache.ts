import { createHash } from 'node:crypto'

/**
 * Files that live in `dist/` but must never be precached. The link preview
 * image (`og-image*.png`) is only fetched by other apps' crawlers.
 */
const EXCLUDED = [/^sw\.js$/, /^_headers$/, /^_redirects$/, /\.map$/, /^og-image.*\.png$/]

export interface BuiltFile {
  /** Path relative to the output directory, using forward slashes. */
  path: string
  content: Uint8Array | string
}

/**
 * URLs to precache, relative to the service worker's scope so the app works
 * under any Vite `base`. `index.html` is listed as `./` (what browsers request).
 */
export function buildPrecacheList(paths: readonly string[]): string[] {
  const urls = paths
    .filter((p) => !EXCLUDED.some((re) => re.test(p)))
    .map((p) => (p === 'index.html' ? './' : p))
  return [...new Set(urls)].sort()
}

/** Short content hash of every file: the cache name changes whenever any file does. */
export function computeVersion(files: readonly BuiltFile[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}

const VERSION_MARKER = "'__VERSION__'"
const PRECACHE_MARKER = '/*__PRECACHE__*/ []'

/** Fills the placeholders in `sw.template.js`. */
export function renderServiceWorker(template: string, version: string, precache: readonly string[]): string {
  if (!template.includes(VERSION_MARKER) || !template.includes(PRECACHE_MARKER)) {
    throw new Error('Service worker template is missing its version or precache placeholder')
  }
  return template
    .replace(VERSION_MARKER, () => JSON.stringify(version))
    .replace(PRECACHE_MARKER, () => JSON.stringify(precache))
}
