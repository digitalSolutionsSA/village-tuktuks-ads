import { useEffect, useMemo, useState } from 'react'
import { getPlayableUrl, prefetchMedia } from '../lib/mediaCache'
import type { MarqueeMessage } from '../types'

const PIXELS_PER_SECOND = 90
const SECONDS_PER_MESSAGE_VERTICAL = 8
const FALLBACK_MESSAGE = 'Village Tuk-Tuks — ask your driver about advertising here'

/** Scrolls fleet-wide + tuk-tuk-specific ad messages/logos — a horizontal top bar, or a vertical left column. */
export function MarqueeBar({
  messages,
  orientation = 'horizontal',
}: {
  messages: MarqueeMessage[]
  orientation?: 'horizontal' | 'vertical'
}) {
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const isVertical = orientation === 'vertical'

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
  const horizontalDurationSeconds = Math.max(14, Math.round((approxLength * 9) / PIXELS_PER_SECOND))
  const verticalDurationSeconds = Math.max(20, (messages.length || 1) * SECONDS_PER_MESSAGE_VERTICAL)
  const durationSeconds = isVertical ? verticalDurationSeconds : horizontalDurationSeconds

  const track = (keyPrefix: string) =>
    messages.length ? (
      messages.map((m) =>
        isVertical ? (
          <div key={`${keyPrefix}-${m.id}`} className="w-full shrink-0 px-2 py-3">
            {m.media_url && resolved[m.media_url] ? (
              <img src={resolved[m.media_url]} alt="" className="w-full rounded object-contain" />
            ) : (
              <p className="text-center">
                {m.advertiser_name ? `${m.advertiser_name}: ` : ''}
                {m.message}
              </p>
            )}
          </div>
        ) : (
          <span key={`${keyPrefix}-${m.id}`} className="mx-6 flex shrink-0 items-center gap-3">
            {m.media_url && resolved[m.media_url] && (
              <img src={resolved[m.media_url]} alt="" className="h-[80%] w-auto shrink-0 rounded object-contain" />
            )}
            <span>
              {m.advertiser_name ? `${m.advertiser_name}: ` : ''}
              {m.message}
            </span>
          </span>
        ),
      )
    ) : (
      <span key={`${keyPrefix}-fallback`} className={isVertical ? 'my-4 shrink-0 px-2 text-center' : 'mx-6 shrink-0'}>
        {FALLBACK_MESSAGE}
      </span>
    )

  if (isVertical) {
    return (
      <div className="relative h-full w-full overflow-hidden border-r border-white/10 bg-zinc-950">
        <div
          className="marquee-track-vertical flex w-full flex-col items-center text-sm font-medium text-white/80"
          style={{ animationDuration: `${durationSeconds}s` }}
        >
          {track('a')}
          <div aria-hidden="true" className="flex w-full shrink-0 flex-col items-center">
            {track('b')}
          </div>
        </div>
      </div>
    )
  }

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
