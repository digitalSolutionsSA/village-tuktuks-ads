const CACHE_NAME = 'tuktuk-ads-media-v1'

const blobUrlByRemoteUrl = new Map<string, string>()

function hasCacheApi() {
  return typeof caches !== 'undefined'
}

/**
 * Resolves a remote media URL to a locally-playable blob: URL, using the
 * browser Cache Storage API so playback keeps working when the tablet loses
 * connectivity. On first (online) call the file is downloaded and stored;
 * later calls, including fully offline ones, are served from cache.
 *
 * Returns null only if the media has never been cached and the network is
 * unreachable right now — callers should skip that ad for this cycle.
 */
export async function getPlayableUrl(remoteUrl: string): Promise<string | null> {
  const existing = blobUrlByRemoteUrl.get(remoteUrl)
  if (existing) return existing

  // data: URLs (demo-mode inline SVGs) are already local — the Cache Storage
  // API can't store non-http(s) requests, and there's nothing to fetch anyway.
  if (remoteUrl.startsWith('data:')) return remoteUrl

  if (!hasCacheApi()) {
    // No Cache Storage support (very old WebView) — best effort, direct URL.
    return remoteUrl
  }

  const cache = await caches.open(CACHE_NAME)
  let response = await cache.match(remoteUrl)

  if (!response) {
    try {
      const fresh = await fetch(remoteUrl, { mode: 'cors' })
      if (!fresh.ok) throw new Error(`HTTP ${fresh.status}`)
      await cache.put(remoteUrl, fresh.clone())
      response = fresh
    } catch (err) {
      console.warn('[mediaCache] failed to fetch/cache', remoteUrl, err)
      return null
    }
  }

  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)
  blobUrlByRemoteUrl.set(remoteUrl, blobUrl)
  return blobUrl
}

/** Pre-warms the cache for a set of URLs without blocking playback. */
export function prefetchMedia(urls: string[]) {
  for (const url of urls) {
    getPlayableUrl(url).catch(() => {
      /* handled inside getPlayableUrl */
    })
  }
}

/** Drops cached entries that are no longer part of the current playlist. */
export async function pruneCache(keepUrls: string[]) {
  if (!hasCacheApi()) return
  const cache = await caches.open(CACHE_NAME)
  const keep = new Set(keepUrls)
  const requests = await cache.keys()
  for (const request of requests) {
    if (!keep.has(request.url)) {
      await cache.delete(request)
      const blobUrl = blobUrlByRemoteUrl.get(request.url)
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrlByRemoteUrl.delete(request.url)
      }
    }
  }
}
