import { useEffect, useMemo, useState } from 'react'
import { getPlayableUrl, prefetchMedia } from '../lib/mediaCache'
import type { MarqueeMessage } from '../types'

const PIXELS_PER_SECOND = 90
const FALLBACK_MESSAGE = 'Village Tuk-Tuks — ask your driver about advertising here'

/** Top bar of the player: scrolls fleet-wide + tuk-tuk-specific ad messages/logos. */
export function MarqueeBar({ messages }: { messages: MarqueeMessage[] }) {
  const [resolved, setResolved] = useState<Record<string, string>>({})

  useEffect(() => {
    const withMedia = messages.filter((m) => m.media_url)
    if (!withMedia.length) return
    let cancelled = false
    prefetchMedia(withMedia.map((m) => m.media_url as string))
    Promise.all(
      withMedia.map(async (m) => [m.media_url as string, await getPlayableUrl(m.media_url as string)] as const),
    ).then((entries) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const [remote, local] of entries) if (local) map[remote] = local
      setResolved(map)
    })
    return () => {
      cancelled = true
    }
  }, [messages])

  const approxLength = useMemo(() => {
    if (!messages.length) return FALLBACK_MESSAGE.length
    return messages.reduce((sum, m) => sum + m.message.length + (m.advertiser_name?.length ?? 0) + (m.media_url ? 40 : 0) + 8, 0)
  }, [messages])

  // Roughly constant scroll speed regardless of how much content there is.
  const durationSeconds = Math.max(14, Math.round((approxLength * 9) / PIXELS_PER_SECOND))

  const track = (keyPrefix: string) =>
    messages.length ? (
      messages.map((m) => (
        <span key={`${keyPrefix}-${m.id}`} className="mx-6 flex shrink-0 items-center gap-3">
          {m.media_url && resolved[m.media_url] && (
            <img
              src={resolved[m.media_url]}
              alt=""
              className="h-[80%] w-auto shrink-0 rounded object-contain"
            />
          )}
          <span>
            {m.advertiser_name ? `${m.advertiser_name}: ` : ''}
            {m.message}
          </span>
        </span>
      ))
    ) : (
      <span key={`${keyPrefix}-fallback`} className="mx-6 shrink-0">
        {FALLBACK_MESSAGE}
      </span>
    )

  return (
    <div className="relative h-full w-full overflow-hidden border-b border-white/10 bg-zinc-950">
      <div
        className="marquee-track flex h-full items-center whitespace-nowrap text-base font-medium text-white/80 sm:text-lg"
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {track('a')}
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {track('b')}
        </span>
      </div>
    </div>
  )
}
