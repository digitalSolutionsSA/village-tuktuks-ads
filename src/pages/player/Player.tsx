import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { isAdminProfile, useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { getPlayableUrl, prefetchMedia, pruneCache } from '../../lib/mediaCache'
import { loadManifest, saveManifest } from '../../lib/playlistManifest'
import { demoPlaylistFor } from '../../lib/demoData'
import { listTuktuks } from '../../lib/tuktuksApi'
import { useWakeLock } from '../../hooks/useWakeLock'
import type { Ad, PlaylistItem, Tuktuk } from '../../types'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 60 * 1000
const DEFAULT_IMAGE_SECONDS = 8
const VIDEO_SAFETY_TIMEOUT_MS = 90 * 1000

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
 * `?preview`     — signed-in staff watching a tuk-tuk's screen; doesn't report the tablet as online.
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

  if (urlValid) return <PlayerScreen key={fromUrl} tuktukId={fromUrl} preview={preview} />
  if (pathname === '/') return <PlayerScreen tuktukId={loadDeviceTuktuk()} preview={false} />
  return <PlayerSetup preview={preview} />
}

function PlayerSetup({ preview }: { preview: boolean }) {
  const [tuktuks, setTuktuks] = useState<Tuktuk[] | null>(null)

  useEffect(() => {
    listTuktuks()
      .then(setTuktuks)
      .catch(() => setTuktuks([]))
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-8 text-center">
      <h1 className="text-2xl font-semibold text-white">
        {preview ? 'Preview which tuk-tuk?' : "Select this tablet's tuk-tuk number"}
      </h1>
      <p className="max-w-md text-sm text-zinc-400">
        {preview
          ? 'Admin preview — shows exactly what that tuk-tuk plays, no driver sign-in needed.'
          : 'Pick the number for this tuk-tuk. The tablet remembers it, so the home page always plays this tuk-tuk’s ads from then on.'}
      </p>
      {tuktuks === null ? (
        <p className="text-sm text-zinc-500">Loading fleet…</p>
      ) : (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {tuktuks.map((t) => (
            <Link
              key={t.id}
              to={`/player/${t.id}${preview ? '?preview' : ''}`}
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

  const groupPromise = groupId
    ? supabase
        .from('ad_group_assignments')
        .select('id, sort_order, creatives!inner(*)')
        .eq('group_id', groupId)
        .eq('creatives.is_active', true)
        .order('sort_order')
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
    const resolveAll = async () => {
      const entries = await Promise.all(
        items.map(async (item) => [item.media_url, await getPlayableUrl(item.media_url)] as const),
      )
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const [remote, local] of entries) if (local) map[remote] = local
      setResolved(map)
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

  useEffect(() => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current)
    if (!tuktukActive) return

    if (current.kind === 'notice') {
      advanceTimerRef.current = window.setTimeout(advance, NOTICE_SECONDS * 1000)
    } else if (current.item.media_type === 'image') {
      const seconds = current.item.duration_seconds || DEFAULT_IMAGE_SECONDS
      advanceTimerRef.current = window.setTimeout(advance, seconds * 1000)
    } else {
      // Safety net in case a video's 'ended' event never fires.
      advanceTimerRef.current = window.setTimeout(advance, VIDEO_SAFETY_TIMEOUT_MS)
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
    <div ref={rootRef} className="kiosk relative h-screen w-screen overflow-hidden bg-black" onClick={enterFullscreen}>
      {!tuktukActive ? (
        <OutOfServiceScreen tuktukId={tuktukId} />
      ) : current.kind === 'ad' && current.item.media_type === 'video' ? (
        <video
          key={slot}
          src={currentSrc}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          muted
          playsInline
          onEnded={advance}
          onError={advance}
        />
      ) : (
        <img
          key={slot}
          src={currentSrc}
          className="absolute inset-0 h-full w-full object-contain"
          alt={current.kind === 'notice' ? current.notice.title : ''}
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

      {preview && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 text-xs">
          <span className="rounded bg-brand-500/30 px-2 py-1 text-brand-200">Admin preview</span>
          <Link to="/admin" className="rounded bg-black/60 px-2 py-1 text-white/80 hover:text-white">
            Exit
          </Link>
        </div>
      )}

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
