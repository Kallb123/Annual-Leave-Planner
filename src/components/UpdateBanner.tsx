import { useSyncExternalStore } from 'react'
import { updateStore } from '../pwa/updateStore'

/** Shown when a new version of the app has been downloaded in the background. */
export function UpdateBanner() {
  const updateAvailable = useSyncExternalStore(updateStore.subscribe, updateStore.getSnapshot)
  if (!updateAvailable) return null

  return (
    <div className="update-banner" role="status">
      <span>A new version is ready.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={updateStore.applyUpdate}>
        Reload
      </button>
    </div>
  )
}
