import { useEffect, useMemo, useState } from 'react'
import { getPlayableUrl, prefetchMedia } from '../lib/mediaCache'
import type { SidebarAd } from '../types'

const CYCLE_MS = 6000

/** Left-hand bar of the player: cycles a tuk-tuk's own logo/service ads. */
export function SidebarAds({ ads }: { ads: SidebarAd[] }) {
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    const resolveAll = async () => {
      const entries = await Promise.all(
        ads.map(async (ad) => [ad.media_url, await getPlayableUrl(ad.media_url)] as const),
      )
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const [remote, local] of entries) if (local) map[remote] = local
      setResolved(map)
    }
    if (ads.length) {
      prefetchMedia(ads.map((a) => a.media_url))
      resolveAll()
    } else {
      setResolved({})
    }
    return () => {
      cancelled = true
    }
  }, [ads])

  const playable = useMemo(() => ads.filter((a) => resolved[a.media_url]), [ads, resolved])

  useEffect(() => {
    setIndex((i) => (playable.length ? i % playable.length : 0))
  }, [playable.length])

  useEffect(() => {
    if (playable.length < 2) return
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % playable.length)
    }, CYCLE_MS)
    return () => window.clearInterval(timer)
  }, [playable.length])

  const current = playable[index]

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 border-r border-white/10 bg-zinc-950 p-3">
      {current ? (
        <>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <img
              key={current.id}
              src={resolved[current.media_url]}
              alt={current.title}
              className="max-h-full max-w-full rounded object-contain"
            />
          </div>
          <p className="line-clamp-2 shrink-0 text-center text-sm font-medium text-white/70">
            {current.title}
          </p>
        </>
      ) : (
        <p className="px-1 text-center text-sm leading-tight text-white/20">
          Your ads here — ask admin to add one for this tuk-tuk
        </p>
      )}
    </div>
  )
}
