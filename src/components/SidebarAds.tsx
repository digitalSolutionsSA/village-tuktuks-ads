import { useEffect, useMemo, useState } from 'react'
import { getPlayableUrl, prefetchMedia } from '../lib/mediaCache'
import type { SidebarAd } from '../types'

const BLOCK_COUNT = 4

/** 4 equal blocks of house/service ads — stacked in the left column, or a row across the top. */
export function SidebarAds({
  ads,
  orientation = 'vertical',
}: {
  ads: SidebarAd[]
  orientation?: 'vertical' | 'horizontal'
}) {
  const [resolved, setResolved] = useState<Record<string, string>>({})

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
  const blocks = Array.from({ length: BLOCK_COUNT }, (_, i) => playable[i] ?? null)
  const isHorizontal = orientation === 'horizontal'

  return (
    <div
      className={`grid h-full w-full overflow-hidden bg-zinc-950 ${
        isHorizontal
          ? 'grid-cols-4 divide-x divide-white/10 border-b border-white/10'
          : 'grid-rows-4 divide-y divide-white/10 border-r border-white/10'
      }`}
    >
      {blocks.map((ad, i) =>
        ad ? (
          <div key={ad.id} className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden">
            <img src={resolved[ad.media_url]} alt={ad.title} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div key={i} className="flex min-h-0 min-w-0 items-center justify-center">
            <p className="px-1 text-center text-sm leading-tight text-white/20">
              Your ads here — ask admin to add one for this tuk-tuk
            </p>
          </div>
        ),
      )}
    </div>
  )
}
