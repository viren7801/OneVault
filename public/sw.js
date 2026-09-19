const CACHE_NAME = 'onevault-shell-v3'
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/fold.css',
  '/icons/onevault-icon.svg',
]

function isDevelopmentRequest(request) {
  const url = new URL(request.url)
  return (
    url.port === '5173' ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.map')
  )
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request

  if (request.method !== 'GET') return
  if (request.url.includes('/rest/v1/') || request.url.includes('/auth/v1/') || request.url.includes('/functions/v1/')) return
  if (new URL(request.url).origin !== self.location.origin) return
  if (isDevelopmentRequest(request)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put('/', clone))
          return response
        })
        .catch(() => caches.match('/') || Response.error())
    )
    return
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      }))
  )
})
