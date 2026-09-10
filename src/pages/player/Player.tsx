import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { getPlayableUrl, prefetchMedia, pruneCache } from '../../lib/mediaCache'
import {
  loadManifest,
  loadMarqueeManifest,
  loadSidebarManifest,
  saveManifest,
  saveMarqueeManifest,
  saveSidebarManifest,
} from '../../lib/playlistManifest'
import { demoMarqueeFor, demoPlaylistFor, demoSidebarAdsFor } from '../../lib/demoData'
import { listTuktuks } from '../../lib/tuktuksApi'
import { listActiveDriverNames, logDriverSession, verifyDriverPin } from '../../lib/driversApi'
import { listSidebarAdsForTuktuk } from '../../lib/sidebarAdsApi'
import { listMarqueeForTuktuk } from '../../lib/marqueeApi'
import { useWakeLock } from '../../hooks/useWakeLock'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { PinPad } from '../../components/PinPad'
import { DriverPicker } from '../../components/DriverPicker'
import { SidebarAds } from '../../components/SidebarAds'
import { MarqueeBar } from '../../components/MarqueeBar'
import type { DriverName, MarqueeMessage, PlaylistItem, SidebarAd, Tuktuk } from '../../types'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 60 * 1000
const DEFAULT_IMAGE_SECONDS = 8
const VIDEO_SAFETY_TIMEOUT_MS = 90 * 1000

