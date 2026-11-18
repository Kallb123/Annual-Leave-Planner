import { updateStore, type UpdateStore } from './updateStore'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const MIN_CHECK_GAP_MS = 60 * 1000

/**
 * Reports a waiting worker to the store: one that is already waiting, or one
 * that finishes installing later. Without a controller this is the very first
 * install, which isn't an "update".
 */
export function trackUpdates(
  registration: Pick<ServiceWorkerRegistration, 'waiting' | 'installing' | 'addEventListener'>,
  store: Pick<UpdateStore, 'setWaiting'>,
  hasController: () => boolean,
) {
  if (registration.waiting && hasController()) store.setWaiting(registration.waiting)

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && hasController()) store.setWaiting(worker)
    })
  })
}

/** Registers `sw.js` in production builds only (never in `vite dev`). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker

  // A controller at startup means this page runs under an existing worker. When
  // a new one takes over, reload once to pick up the new files. Without a
  // controller, `clients.claim()` on first install must not trigger a reload.
  let reloading = false
  const hadController = container.controller !== null
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  const register = async () => {
    try {
      const registration = await container.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      trackUpdates(registration, updateStore, () => container.controller !== null)

      let lastCheck = Date.now()
      const check = () => {
        if (Date.now() - lastCheck < MIN_CHECK_GAP_MS) return
        lastCheck = Date.now()
        registration.update().catch(() => {}) // offline: try again later
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, CHECK_INTERVAL_MS)
    } catch (error) {
      console.warn('Service worker registration failed', error)
    }
  }

  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', () => void register(), { once: true })
}
