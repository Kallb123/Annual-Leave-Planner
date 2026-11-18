/*
 * Service worker template. `vite-plugins/pwa.ts` fills in the version and the
 * precache list after each production build and writes the result to `dist/sw.js`.
 *
 * - install: precache the build, but wait (no skipWaiting) so the page can ask
 *   the user before switching versions.
 * - activate: drop caches from older versions and take control of open pages.
 * - fetch: navigations go network-first (new deploys show up quickly, and the
 *   cached shell is used offline); other same-origin GETs are cache-first.
 */
const VERSION = '__VERSION__'
const PRECACHE = /*__PRECACHE__*/ []
const CACHE_PREFIX = 'alp-'
const CACHE_NAME = CACHE_PREFIX + VERSION

// URLs are relative to the worker's location, so any Vite `base` works.
const toUrl = (path) => new URL(path, self.location).href

// Module scripts are requested with an Origin header, the precache requests
// aren't. Ignore `Vary` so servers that send `Vary: Origin` still match offline.
const matchOptions = { cacheName: CACHE_NAME, ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // `reload` skips the browser's HTTP cache so the precache is really fresh.
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(toUrl(path), { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(toUrl('./'), matchOptions)))
    return
  }

  event.respondWith(
    caches.match(request, matchOptions).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