export function Player() {
  const { id } = useParams()
  const tuktukId = Number(id)
  const valid = id && Number.isInteger(tuktukId) && tuktukId >= 1

  if (!valid) return <PlayerSetup />
  return <PlayerScreen tuktukId={tuktukId} />
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
        Pick the number for this tuk-tuk, then set the resulting page as this browser's home page
        / start URL so it always reloads to the same tuk-tuk.
      </p>
      {tuktuks === null ? (
        <p className="text-sm text-zinc-500">Loading fleet…</p>
      ) : (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {tuktuks.map((t) => (
            <Link
              key={t.id}
              to={`/player/${t.id}`}
              className={`rounded-xl border px-4 py-6 text-lg font-semibold hover:border-purple-400 ${
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

async function fetchPlaylist(tuktukId: number, groupId: string | null): Promise<PlaylistItem[]> {
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
      if (item.start_date && item.start_date > today) continue
      if (item.end_date && item.end_date < today) continue
      if (!seen.has(item.id)) seen.set(item.id, item)
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.sort_order - b.sort_order)
}

type Mode = 'welcome' | 'cycling'

function PlayerScreen({ tuktukId }: { tuktukId: number }) {
  const [items, setItems] = useState<PlaylistItem[]>(() =>
    isSupabaseConfigured ? loadManifest(tuktukId) : demoPlaylistFor(tuktukId),
  )
  const [sidebarAds, setSidebarAds] = useState<SidebarAd[]>(() =>
    isSupabaseConfigured ? loadSidebarManifest(tuktukId) : demoSidebarAdsFor(tuktukId),
  )
  const [marqueeMessages, setMarqueeMessages] = useState<MarqueeMessage[]>(() =>
    isSupabaseConfigured ? loadMarqueeManifest(tuktukId) : demoMarqueeFor(tuktukId),
  )
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('welcome')
  const [driverListVisible, setDriverListVisible] = useState(false)
  const [availableDrivers, setAvailableDrivers] = useState<DriverName[] | null>(null)
  const [pendingDriver, setPendingDriver] = useState<DriverName | null>(null)
  const [currentDriver, setCurrentDriver] = useState<DriverName | null>(null)
  const [pinContext, setPinContext] = useState<'start' | 'exit' | null>(null)
  const [tuktukActive, setTuktukActive] = useState(true)
  const [tuktukLabel, setTuktukLabel] = useState(`Tuk-Tuk #${tuktukId}`)
  const online = useOnlineStatus()
  const { active: wakeLockActive } = useWakeLock()
  const advanceTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const fetchAndStore = useCallback(async () => {
    try {
      const info = await fetchTuktukInfo(tuktukId)
      const gid = info?.groupId ?? null
      if (info) {
        setTuktukActive(info.active)
        setTuktukLabel(info.label)
      }
      const fresh = await fetchPlaylist(tuktukId, gid)
      setItems(fresh)
      saveManifest(tuktukId, fresh)
      prefetchMedia(fresh.map((i) => i.media_url))
    } catch (err) {
      console.warn('[Player] refresh failed, staying on cached playlist', err)
    }

    try {
      const freshSidebar = await listSidebarAdsForTuktuk(tuktukId)
      setSidebarAds(freshSidebar)
      saveSidebarManifest(tuktukId, freshSidebar)
      prefetchMedia(freshSidebar.map((a) => a.media_url))
    } catch (err) {
      console.warn('[Player] sidebar ads refresh failed, staying on cached set', err)
    }

    try {
      const freshMarquee = await listMarqueeForTuktuk(tuktukId)
      setMarqueeMessages(freshMarquee)
      saveMarqueeManifest(tuktukId, freshMarquee)
    } catch (err) {
      console.warn('[Player] marquee refresh failed, staying on cached set', err)
    }
  }, [tuktukId])

  // Initial load + periodic refresh + realtime updates.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setItems(demoPlaylistFor(tuktukId))
      setSidebarAds(demoSidebarAdsFor(tuktukId))
      setMarqueeMessages(demoMarqueeFor(tuktukId))
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tuktuk_sidebar_ads',
          filter: `tuktuk_id=eq.${tuktukId}`,
        },
        fetchAndStore,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marquee_messages' }, fetchAndStore)
      .subscribe()

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [tuktukId, fetchAndStore])

  // Heartbeat so the admin dashboard can show this tablet as online. Goes
  // through a narrow RPC — the anon key can never rewrite the tuk-tuk's
  // label/active/group directly.
  useEffect(() => {
    if (!isSupabaseConfigured) return
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
  }, [tuktukId])

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
      pruneCache(items.map((i) => i.media_url))
    }
    if (items.length) resolveAll()
    return () => {
      cancelled = true
    }
  }, [items])

  const playable = useMemo(() => items.filter((i) => resolved[i.media_url]), [items, resolved])

  useEffect(() => {
    setIndex((i) => (playable.length ? i % playable.length : 0))
  }, [playable.length])

  const current = playable[index]

  const advance = useCallback(() => {
    setIndex((i) => (playable.length ? (i + 1) % playable.length : 0))
  }, [playable.length])

  useEffect(() => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current)
    if (mode !== 'cycling' || !current) return

    if (current.media_type === 'image') {
      const seconds = current.duration_seconds || DEFAULT_IMAGE_SECONDS
      advanceTimerRef.current = window.setTimeout(advance, seconds * 1000)
    } else {
      // Safety net in case a video's 'ended' event never fires.
      advanceTimerRef.current = window.setTimeout(advance, VIDEO_SAFETY_TIMEOUT_MS)
    }
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current)
    }
  }, [current, advance, mode])

  const openDriverPicker = () => {
    setDriverListVisible(true)
    listActiveDriverNames()
      .then(setAvailableDrivers)
      .catch(() => setAvailableDrivers([]))
  }

  const selectDriver = (driver: DriverName) => {
    setPendingDriver(driver)
    setDriverListVisible(false)
    setPinContext('start')
  }

  const startCycle = async () => {
    if (!pendingDriver) return
    await logDriverSession(pendingDriver.id, tuktukId, 'sign_in')
    setCurrentDriver(pendingDriver)
    setPendingDriver(null)
    try {
      await rootRef.current?.requestFullscreen()
    } catch {
      /* fullscreen may be unavailable inside some kiosk browsers — harmless */
    }
    setMode('cycling')
    setPinContext(null)
  }

  const cancelStart = () => {
    setPinContext(null)
    setPendingDriver(null)
    setDriverListVisible(false)
  }

  const stopCycle = async () => {
    if (currentDriver) await logDriverSession(currentDriver.id, tuktukId, 'sign_out')
    document.exitFullscreen?.().catch(() => {})
    setCurrentDriver(null)
    setMode('welcome')
    setPinContext(null)
  }

  return (
    <div
      ref={rootRef}
      className="kiosk grid h-screen w-screen grid-cols-[13rem_1fr] grid-rows-[7rem_1fr] overflow-hidden bg-black sm:grid-cols-[17rem_1fr] sm:grid-rows-[8.5rem_1fr] lg:grid-cols-[21rem_1fr] lg:grid-rows-[10rem_1fr]"
    >
      <div className="flex items-center justify-center bg-zinc-950 p-1">
        <img src="/LOGO.png" alt="Village Tuk-Tuks" className="max-h-full max-w-full object-contain" />
      </div>

      <div className="min-w-0">
        <MarqueeBar messages={marqueeMessages} />
      </div>

      <div className="min-h-0">
        <SidebarAds ads={sidebarAds} />
      </div>

      <div
        className="relative min-h-0 min-w-0"
        onClick={() => {
          if (mode === 'cycling' && pinContext === null) setPinContext('exit')
        }}
      >
        {mode === 'welcome' && pinContext !== 'start' ? (
          driverListVisible ? (
            <DriverPicker drivers={availableDrivers} onSelect={selectDriver} />
          ) : (
            <WelcomeScreen label={tuktukLabel} tuktukActive={tuktukActive} onPlay={openDriverPicker} />
          )
        ) : mode === 'welcome' ? null : !tuktukActive ? (
          <OutOfServiceScreen tuktukId={tuktukId} />
        ) : current ? (
          current.media_type === 'video' ? (
            <video
              key={current.assignment_id}
              src={resolved[current.media_url]}
              className="h-full w-full object-contain"
              autoPlay
              muted
              playsInline
              onEnded={advance}
              onError={advance}
            />
          ) : (
            <img
              key={current.assignment_id}
              src={resolved[current.media_url]}
              className="h-full w-full object-contain"
              alt=""
              onError={advance}
            />
          )
        ) : (
          <IdleScreen tuktukId={tuktukId} />
        )}

        {pinContext === 'start' && pendingDriver && (
          <PinPad
            title={`Enter PIN for ${pendingDriver.username}`}
            onVerify={(candidate) => verifyDriverPin(pendingDriver.id, candidate)}
            onSuccess={startCycle}
            onIdleTimeout={cancelStart}
          />
        )}
        {pinContext === 'exit' && currentDriver && (
          <PinPad
            title="Enter PIN to exit"
            onVerify={(candidate) => verifyDriverPin(currentDriver.id, candidate)}
            onSuccess={stopCycle}
            onIdleTimeout={() => setPinContext(null)}
          />
        )}

        <div className="absolute left-3 top-3 flex items-center gap-2 text-xs text-white/40">
          {isSupabaseConfigured ? (
            <>
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {online ? 'online' : 'offline (cached playlist)'}
              {wakeLockActive && <span className="ml-1">· awake</span>}
            </>
          ) : (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
              DEMO MODE · tuk-tuk #{tuktukId}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen({
  label,
  tuktukActive,
  onPlay,
}: {
  label: string
  tuktukActive: boolean
  onPlay: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 text-center">
      <p className="text-2xl font-semibold text-white">{label}</p>
      {tuktukActive ? (
        <button
          onClick={onPlay}
          className="rounded-2xl bg-purple-500 px-10 py-5 text-xl font-semibold text-white hover:bg-purple-400"
        >
          ▶ Play Ads
        </button>
      ) : (
        <p className="text-zinc-500">This tuk-tuk is currently out of service.</p>
      )}
    </div>
  )
}

function IdleScreen({ tuktukId }: { tuktukId: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-zinc-500">
      <p className="text-lg">No ads scheduled for Tuk-Tuk #{tuktukId}</p>
      <p className="text-sm">Checking for updates automatically…</p>
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
