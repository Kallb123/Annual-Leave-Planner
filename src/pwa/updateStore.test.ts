import { describe, expect, it, vi } from 'vitest'
import { createUpdateStore } from './updateStore'
import { trackUpdates } from './registerServiceWorker'

const fakeWorker = () => {
  const listeners: Record<string, () => void> = {}
  return {
    state: 'installing' as ServiceWorkerState,
    postMessage: vi.fn(),
    addEventListener: (type: string, cb: () => void) => (listeners[type] = cb),
    fire: (type: string) => listeners[type]?.(),
  }
}

describe('updateStore', () => {
  it('notifies subscribers only when availability changes', () => {
    const store = createUpdateStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    expect(store.getSnapshot()).toBe(false)

    store.setWaiting({ postMessage: vi.fn() })
    store.setWaiting({ postMessage: vi.fn() })
    expect(store.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.setWaiting(null)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('applyUpdate asks the waiting worker to skip waiting', () => {
    const store = createUpdateStore()
    const worker = { postMessage: vi.fn() }
    store.applyUpdate() // nothing waiting: no-op
    store.setWaiting(worker)
    store.applyUpdate()
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})

describe('trackUpdates', () => {
  function setup(opts: { waiting?: object | null; controller: boolean }) {
    const registrationListeners: Record<string, () => void> = {}
    const registration = {
      waiting: (opts.waiting ?? null) as ServiceWorker | null,
      installing: null as ServiceWorker | null,
      addEventListener: (type: string, cb: () => void) => (registrationListeners[type] = cb),
    }
    const store = { setWaiting: vi.fn() }
    trackUpdates(registration as never, store, () => opts.controller)
    return { registration, registrationListeners, store }
  }

  it('reports a worker that is already waiting on load', () => {
    const waiting = { state: 'installed' }
    const { store } = setup({ waiting, controller: true })
    expect(store.setWaiting).toHaveBeenCalledWith(waiting)
  })

  it('reports a worker that finishes installing while a controller exists', () => {
    const { registration, registrationListeners, store } = setup({ controller: true })
    const worker = fakeWorker()
    registration.installing = worker as never
    registrationListeners.updatefound()
    worker.state = 'installed'
    worker.fire('statechange')
    expect(store.setWaiting).toHaveBeenCalledWith(worker)
  })

  it('ignores the first install, which has no controller', () => {
    const { registration, registrationListeners, store } = setup({ controller: false })
    const worker = fakeWorker()
    registration.installing = worker as never
    registrationListeners.updatefound()
    worker.state = 'installed'
    worker.fire('statechange')
    expect(store.setWaiting).not.toHaveBeenCalled()
  })
})
