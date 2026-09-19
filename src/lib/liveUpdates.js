import { Capacitor } from '@capacitor/core'

const MANIFEST_URL = '/live-updates/latest.json'

let liveUpdatePromise
let readyPromise

async function getLiveUpdatePlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!Capacitor.isPluginAvailable('LiveUpdate')) return null
  if (!liveUpdatePromise) {
    liveUpdatePromise = import('@capawesome/capacitor-live-update').then(module => module.LiveUpdate)
  }
  return liveUpdatePromise
}

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

async function fetchManifest() {
  const response = await fetch(MANIFEST_URL + '?t=' + Date.now(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error('Update server returned HTTP ' + response.status + '.')
  }

  const manifest = await response.json()
  if (!isValidManifest(manifest)) {
    throw new Error('The latest update manifest is invalid.')
  }

  return manifest
}

export async function initializeLiveUpdates() {
  const liveUpdate = await getLiveUpdatePlugin()
  if (!liveUpdate) return null

  if (!readyPromise) {
    readyPromise = liveUpdate.ready().catch(error => {
      console.warn('[oneVault] live update ready check skipped:', error?.message || error)
      return null
    })
  }

  return readyPromise
}

export async function getLiveUpdateStatus() {
  const liveUpdate = await getLiveUpdatePlugin()
  if (!liveUpdate) {
    return { supported: false, available: false, currentBundleId: null, latestBundleId: null }
  }

  await initializeLiveUpdates()

  const [manifest, current, next] = await Promise.all([
    fetchManifest(),
    liveUpdate.getCurrentBundle(),
    liveUpdate.getNextBundle(),
  ])

  const currentBundleId = current?.bundleId || null
  const nextBundleId = next?.bundleId || null
  const available = Boolean(manifest.bundleId && manifest.bundleId !== currentBundleId)
  const staged = Boolean(manifest.bundleId && manifest.bundleId === nextBundleId && manifest.bundleId !== currentBundleId)

  return {
    supported: true,
    available,
    staged,
    currentBundleId,
    nextBundleId,
    latestBundleId: manifest.bundleId,
    latestUrl: manifest.url,
    checksum: manifest.checksum,
  }
}

export async function installLatestLiveUpdate(onProgress) {
  const liveUpdate = await getLiveUpdatePlugin()
  if (!liveUpdate) {
    throw new Error('Live updates are only available in the native oneVault app.')
  }

  await initializeLiveUpdates()
  const manifest = await fetchManifest()
  const current = await liveUpdate.getCurrentBundle()
  const next = await liveUpdate.getNextBundle()

  if (manifest.bundleId === current?.bundleId) {
    return { updated: false, bundleId: manifest.bundleId }
  }

  if (manifest.bundleId !== next?.bundleId) {
    const listener = await liveUpdate.addListener('downloadBundleProgress', event => {
      if (event?.bundleId !== manifest.bundleId) return
      const progress = Math.max(0, Math.min(1, Number(event.progress) || 0))
      onProgress?.(progress)
    })

    try {
      await liveUpdate.downloadBundle({
        url: manifest.url,
        bundleId: manifest.bundleId,
        artifactType: 'zip',
        checksum: manifest.checksum,
      })
    } finally {
      await listener.remove().catch(() => {})
    }

    await liveUpdate.setNextBundle({ bundleId: manifest.bundleId })
  }

  onProgress?.(1)
  return {
    updated: true,
    staged: manifest.bundleId === next?.bundleId,
    bundleId: manifest.bundleId,
    reload: () => liveUpdate.reload(),
  }
}
