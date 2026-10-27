// Keeps the app itself (page, scripts, logo, passenger notices) on the tablet, so it starts and runs
// with no signal. Ad media is cached separately by the player (src/lib/mediaCache.ts); Supabase
// and other servers are never touched here.

const SHELL_CACHE = 'vt-shell-v1'
// On a weak signal, stop waiting for a fresh page after this long and start from the saved one.
const PAGE_TIMEOUT_MS = 4000
const PRECACHE = [
  '/index.html',
  '/LOGO.png',
  '/icon.svg',
  '/manifest.webmanifest',
  '/Ads/notice-1-cctv.webp',
  '/Ads/notice-2-disclaimer.webp',
  '/Ads/notice-3-no-smoking.webp',
  '/Ads/notice-4-ride-rates.webp',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // One missing file mustn't stop the rest being saved.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('vt-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(page(request))
  } else if (url.pathname.startsWith('/assets/')) {
    // Built files have the content hash in their name, so a saved copy never goes stale.
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(staleWhileRevalidate(request, event))
  }
})

/** Every route serves the same index.html, so one saved copy covers all of them. */
async function page(request) {
  const cache = await caches.open(SHELL_CACHE)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put('/index.html', response.clone())
        pruneOldAssets(cache, await response.clone().text())
      }
      return response
    })
    .catch(() => null)

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS))
  const fresh = await Promise.race([network, timeout])
  if (fresh) return fresh
  const saved = await cache.match('/index.html')
  if (saved) return saved
  // Nothing saved yet (first ever visit) — wait for the network after all.
  return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' })
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  const saved = await cache.match(request)
  if (saved) return saved
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL_CACHE)
  const saved = await cache.match(request)
  const update = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  if (saved) {
    event.waitUntil(update)
    return saved
  }
  return (await update) || new Response('', { status: 504, statusText: 'Offline' })
}

/** After a new release, drop built files the new page no longer loads directly. */
async function pruneOldAssets(cache, html) {
  const current = new Set(html.match(/\/assets\/[^"')\s]+/g) || [])
  if (!current.size) return
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    if (path.startsWith('/assets/') && !current.has(path)) {
      // Keep chunks the current bundle still imports; they re-download on demand if needed.
      const stillUsed = await isImportedByCurrent(cache, current, path)
      if (!stillUsed) cache.delete(request)
    }
  }
}

async function isImportedByCurrent(cache, current, path) {
  const name = path.slice('/assets/'.length)
  for (const entry of current) {
    if (!entry.endsWith('.js')) continue
    const saved = await cache.match(entry)
    if (saved && (await saved.clone().text()).includes(name)) return true
  }
  return false
}
