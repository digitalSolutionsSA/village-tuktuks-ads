import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { isAdminProfile, useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { getPlayableUrl, prefetchMedia, pruneCache } from '../../lib/mediaCache'
import { loadManifest, saveManifest } from '../../lib/playlistManifest'
import { demoPlaylistFor } from '../../lib/demoData'
import { listTuktuks } from '../../lib/tuktuksApi'
import { useWakeLock } from '../../hooks/useWakeLock'
import { VIDEO_MAX_SECONDS } from '../../lib/adPackage'
import type { Ad, PlaylistItem, Tuktuk } from '../../types'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 60 * 1000
const DEFAULT_IMAGE_SECONDS = 8
/** On a weak signal a request can hang for minutes; give up and keep playing what's cached. */
const SERVER_TIMEOUT_MS = 15 * 1000

function serverTimeout(): AbortSignal {
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS)
  return controller.signal
}

/** A tablet that hasn't been given a tuk-tuk number yet plays every active ad in the fleet. */
const FLEET = 0
const DEVICE_TUKTUK_KEY = 'vt.deviceTuktuk'

function loadDeviceTuktuk(): number {
  try {
    const n = Number(localStorage.getItem(DEVICE_TUKTUK_KEY))
    return Number.isInteger(n) && n >= 1 ? n : FLEET
  } catch {
    return FLEET
  }
}

function saveDeviceTuktuk(tuktukId: number) {
  try {
    localStorage.setItem(DEVICE_TUKTUK_KEY, String(tuktukId))
  } catch {
    /* storage blocked — the tablet just keeps playing the fleet playlist at / */
  }
}

/**
 * Passenger notices, built into the player so they can't be switched off from the portal.
 * After every 5 ads the next notice plays (so every 6th slot), taking turns through all four.
 * With no ads scheduled, the notices play on their own.
 */
const NOTICES = [
  { title: "You're on CCTV", url: '/Ads/notice-1-cctv.webp' },
  { title: 'Disclaimer', url: '/Ads/notice-2-disclaimer.webp' },
  { title: 'No smoking, eating or drinking', url: '/Ads/notice-3-no-smoking.webp' },
  { title: 'Ride rates', url: '/Ads/notice-4-ride-rates.webp' },
]
const NOTICE_EVERY = 6
const NOTICE_SECONDS = 10

type Slot = { kind: 'ad'; item: PlaylistItem } | { kind: 'notice'; notice: (typeof NOTICES)[number] }

/** What plays in rotation slot `n` (0-based): ads in order, with a notice in every 6th slot. */
function slotAt(n: number, ads: PlaylistItem[]): Slot {
  if (!ads.length) return { kind: 'notice', notice: NOTICES[n % NOTICES.length] }
  const noticesBefore = Math.floor((n + 1) / NOTICE_EVERY)
  if ((n + 1) % NOTICE_EVERY === 0) return { kind: 'notice', notice: NOTICES[(noticesBefore - 1) % NOTICES.length] }
  return { kind: 'ad', item: ads[(n - noticesBefore) % ads.length] }
}

/**
 * `/`            — plays straight away: this tablet's tuk-tuk, or the whole fleet's ads if none is set yet.
 * `/player`      — pick this tablet's tuk-tuk number (remembered, so `/` plays it from then on).
 * `/player/7`    — plays tuk-tuk 7 and remembers it for this tablet.
 * `?preview`     — signed-in admin/sales staff: tuk-tuk buttons with that tuk-tuk's screen underneath,
 *                  which they can swipe through. Doesn't report the tablet as online.
 */
export function Player() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const preview = params.has('preview') && isAdminProfile(profile)
  const fromUrl = Number(id)
  const urlValid = Boolean(id) && Number.isInteger(fromUrl) && fromUrl >= 1

  useEffect(() => {
    if (urlValid && !preview) saveDeviceTuktuk(fromUrl)
  }, [urlValid, fromUrl, preview])

  if (preview) return <PreviewPage tuktukId={urlValid ? fromUrl : null} />
  if (urlValid) return <PlayerScreen key={fromUrl} tuktukId={fromUrl} preview={false} />
  if (pathname === '/') return <PlayerScreen tuktukId={loadDeviceTuktuk()} preview={false} />
  return <PlayerSetup />
}

/** For now the preview only offers the first 10 tuk-tuks. */
const PREVIEW_TUKTUK_LIMIT = 10

