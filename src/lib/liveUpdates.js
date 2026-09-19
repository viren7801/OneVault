import { Capacitor } from '@capacitor/core'

const MANIFEST_URL = '/live-updates/latest.json'
const STATUS_TIMEOUT_MS = 7000
const READY_TIMEOUT_MS = 3500
const DOWNLOAD_TIMEOUT_MS = 90000

let liveUpdatePromise
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

async function getLiveUpdatePlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!Capacitor.isPluginAvailable('LiveUpdate')) return null

  if (!liveUpdatePromise) {
    liveUpdatePromise = import('@capawesome/capacitor-live-update')
      .then(module => module.LiveUpdate)
  }

  return withTimeout(
    liveUpdatePromise,
    STATUS_TIMEOUT_MS,
    'Live update service is taking too long to respond.',
  )
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

async function callLiveUpdate(methodName, ...args) {
  const liveUpdate = await getLiveUpdatePlugin()
  if (!liveUpdate || typeof liveUpdate[methodName] !== 'function') {
    throw new Error('Live updates are unavailable in this build.')
  }

  return withTimeout(
    liveUpdate[methodName](...args),
    STATUS_TIMEOUT_MS,
    'Live update service is taking too long to respond.',
  )
}

export async function initializeLiveUpdates() {
  const liveUpdate = await getLiveUpdatePlugin()
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

  // Startup readiness must never block the UI or the manual update checker.
  void readyPromise
  return readyPromise
}

export async function getLiveUpdateStatus() {
  const liveUpdate = await getLiveUpdatePlugin()

  if (!liveUpdate) {
    return {
      supported: false,
      available: false,
      currentBundleId: null,
      nextBundleId: null,
      latestBundleId: null,
    }
  }

  // Readiness is a startup concern. Do not block the manual update checker on it.
  void initializeLiveUpdates()

  const [manifest, current] = await Promise.all([
    fetchManifest(),
    callLiveUpdate('getCurrentBundle'),
  ])

  const currentBundleId = current?.bundleId || null
  const available = Boolean(manifest.bundleId && manifest.bundleId !== currentBundleId)

  return {
    supported: true,
    available,
    staged,
    currentBundleId,
    nextBundleId: null,
    latestBundleId: manifest.bundleId,
    latestUrl: manifest.url,
    checksum: manifest.checksum,
  }
}

export async function installLatestLiveUpdate(onProgress) {
  const liveUpdate = await getLiveUpdatePlugin()
  if (!liveUpdate) {
    throw new Error('Live updates are only available in the native OneVault app.')
  }

  // Do not wait for plugin readiness here. It is already kicked off at startup.
  void initializeLiveUpdates()

  const manifest = await fetchManifest()
  const current = await callLiveUpdate('getCurrentBundle')

  if (manifest.bundleId === current?.bundleId) {
    return { updated: false, bundleId: manifest.bundleId }
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
          checksum: manifest.checksum,
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
  }

  onProgress?.(1)

  return {
    updated: true,
    staged: true,
    bundleId: manifest.bundleId,
    reload: () => liveUpdate.reload(),
  }
}
