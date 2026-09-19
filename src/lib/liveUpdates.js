import { Capacitor } from '@capacitor/core'

let liveUpdatePromise

function isValidManifest(value) {
  return Boolean(
    value &&
    typeof value.bundleId === 'string' &&
    value.bundleId.trim() &&
    typeof value.url === 'string' &&
    value.url.startsWith('https://') &&
    typeof value.checksum === 'string' &&
    /^[a-f0-9]{64}$/i.test(value.checksum.trim()),
  )
}

async function getLiveUpdatePlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!Capacitor.isPluginAvailable('LiveUpdate')) return null
  if (!liveUpdatePromise) {
    liveUpdatePromise = import('@capawesome/capacitor-live-update').then(module => module.LiveUpdate)
  }
  return liveUpdatePromise
}

export async function initializeLiveUpdates() {
  const liveUpdate = await getLiveUpdatePlugin()
  if (!liveUpdate) return

  try {
    // Always acknowledge the current bundle before changing it.
    await liveUpdate.ready()

    const response = await fetch('/live-updates/latest.json?t=' + Date.now(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return

    const manifest = await response.json()
    if (!isValidManifest(manifest)) return

    const current = await liveUpdate.getCurrentBundle()
    const next = await liveUpdate.getNextBundle()

    if (current.bundleId === manifest.bundleId || next.bundleId === manifest.bundleId) return

    const downloaded = await liveUpdate.getBundles()
    if (!downloaded.bundleIds.includes(manifest.bundleId)) {
      await liveUpdate.downloadBundle({
        url: manifest.url,
        bundleId: manifest.bundleId,
        artifactType: 'zip',
        checksum: manifest.checksum,
      })
    }

    await liveUpdate.setNextBundle({ bundleId: manifest.bundleId })

    // Keep storage tidy without deleting the active or staged bundle.
    const refreshed = await liveUpdate.getBundles()
    const protectedIds = new Set(
      [current.bundleId, manifest.bundleId].filter(Boolean),
    )
    for (const bundleId of refreshed.bundleIds) {
      if (!protectedIds.has(bundleId)) {
        await liveUpdate.deleteBundle({ bundleId }).catch(() => {})
      }
    }
  } catch (error) {
    console.warn('[oneVault] live update check skipped:', error?.message || error)
  }
}
