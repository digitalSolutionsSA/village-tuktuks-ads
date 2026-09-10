import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase, MEDIA_BUCKET } from '../../lib/supabase'
import { DEMO_ADS, demoTuktukIdsForAd } from '../../lib/demoData'
import { useAuth } from '../../context/AuthContext'
import type { Ad } from '../../types'

export function AdsList() {
  const { profile } = useAuth()
  const [ads, setAds] = useState<Ad[]>([])
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({})
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    if (!isSupabaseConfigured) {
      setAds(DEMO_ADS)
      const counts: Record<string, number> = {}
      for (const ad of DEMO_ADS) counts[ad.id] = demoTuktukIdsForAd(ad.id).length
      setLiveCounts(counts)
      setGroupCounts({})
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('creatives')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    const rows = (data as Ad[]) ?? []
    setAds(rows)

    if (rows.length) {
      const [{ data: assignments }, { data: groupAssignments }] = await Promise.all([
        supabase
          .from('ad_assignments')
          .select('ad_id')
          .in('ad_id', rows.map((a) => a.id)),
        supabase
          .from('ad_group_assignments')
          .select('ad_id')
          .in('ad_id', rows.map((a) => a.id)),
      ])
      const counts: Record<string, number> = {}
      for (const row of assignments ?? []) {
        counts[row.ad_id] = (counts[row.ad_id] ?? 0) + 1
      }
      const gCounts: Record<string, number> = {}
      for (const row of groupAssignments ?? []) {
        gCounts[row.ad_id] = (gCounts[row.ad_id] ?? 0) + 1
      }
      setLiveCounts(counts)
      setGroupCounts(gCounts)
    } else {
      setLiveCounts({})
      setGroupCounts({})
    }
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const handleDelete = async (ad: Ad) => {
    if (!isSupabaseConfigured) {
      alert('Demo mode — connect Supabase (see README) to manage real ads.')
      return
    }
    if (!confirm(`Delete "${ad.title}"? This removes it from every tuk-tuk.`)) return
    const { error } = await supabase.from('creatives').delete().eq('id', ad.id)
    if (error) {
      alert(error.message)
      return
    }
    await supabase.storage.from(MEDIA_BUCKET).remove([ad.media_path])
    setAds((prev) => prev.filter((a) => a.id !== ad.id))
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Ads</h1>
        <Link
          to="/admin/ads/new"
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400"
        >
          Upload new ad
        </Link>
      </div>

      {loading && <p className="text-zinc-500">Loading…</p>}
      {!loading && ads.length === 0 && (
        <p className="text-zinc-500">No ads yet. Upload your first one to get started.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ads.map((ad) => {
          const directCount = liveCounts[ad.id] ?? 0
          const groupCount = groupCounts[ad.id] ?? 0
          const isLive = directCount > 0 || groupCount > 0
          return (
            <div key={ad.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="aspect-video bg-black">
                {ad.media_type === 'video' ? (
                  <video src={ad.media_url} className="h-full w-full object-cover" muted />
                ) : (
                  <img src={ad.media_url} className="h-full w-full object-cover" alt={ad.title} />
                )}
              </div>
              <div className="p-3">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="truncate font-medium text-white">{ad.title}</h3>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      ad.is_active
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-zinc-700 text-zinc-400'
                    }`}
                  >
                    {ad.is_active ? 'active' : 'paused'}
                  </span>
                </div>
                {ad.advertiser_name && (
                  <p className="mb-1 text-xs text-zinc-400">for {ad.advertiser_name}</p>
                )}
                <p className="mb-1 text-xs text-zinc-500">
                  {ad.media_type} · {ad.duration_seconds}s
                </p>
                <p className="mb-3 text-xs">
                  {isLive ? (
                    <span className="text-emerald-400">
                      ● Live on {directCount} tuk-tuk{directCount === 1 ? '' : 's'}
                      {groupCount > 0 && ` + ${groupCount} group${groupCount === 1 ? '' : 's'}`}
                    </span>
                  ) : (
                    <span className="text-zinc-500">○ Not live yet</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Link
                    to={`/admin/ads/${ad.id}`}
                    className="flex-1 rounded-lg border border-zinc-700 py-1.5 text-center text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    Edit / Go live
                  </Link>
                  <button
                    onClick={() => handleDelete(ad)}
                    className="rounded-lg border border-red-900 px-3 text-sm text-red-400 hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
