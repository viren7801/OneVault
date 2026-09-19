import { Capacitor } from '@capacitor/core'
import { LiveUpdate } from '@capawesome/capacitor-live-update'

const MANIFEST_URL = 'https://onevault.patelviren.com/live-updates/latest.json'
const CURRENT_BUNDLE_ID = import.meta.env.VITE_BUILD_ID || null
const STATUS_TIMEOUT_MS = 7000
const READY_TIMEOUT_MS = 10000
const DOWNLOAD_TIMEOUT_MS = 90000

let readyPromise

function withTimeout(promise, timeoutMs, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

function getLiveUpdatePlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!Capacitor.isPluginAvailable('LiveUpdate')) return null
  return LiveUpdate
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS)

  try {
    const response = await fetch(MANIFEST_URL + '?t=' + Date.now(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error('Update server returned HTTP ' + response.status + '.')
    }

    const manifest = await response.json()
    if (!isValidManifest(manifest)) {
      throw new Error('The latest update manifest is invalid.')
    }

    return manifest
  } catch (requestError) {
    if (requestError?.name === 'AbortError') {
      throw new Error('Update check timed out. Please try again.')
    }
    throw requestError
  } finally {
    clearTimeout(timer)
  }
}

export async function initializeLiveUpdates() {
  const liveUpdate = getLiveUpdatePlugin()
  if (!liveUpdate) return null

  if (!readyPromise) {
    readyPromise = withTimeout(
      liveUpdate.ready(),
      READY_TIMEOUT_MS,
      'Live update startup timed out.',
    ).catch(error => {
      console.warn('[OneVault] live update ready check skipped:', error?.message || error)
      return null
    })
  }

  return readyPromise
}

export async function getLiveUpdateStatus() {
  const liveUpdate = getLiveUpdatePlugin()

  if (!liveUpdate) {
    return {
      supported: false,
      available: false,
      staged: false,
      currentBundleId: CURRENT_BUNDLE_ID,
      latestBundleId: null,
      nextBundleId: null,
    }
  }

  await initializeLiveUpdates()

  const manifest = await fetchManifest()
  let currentBundleId = CURRENT_BUNDLE_ID
  try {
    const current = await withTimeout(
      liveUpdate.getCurrentBundle(),
      STATUS_TIMEOUT_MS,
      'Could not read the current live update bundle.',
    )
    currentBundleId = current?.bundleId || currentBundleId
  } catch {
    // Fall back to the build-time ID when the native runtime cannot report one.
  }
  const available = Boolean(
    manifest.bundleId &&
    currentBundleId &&
    manifest.bundleId !== currentBundleId,
  )

  return {
    supported: true,
    available,
    staged: false,
    currentBundleId,
    nextBundleId: null,
    latestBundleId: manifest.bundleId,
    latestUrl: manifest.url,
    checksum: manifest.checksum,
  }
}

export async function installLatestLiveUpdate(onProgress) {
  const liveUpdate = getLiveUpdatePlugin()

  if (!liveUpdate) {
    throw new Error('Live updates are only available in the native OneVault app.')
  }

  await initializeLiveUpdates()

  const manifest = await fetchManifest()
  let currentBundleId = CURRENT_BUNDLE_ID
  try {
    const current = await withTimeout(
      liveUpdate.getCurrentBundle(),
      STATUS_TIMEOUT_MS,
      'Could not read the current live update bundle.',
    )
    currentBundleId = current?.bundleId || currentBundleId
  } catch {
    // Fall back to the build-time ID when the native runtime cannot report one.
  }

  if (manifest.bundleId === currentBundleId) {
    return {
      updated: false,
      bundleId: manifest.bundleId,
    }
  }

  const listener = await liveUpdate.addListener('downloadBundleProgress', event => {
    if (event?.bundleId !== manifest.bundleId) return
    const progress = Math.max(0, Math.min(1, Number(event.progress) || 0))
    onProgress?.(progress)
  })

  try {
    await withTimeout(
      liveUpdate.downloadBundle({
        url: manifest.url,
        bundleId: manifest.bundleId,
        artifactType: 'zip',
      }),
      DOWNLOAD_TIMEOUT_MS,
      'The update download timed out. Please try again.',
    )
  } finally {
    await listener.remove().catch(() => {})
  }

  await withTimeout(
    liveUpdate.setNextBundle({ bundleId: manifest.bundleId }),
    STATUS_TIMEOUT_MS,
    'Could not stage the downloaded update.',
  )

  onProgress?.(1)

  return {
    updated: true,
    staged: true,
    bundleId: manifest.bundleId,
    reload: () => liveUpdate.reload(),
  }
}
