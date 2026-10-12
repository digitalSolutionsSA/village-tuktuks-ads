import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { DEMO_TUKTUKS, demoAdCountFor } from '../../lib/demoData'
import { addTuktuk, deleteTuktuk, setTuktukActive } from '../../lib/tuktuksApi'
import { listGroups } from '../../lib/groupsApi'
import { listDrivers } from '../../lib/driversApi'
import { useAuth } from '../../context/AuthContext'
import type { Tuktuk, TuktukGroup } from '../../types'

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function TuktuksOverview() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [groups, setGroups] = useState<TuktukGroup[]>([])
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [driverNamesByTuktuk, setDriverNamesByTuktuk] = useState<Record<number, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!isSupabaseConfigured) {
      setTuktuks(DEMO_TUKTUKS)
      const demoCounts: Record<number, number> = {}
      for (const t of DEMO_TUKTUKS) demoCounts[t.id] = demoAdCountFor(t.id)
      setCounts(demoCounts)
      setLoading(false)
      return
    }

    const [{ data: tuktukRows }, { data: assignments }, { data: groupAssignments }, groupList] =
      await Promise.all([
        supabase.from('tuktuks').select('*').order('id'),
        supabase.from('ad_assignments').select('tuktuk_id, creatives!inner(is_active)'),
        supabase.from('ad_group_assignments').select('group_id, creatives!inner(is_active)'),
        listGroups(),
      ])
    const tuktukRowsTyped = (tuktukRows as Tuktuk[]) ?? []
    setTuktuks(tuktukRowsTyped)
    setGroups(groupList)

    const groupCounts: Record<string, number> = {}
    for (const row of groupAssignments ?? []) {
      const active = (row as unknown as { creatives: { is_active: boolean } }).creatives?.is_active
      if (active) {
        groupCounts[row.group_id] = (groupCounts[row.group_id] ?? 0) + 1
      }
    }

    const nextCounts: Record<number, number> = {}
    for (const row of assignments ?? []) {
      const active = (row as unknown as { creatives: { is_active: boolean } }).creatives?.is_active
      if (active) {
        nextCounts[row.tuktuk_id] = (nextCounts[row.tuktuk_id] ?? 0) + 1
      }
    }
    for (const t of tuktukRowsTyped) {
      if (t.group_id) {
        nextCounts[t.id] = (nextCounts[t.id] ?? 0) + (groupCounts[t.group_id] ?? 0)
      }
    }
    setCounts(nextCounts)

    // Best-effort: only admins can read the drivers table; a 'customer'
    // profile viewing this page simply won't see nicknames.
    try {
      const drivers = await listDrivers()
      const byTuktuk: Record<number, string[]> = {}
      for (const d of drivers) {
        if (d.tuktuk_id != null) {
          byTuktuk[d.tuktuk_id] = [...(byTuktuk[d.tuktuk_id] ?? []), d.username]
        }
      }
      setDriverNamesByTuktuk(byTuktuk)
    } catch {
      setDriverNamesByTuktuk({})
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async () => {
    setError(null)
    setAdding(true)
    try {
      await addTuktuk()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tuk-tuk.')
    } finally {
      setAdding(false)
    }
  }

  const handleToggleActive = async (t: Tuktuk) => {
    setError(null)
    setBusyId(t.id)
    try {
      await setTuktukActive(t.id, !t.active)
      setTuktuks((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: !t.active } : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tuk-tuk.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (t: Tuktuk) => {
    if (!confirm(`Remove ${t.label} from the fleet? This unassigns every ad from it.`)) return
    setError(null)
    setBusyId(t.id)
    try {
      await deleteTuktuk(t.id)
      setTuktuks((prev) => prev.filter((x) => x.id !== t.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tuk-tuk.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Tuk-tuk fleet</h1>
        {isAdmin && (
          <button
            onClick={handleAdd}
            disabled={adding}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          >
            {adding ? 'Adding…' : '+ Add tuk-tuk'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tuktuks.map((tuktuk) => {
          const online =
            tuktuk.last_seen_at &&
            Date.now() - new Date(tuktuk.last_seen_at).getTime() < ONLINE_THRESHOLD_MS
          const busy = busyId === tuktuk.id

          return (
            <div
              key={tuktuk.id}
              className={`rounded-xl border p-4 ${
                tuktuk.active ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-800/60 bg-zinc-900/40'
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <Link to={`/admin/tuktuks/${tuktuk.id}`} className="hover:underline">
                  <span className="text-lg font-semibold text-white">{tuktuk.label}</span>
                  {driverNamesByTuktuk[tuktuk.id] && (
                    <span className="block text-xs font-normal text-purple-300">
                      {driverNamesByTuktuk[tuktuk.id].join(', ')}
                    </span>
                  )}
                </Link>
                {tuktuk.active ? (
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                    title={online ? 'Online' : 'Offline'}
                  />
                ) : (
                  <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">
                    inactive
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400">{counts[tuktuk.id] ?? 0} active ads</p>
              <p className="mb-1 mt-1 text-xs text-zinc-500">
                {tuktuk.active ? (online ? 'Online' : 'Offline') : 'Out of service'}
              </p>
              <p className="mb-3 text-xs text-zinc-600">
                {groups.find((g) => g.id === tuktuk.group_id)?.name ?? 'No group'}
              </p>

              <div className="flex flex-wrap gap-2">
                <a
                  href={`/player/${tuktuk.id}?preview`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  ▶ Open ad cycle
                </a>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => handleToggleActive(tuktuk)}
                      disabled={busy}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {tuktuk.active ? 'Mark inactive' : 'Mark active'}
                    </button>
                    <button
                      onClick={() => handleDelete(tuktuk)}
                      disabled={busy}
                      className="rounded-lg border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