function PreviewPage({ tuktukId }: { tuktukId: number | null }) {
  const [tuktuks, setTuktuks] = useState<Tuktuk[] | null>(null)

  useEffect(() => {
    listTuktuks()
      .then((list) => setTuktuks(list.slice(0, PREVIEW_TUKTUK_LIMIT)))
      .catch(() => setTuktuks([]))
  }, [])

  const selected = tuktukId ?? tuktuks?.[0]?.id ?? null

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-center">
      <div className="mx-auto max-w-5xl">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="rounded bg-brand-500/30 px-2 py-1 text-xs text-brand-200">Admin preview</span>
          <Link to="/admin" className="rounded bg-zinc-800 px-3 py-1 text-sm text-white/80 hover:text-white">
            Exit
          </Link>
        </div>
        <h1 className="text-2xl font-semibold text-white">Preview which tuk-tuk?</h1>
        <p className="mx-auto mb-6 mt-2 max-w-md text-sm text-zinc-400">
          Shows exactly what that tuk-tuk plays. Swipe or use the arrows to move between ads, or leave it to play on its own.
        </p>
        {tuktuks === null ? (
          <p className="text-sm text-zinc-500">Loading fleet…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tuktuks.map((t) => (
              <Link
                key={t.id}
                to={`/player/${t.id}?preview`}
                replace
                className={`rounded-xl border px-4 py-4 text-lg font-semibold hover:border-brand-400 ${
                  t.id === selected
                    ? 'border-brand-400 bg-brand-500/20 text-white'
                    : t.active
                      ? 'border-zinc-700 bg-zinc-900 text-white'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        )}
        {selected !== null && (
          <div className="mt-8 aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black">
            <PlayerScreen key={selected} tuktukId={selected} preview />
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerSetup() {
  const [tuktuks, setTuktuks] = useState<Tuktuk[] | null>(null)

  useEffect(() => {
    listTuktuks()
      .then(setTuktuks)
      .catch(() => setTuktuks([]))
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-8 text-center">
      <h1 className="text-2xl font-semibold text-white">Select this tablet's tuk-tuk number</h1>
      <p className="max-w-md text-sm text-zinc-400">
        Pick the number for this tuk-tuk. The tablet remembers it, so the home page always plays this tuk-tuk’s ads from then on.
      </p>
      {tuktuks === null ? (
        <p className="text-sm text-zinc-500">Loading fleet…</p>
      ) : (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {tuktuks.map((t) => (
            <Link
              key={t.id}
              to={`/player/${t.id}`}
              className={`rounded-xl border px-4 py-6 text-lg font-semibold hover:border-brand-400 ${
                t.active
                  ? 'border-zinc-700 bg-zinc-900 text-white'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

interface TuktukInfo {
  active: boolean
  label: string
  groupId: string | null
}

async function fetchTuktukInfo(tuktukId: number): Promise<TuktukInfo | null> {
  const { data, error } = await supabase
    .from('tuktuks')
    .select('active, label, group_id')
    .eq('id', tuktukId)
    .abortSignal(serverTimeout())
    .maybeSingle()
  if (error || !data) return null
  return { active: data.active, label: data.label, groupId: data.group_id }
}

const inDateRange = (ad: Pick<Ad, 'start_date' | 'end_date'>, today: string) =>
  !(ad.start_date && ad.start_date > today) && !(ad.end_date && ad.end_date < today)

/** Every active ad in the fleet, for a tablet with no tuk-tuk number yet. */
async function fetchFleetPlaylist(): Promise<PlaylistItem[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('creatives')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
    .abortSignal(serverTimeout())
  if (error) throw error
  return ((data as Ad[]) ?? [])
    .filter((ad) => inDateRange(ad, today))
    .map((ad, i) => ({ ...ad, assignment_id: `fleet-${ad.id}`, sort_order: i }))
}

async function fetchPlaylist(tuktukId: number, groupId: string | null): Promise<PlaylistItem[]> {
  if (tuktukId === FLEET) return fetchFleetPlaylist()
  const today = new Date().toISOString().slice(0, 10)

  const directPromise = supabase
    .from('ad_assignments')
    .select('id, sort_order, creatives!inner(*)')
    .eq('tuktuk_id', tuktukId)
    .eq('creatives.is_active', true)
    .order('sort_order')
    .abortSignal(serverTimeout())

  const groupPromise = groupId
    ? supabase
        .from('ad_group_assignments')
        .select('id, sort_order, creatives!inner(*)')
        .eq('group_id', groupId)
        .eq('creatives.is_active', true)
        .order('sort_order')
        .abortSignal(serverTimeout())
    : Promise.resolve({ data: [], error: null } as const)

  const [directResult, groupResult] = await Promise.all([directPromise, groupPromise])
  if (directResult.error) throw directResult.error
  if (groupResult.error) throw groupResult.error

  // Direct assignments win if an ad is somehow reachable both ways.
  const seen = new Map<string, PlaylistItem>()
  for (const source of [directResult.data, groupResult.data]) {
    for (const row of (source ?? []) as any[]) {
      const item: PlaylistItem = {
        ...row.creatives,
        assignment_id: row.id,
        sort_order: row.sort_order,
      }
      if (!inDateRange(item, today)) continue
      if (!seen.has(item.id)) seen.set(item.id, item)
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.sort_order - b.sort_order)
}

function PlayerScreen({ tuktukId, preview }: { tuktukId: number; preview: boolean }) {
  const [items, setItems] = useState<PlaylistItem[]>(() =>
    isSupabaseConfigured ? loadManifest(tuktukId) : demoPlaylistFor(tuktukId),
  )
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [noticeUrls, setNoticeUrls] = useState<Record<string, string>>({})
  // Counts every slot played; slotAt() turns it into an ad or a notice.
  const [slot, setSlot] = useState(0)
  const [tuktukActive, setTuktukActive] = useState(true)
  const isFleet = tuktukId === FLEET
  useWakeLock() // keep the tablet's screen on
  const advanceTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const fetchAndStore = useCallback(async () => {
    // No signal: keep playing the saved playlist; the 'online' listener below refreshes once it's back.
    if (!navigator.onLine) return
    try {
      const info = isFleet ? null : await fetchTuktukInfo(tuktukId)
      const gid = info?.groupId ?? null
      if (info) setTuktukActive(info.active)
      const fresh = await fetchPlaylist(tuktukId, gid)
      setItems(fresh)
      saveManifest(tuktukId, fresh)
      prefetchMedia(fresh.map((i) => i.media_url))
    } catch (err) {
      console.warn('[Player] refresh failed, staying on cached playlist', err)
    }

  }, [tuktukId, isFleet])

  // Initial load + periodic refresh + realtime updates.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setItems(demoPlaylistFor(tuktukId))
      return
    }
    fetchAndStore()
    const interval = window.setInterval(fetchAndStore, REFRESH_INTERVAL_MS)
    window.addEventListener('online', fetchAndStore)

    const channel = supabase
      .channel(`tuktuk-${tuktukId}-playlist`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ad_assignments', filter: `tuktuk_id=eq.${tuktukId}` },
        fetchAndStore,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_group_assignments' }, fetchAndStore)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creatives' }, fetchAndStore)
      .subscribe()

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', fetchAndStore)
      supabase.removeChannel(channel)
    }
  }, [tuktukId, isFleet, fetchAndStore])

  // Heartbeat so the admin dashboard can show this tablet as online. Goes
  // through a narrow RPC — the anon key can never rewrite the tuk-tuk's
  // label/active/group directly.
  useEffect(() => {
    // An admin previewing from their own browser mustn't make the tablet look online.
    if (!isSupabaseConfigured || preview || isFleet) return
    const beat = () => {
      if (!navigator.onLine) return
      supabase
        .rpc('report_heartbeat', { tuktuk_id_param: tuktukId })
        .then(undefined, () => {
          /* offline — ignored, heartbeat resumes once back online */
        })
    }
    beat()
    const interval = window.setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [tuktukId, preview, isFleet])

  // Resolve each ad's media into a locally cached, offline-safe URL.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Demo ads are inline data: URIs — already local, nothing to cache.
      const map: Record<string, string> = {}
      for (const item of items) map[item.media_url] = item.media_url
      setResolved(map)
      return
    }
    let cancelled = false
    // Each ad joins the rotation as soon as its own file is ready, so cached ads play at once
    // while new ones are still downloading on a weak signal.
    const wanted = new Set(items.map((i) => i.media_url))
    setResolved((prev) => Object.fromEntries(Object.entries(prev).filter(([remote]) => wanted.has(remote))))
    const resolveAll = async () => {
      await Promise.all(
        items.map(async (item) => {
          const local = await getPlayableUrl(item.media_url)
          if (!cancelled && local) setResolved((prev) => (prev[item.media_url] === local ? prev : { ...prev, [item.media_url]: local }))
        }),
      )
      if (cancelled) return
      // Keep the notices cached too — they play even with no signal.
      pruneCache([...items.map((i) => i.media_url), ...NOTICES.map((n) => new URL(n.url, location.origin).href)])
    }
    if (items.length) resolveAll()
    return () => {
      cancelled = true
    }
  }, [items])

  // Notices are cached like ads so they keep playing offline.
  useEffect(() => {
    let cancelled = false
    Promise.all(NOTICES.map(async (n) => [n.url, (await getPlayableUrl(new URL(n.url, location.origin).href)) ?? n.url] as const))
      .then((entries) => !cancelled && setNoticeUrls(Object.fromEntries(entries)))
      .catch(() => !cancelled && setNoticeUrls(Object.fromEntries(NOTICES.map((n) => [n.url, n.url]))))
    return () => {
      cancelled = true
    }
  }, [])

  const playable = useMemo(() => items.filter((i) => resolved[i.media_url]), [items, resolved])
  const current = slotAt(slot, playable)
  const currentSrc = current.kind === 'ad' ? resolved[current.item.media_url] : (noticeUrls[current.notice.url] ?? current.notice.url)

  const advance = useCallback(() => setSlot((n) => n + 1), [])
  const goBack = useCallback(() => setSlot((n) => Math.max(0, n - 1)), [])

  // Preview only: arrow keys and left/right swipes move between ads; the timer restarts on each move.
  const swipeStartX = useRef<number | null>(null)
  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') advance()
      if (e.key === 'ArrowLeft') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, advance, goBack])
  const swipeHandlers = preview
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          swipeStartX.current = e.clientX
        },
        onPointerUp: (e: React.PointerEvent) => {
          const start = swipeStartX.current
          swipeStartX.current = null
          if (start === null || Math.abs(e.clientX - start) < 50) return
          if (e.clientX < start) advance()
          else goBack()
        },
      }
    : {}

  useEffect(() => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current)
    if (!tuktukActive) return

    if (current.kind === 'notice') {
      advanceTimerRef.current = window.setTimeout(advance, NOTICE_SECONDS * 1000)
    } else if (current.item.media_type === 'image') {
      const seconds = current.item.duration_seconds || DEFAULT_IMAGE_SECONDS
      advanceTimerRef.current = window.setTimeout(advance, seconds * 1000)
    } else {
      // Videos are cut off at 10 seconds however long the file is; shorter ones move on at 'ended'.
      // This also covers a video whose 'ended' event never fires.
      advanceTimerRef.current = window.setTimeout(advance, VIDEO_MAX_SECONDS * 1000)
    }
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current)
    }
    // `slot` re-arms the timer even when the same ad plays twice in a row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, playable.length, tuktukActive, advance])

  // Browsers only allow full screen after a tap, so the first tap on the tablet makes it full screen.
  const enterFullscreen = () => {
    if (preview || document.fullscreenElement) return
    rootRef.current?.requestFullscreen?.().catch(() => {
      /* unavailable inside some kiosk browsers — harmless */
    })
  }

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden bg-black ${preview ? 'h-full w-full touch-pan-y select-none' : 'kiosk h-screen w-screen'}`}
      onClick={enterFullscreen}
      {...swipeHandlers}
    >
      {!tuktukActive ? (
        <OutOfServiceScreen tuktukId={tuktukId} />
      ) : current.kind === 'ad' && current.item.media_type === 'video' ? (
        <video
          key={slot}
          src={currentSrc}
          className="absolute inset-0 h-full w-full object-contain"
          muted
          playsInline
          // Start at the chosen part of the video; the 10-second timer above stops it.
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            v.currentTime = Number(current.item.video_start_seconds ?? 0)
            v.play().catch(() => {
              /* the 10-second timer still moves on */
            })
          }}
          onEnded={advance}
          onError={advance}
        />
      ) : (
        <img
          key={slot}
          src={currentSrc}
          className="absolute inset-0 h-full w-full object-contain"
          alt={current.kind === 'notice' ? current.notice.title : ''}
          draggable={false}
          onError={advance}
        />
      )}

      {/* The only thing on screen besides the ad — and the way into the staff portal. */}
      <Link
        to="/admin"
        onClick={(e) => {
          e.stopPropagation()
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        }}
        className="absolute left-3 top-3 z-10 block rounded-2xl bg-black/40 p-1.5 backdrop-blur-sm"
        title="Village Media portal"
      >
        <img src="/LOGO.png" alt="Village Media" className="h-14 w-auto sm:h-20" />
      </Link>

      {preview &&
        (
          [
            ['‹', 'Previous ad', goBack, 'left-3'],
            ['›', 'Next ad', advance, 'right-3'],
          ] as const
        ).map(([icon, label, onClick, side]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={onClick}
            className={`absolute ${side} top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl leading-none text-white backdrop-blur-sm hover:bg-black/70`}
          >
            {icon}
          </button>
        ))}

      {!isSupabaseConfigured && (
        <span className="absolute bottom-3 right-3 z-10 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
          DEMO MODE · {isFleet ? 'all tuk-tuks' : `tuk-tuk #${tuktukId}`}
        </span>
      )}
    </div>
  )
}

function OutOfServiceScreen({ tuktukId }: { tuktukId: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-zinc-600">
      <p className="text-lg">Tuk-Tuk #{tuktukId} is currently out of service</p>
      <p className="text-sm">Ad playback is paused until it's marked active again.</p>
    </div>
  )
}
