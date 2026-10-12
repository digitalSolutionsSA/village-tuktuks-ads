import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { DEMO_TUKTUKS, demoPlaylistFor } from '../../lib/demoData'
import { deleteTuktuk, renameTuktuk, setTuktukActive, setTuktukGroup } from '../../lib/tuktuksApi'
import { listGroups } from '../../lib/groupsApi'
import {
  createSidebarAd,
  deleteSidebarAd,
  listAllSidebarAdsForTuktuk,
  setSidebarAdActive,
} from '../../lib/sidebarAdsApi'
import { useAuth } from '../../context/AuthContext'
import type { PlaylistItem, SidebarAd, Tuktuk, TuktukGroup } from '../../types'

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function TuktukDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const tuktukId = Number(id)
  const [tuktuk, setTuktuk] = useState<Tuktuk | null>(null)
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [groupItems, setGroupItems] = useState<PlaylistItem[]>([])
  const [groups, setGroups] = useState<TuktukGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [sidebarAds, setSidebarAds] = useState<SidebarAd[]>([])
  const [sidebarTitle, setSidebarTitle] = useState('')
  const [sidebarFile, setSidebarFile] = useState<File | null>(null)
  const [sidebarSaving, setSidebarSaving] = useState(false)
  const [sidebarError, setSidebarError] = useState<string | null>(null)

  const loadSidebarAds = async () => {
    try {
      setSidebarAds(await listAllSidebarAdsForTuktuk(tuktukId))
    } catch (err) {
      console.error('[TuktukDetail] failed to load sidebar ads', err)
    }
  }

  const load = async () => {
    setLoading(true)
    loadSidebarAds()
    if (!isSupabaseConfigured) {
      setTuktuk(DEMO_TUKTUKS.find((t) => t.id === tuktukId) ?? null)
      setItems(demoPlaylistFor(tuktukId))
      setGroupItems([])
      setGroups([])
      setLoading(false)
      return
    }

    const [{ data: tuktukRow }, { data: assignments }, groupList] = await Promise.all([
      supabase.from('tuktuks').select('*').eq('id', tuktukId).single(),
      supabase
        .from('ad_assignments')
        .select('id, sort_order, creatives(*)')
        .eq('tuktuk_id', tuktukId)
        .order('sort_order'),
      listGroups(),
    ])
    const tt = tuktukRow as Tuktuk
    setTuktuk(tt)
    setGroups(groupList)

    const rows = (
      (assignments ?? []) as unknown as { id: string; sort_order: number; creatives: PlaylistItem }[]
    )
      .filter((row) => row.creatives)
      .map((row) => ({ ...row.creatives, assignment_id: row.id, sort_order: row.sort_order }))
    setItems(rows)

    if (tt?.group_id) {
      const { data: groupAssignments } = await supabase
        .from('ad_group_assignments')
        .select('id, sort_order, creatives(*)')
        .eq('group_id', tt.group_id)
        .order('sort_order')
      const groupRows = (
        (groupAssignments ?? []) as unknown as {
          id: string
          sort_order: number
          creatives: PlaylistItem
        }[]
      )
        .filter((row) => row.creatives)
        .map((row) => ({ ...row.creatives, assignment_id: row.id, sort_order: row.sort_order }))
      setGroupItems(groupRows)
    } else {
      setGroupItems([])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuktukId])

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
    if (!isSupabaseConfigured) return

    await Promise.all(
      next.map((item, i) =>
        supabase.from('ad_assignments').update({ sort_order: i }).eq('id', item.assignment_id),
      ),
    )
  }

  const remove = async (item: PlaylistItem) => {
    if (isSupabaseConfigured) {
      await supabase.from('ad_assignments').delete().eq('id', item.assignment_id)
    }
    setItems((prev) => prev.filter((i) => i.assignment_id !== item.assignment_id))
  }

  const handleToggleActive = async () => {
    if (!tuktuk) return
    setError(null)
    setBusy(true)
    try {
      await setTuktukActive(tuktuk.id, !tuktuk.active)
      setTuktuk({ ...tuktuk, active: !tuktuk.active })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tuk-tuk.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!tuktuk) return
    if (!confirm(`Remove ${tuktuk.label} from the fleet? This unassigns every ad from it.`)) return
    setError(null)
    setBusy(true)
    try {
      await deleteTuktuk(tuktuk.id)
      navigate('/admin/tuktuks')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tuk-tuk.')
      setBusy(false)
    }
  }

  const handleSaveLabel = async () => {
    if (!tuktuk || !labelDraft.trim()) return
    setError(null)
    setBusy(true)
    try {
      await renameTuktuk(tuktuk.id, labelDraft.trim())
      setTuktuk({ ...tuktuk, label: labelDraft.trim() })
      setEditingLabel(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename tuk-tuk.')
    } finally {
      setBusy(false)
    }
  }

  const handleGroupChange = async (groupId: string) => {
    if (!tuktuk) return
    setError(null)
    setBusy(true)
    try {
      const nextGroupId = groupId || null
      await setTuktukGroup(tuktuk.id, nextGroupId)
      setTuktuk({ ...tuktuk, group_id: nextGroupId })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddSidebarAd = async (e: FormEvent) => {
    e.preventDefault()
    if (!sidebarFile) return
    setSidebarError(null)
    setSidebarSaving(true)
    try {
      await createSidebarAd(tuktukId, sidebarFile, sidebarTitle || 'My services')
      setSidebarTitle('')
      setSidebarFile(null)
      await loadSidebarAds()
    } catch (err) {
      setSidebarError(err instanceof Error ? err.message : 'Failed to add sidebar ad.')
    } finally {
      setSidebarSaving(false)
    }
  }

  const handleToggleSidebarAd = async (ad: SidebarAd) => {
    setSidebarError(null)
    try {
      await setSidebarAdActive(ad.id, !ad.is_active)
      await loadSidebarAds()
    } catch (err) {
      setSidebarError(err instanceof Error ? err.message : 'Failed to update sidebar ad.')
    }
  }

  const handleDeleteSidebarAd = async (ad: SidebarAd) => {
    if (!confirm(`Remove "${ad.title}" from this tuk-tuk's sidebar?`)) return
    setSidebarError(null)
    try {
      await deleteSidebarAd(ad.id, ad.media_path)
      await loadSidebarAds()
    } catch (err) {
      setSidebarError(err instanceof Error ? err.message : 'Failed to remove sidebar ad.')
    }
  }

  const playerUrl = `${window.location.origin}/player/${tuktukId}`
  const online =
    tuktuk?.last_seen_at && Date.now() - new Date(tuktuk.last_seen_at).getTime() < ONLINE_THRESHOLD_MS
  const currentGroup = groups.find((g) => g.id === tuktuk?.group_id)

  if (loading) return <p className="text-zinc-500">Loading…</p>
  if (!tuktuk) return <p className="text-zinc-500">Tuk-tuk not found.</p>

  return (
    <div className="max-w-2xl">
      <Link to="/admin/tuktuks" className="mb-4 inline-block text-sm text-zinc-400 hover:text-white">
        ← Back to fleet
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          {editingLabel ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel()}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xl font-semibold text-white outline-none focus:border-purple-400"
              />
              <button
                onClick={handleSaveLabel}
                disabled={busy}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Save
              </button>
              <button
                onClick={() => setEditingLabel(false)}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              {tuktuk.label}
              {isAdmin && (
                <button
                  onClick={() => {
                    setLabelDraft(tuktuk.label)
                    setEditingLabel(true)
                  }}
                  className="text-xs font-normal text-zinc-500 hover:text-zinc-300"
                >
                  rename
                </button>
              )}
            </h1>
          )}
          <p className="mt-1 text-sm text-zinc-400">
            {tuktuk.active ? (
              <span className={online ? 'text-emerald-400' : 'text-zinc-500'}>
                ● {online ? 'Online' : 'Offline'}
              </span>
            ) : (
              <span className="text-red-400">● Out of service</span>
            )}
            {tuktuk.last_seen_at && (
              <span className="ml-2">
                last seen {new Date(tuktuk.last_seen_at).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <a
            href={`/player/${tuktukId}?preview`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            ▶ Open ad cycle
          </a>
          <button
            onClick={() => {
              navigator.clipboard.writeText(playerUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          {isAdmin && (
            <>
              <button
                onClick={handleToggleActive}
                disabled={busy}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                {tuktuk.active ? 'Mark inactive' : 'Mark active'}
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-400 hover:bg-red-950 disabled:opacity-50"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="mb-6">
          <label className="mb-1 block text-xs font-medium text-zinc-400">Group</label>
          <select
            value={tuktuk.group_id ?? ''}
            onChange={(e) => handleGroupChange(e.target.value)}
            disabled={busy}
            className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
          >
            <option value="">— no group —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <p className="mb-3 text-sm font-medium text-zinc-300">Playlist ({items.length})</p>
      {items.length === 0 && groupItems.length === 0 && (
        <p className="text-sm text-zinc-500">
          No ads assigned yet.{' '}
          <Link to="/admin/ads" className="text-purple-300 hover:underline">
            Go live on one from the ads list.
          </Link>
        </p>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.assignment_id}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-2"
          >
            <div className="h-12 w-20 overflow-hidden rounded bg-black">
              {item.media_type === 'video' ? (
                <video src={item.media_url} className="h-full w-full object-cover" muted />
              ) : (
                <img src={item.media_url} className="h-full w-full object-cover" alt="" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{item.title}</p>
              <p className="text-xs text-zinc-500">
                {item.is_active ? 'active' : 'paused'} · {item.media_type}
              </p>
            </div>
            <button
              onClick={() => move(index, -1)}
              disabled={index === 0}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              onClick={() => remove(item)}
              className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {groupItems.length > 0 && (
        <>
          <p className="mb-3 mt-6 text-sm font-medium text-zinc-300">
            Also live via group "{currentGroup?.name}" ({groupItems.length})
          </p>
          <p className="mb-3 text-xs text-zinc-500">
            Managed from the ad's Edit / Go live page or the Groups page — not here.
          </p>
          <div className="space-y-2">
            {groupItems.map((item) => (
              <div
                key={item.assignment_id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-2"
              >
                <div className="h-12 w-20 overflow-hidden rounded bg-black">
                  {item.media_type === 'video' ? (
                    <video src={item.media_url} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={item.media_url} className="h-full w-full object-cover" alt="" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-zinc-500">
                    {item.is_active ? 'active' : 'paused'} · {item.media_type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 border-t border-zinc-800 pt-6">
        <p className="mb-1 text-sm font-medium text-zinc-300">
          {tuktuk.label}'s own ads (player sidebar)
        </p>
        <p className="mb-3 text-xs text-zinc-500">
          Shown in the narrow bar on the left of this tuk-tuk's screen — the driver's own logo,
          charter rates, or services, separate from the main ad cycle.
        </p>

        {sidebarError && <p className="mb-3 text-sm text-red-400">{sidebarError}</p>}

        {isAdmin && (
          <form
            onSubmit={handleAddSidebarAd}
            className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Title</label>
              <input
                value={sidebarTitle}
                onChange={(e) => setSidebarTitle(e.target.value)}
                placeholder="e.g. Charter bookings"
                className="w-48 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSidebarFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-zinc-700"
              />
            </div>
            <button
              type="submit"
              disabled={sidebarSaving || !sidebarFile}
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
            >
              {sidebarSaving ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        {sidebarAds.length === 0 ? (
          <p className="text-sm text-zinc-500">No sidebar ads yet for this tuk-tuk.</p>
        ) : (
          <div className="space-y-2">
            {sidebarAds.map((ad) => (
              <div
                key={ad.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-2"
              >
                <div className="h-12 w-12 overflow-hidden rounded bg-black">
                  <img src={ad.media_url} className="h-full w-full object-cover" alt="" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{ad.title}</p>
                  <p className="text-xs text-zinc-500">{ad.is_active ? 'active' : 'paused'}</p>
                </div>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => handleToggleSidebarAd(ad)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      {ad.is_active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteSidebarAd(ad)}
                      className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
