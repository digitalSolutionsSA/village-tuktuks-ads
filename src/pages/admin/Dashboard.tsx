import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { DEMO_ADS, DEMO_TUKTUKS } from '../../lib/demoData'
import { useAuth } from '../../context/AuthContext'

interface Stats {
  totalAds: number
  activeAds: number
  onlineTuktuks: number
  totalTuktuks: number
}

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured) {
        const now = Date.now()
        const onlineTuktuks = DEMO_TUKTUKS.filter(
          (t) => t.last_seen_at && now - new Date(t.last_seen_at).getTime() < ONLINE_THRESHOLD_MS,
        ).length
        setStats({
          totalAds: DEMO_ADS.length,
          activeAds: DEMO_ADS.filter((a) => a.is_active).length,
          onlineTuktuks,
          totalTuktuks: DEMO_TUKTUKS.length,
        })
        return
      }

      const [{ data: ads }, { data: tuktuks }] = await Promise.all([
        supabase.from('creatives').select('id, is_active'),
        supabase.from('tuktuks').select('id, last_seen_at'),
      ])

      const now = Date.now()
      const onlineTuktuks =
        tuktuks?.filter(
          (t) => t.last_seen_at && now - new Date(t.last_seen_at).getTime() < ONLINE_THRESHOLD_MS,
        ).length ?? 0

      setStats({
        totalAds: ads?.length ?? 0,
        activeAds: ads?.filter((a) => a.is_active).length ?? 0,
        onlineTuktuks,
        totalTuktuks: tuktuks?.length ?? 0,
      })
    }
    if (profile) load()
  }, [profile])

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total ads" value={stats?.totalAds} />
        <StatCard label="Active ads" value={stats?.activeAds} />
        <StatCard
          label="Tuk-tuks online"
          value={stats ? `${stats.onlineTuktuks}/${stats.totalTuktuks}` : undefined}
        />
        <StatCard label="Your role" value={profile?.role ?? '—'} />
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          to="/admin/ads/new"
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400"
        >
          Upload new ad
        </Link>
        <Link
          to="/admin/tuktuks"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          View tuk-tuk fleet
        </Link>
        <Link
          to="/admin/groups"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Manage groups
        </Link>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value ?? '—'}</p>
    </div>
  )
}
