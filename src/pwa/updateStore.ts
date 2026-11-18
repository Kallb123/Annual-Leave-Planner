/**
 * Tiny external store: is a new version of the app downloaded and waiting?
 * Used with `useSyncExternalStore` by `UpdateBanner`.
 */
export interface UpdateStore {
  subscribe: (listener: () => void) => () => void
  /** True while a new service worker is installed and waiting to take over. */
  getSnapshot: () => boolean
  setWaiting: (worker: Pick<ServiceWorker, 'postMessage'> | null) => void
  /** Asks the waiting worker to activate. The page reloads on `controllerchange`. */
  applyUpdate: () => void
}

export function createUpdateStore(): UpdateStore {
  let waiting: Pick<ServiceWorker, 'postMessage'> | null = null
  const listeners = new Set<() => void>()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => waiting !== null,
    setWaiting(worker) {
      const changed = (worker !== null) !== (waiting !== null)
      waiting = worker
      if (changed) listeners.forEach((l) => l())
    },
    applyUpdate() {
      waiting?.postMessage({ type: 'SKIP_WAITING' })
    },
  }
}

export const updateStore = createUpdateStore()
