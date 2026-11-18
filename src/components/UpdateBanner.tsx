import { useSyncExternalStore } from 'react'
import { updateStore } from '../pwa/updateStore'

/** Shown when a new version of the app has been downloaded in the background. */
export function UpdateBanner() {
  const updateAvailable = useSyncExternalStore(updateStore.subscribe, updateStore.getSnapshot)
  if (!updateAvailable) return null

  return (
    <div className="update-banner" role="status">
      <span>Update available</span>
      <button type="button" className="primary" onClick={updateStore.applyUpdate}>
        Reload
      </button>
    </div>
  )
}
