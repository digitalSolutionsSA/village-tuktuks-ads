import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LEAD_STATUS_STYLES, StatCard } from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import { listAgreements } from '../../lib/clientsApi'
import { computeStats, formatRand, listLeads } from '../../lib/salesApi'
import {
  formatDuration,
  getStaff,
  isStaffOnline,
  listStaffSessions,
  onlineMs,
  timeAgo,
  updateStaff,
} from '../../lib/staffApi'
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type ClientAgreementWithClient, type Lead, type Profile, type StaffSession } from '../../types'

const LOG_DAYS = 14
const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400'

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })

export function SalesRepDetail() {
  const { id } = useParams()
  const { profile: me } = useAuth()
  const [rep, setRep] = useState<Profile | null>(null)
  const [sessions, setSessions] = useState<StaffSession[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [agreements, setAgreements] = useState<ClientAgreementWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [edit, setEdit] = useState({ display_name: '', phone: '', monthly_target: '', role: 'sales' as 'sales' | 'admin' })

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [p, ss, l, a] = await Promise.all([getStaff(id), listStaffSessions(LOG_DAYS, id), listLeads(id), listAgreements(id)])
      setRep(p)
      setSessions(ss)
      setLeads(l)
      setAgreements(a)
      if (p) {
        setEdit({
          display_name: p.display_name ?? '',
          phone: p.phone ?? '',
          monthly_target: p.monthly_target === null ? '' : String(p.monthly_target),
          role: p.role === 'admin' ? 'admin' : 'sales',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!rep) return
    setError(null)
    setNotice(null)
    try {
      await updateStaff(rep.id, edit)
      setNotice('Saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    }
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>
  if (!rep) return <p className="text-sm text-red-400">{error ?? 'Person not found.'}</p>

  const stats = computeStats(leads, agreements)
  const online = isStaffOnline(rep, sessions[0])
  const weekAgo = Date.now() - 7 * 86_400_000
  const byDay = new Map<string, StaffSession[]>()
  for (const s of sessions) byDay.set(dayKey(s.started_at), [...(byDay.get(dayKey(s.started_at)) ?? []), s])

  return (
    <div>
      <Link to="/admin/sales-team" className="text-sm text-zinc-400 hover:text-white">
        ← Sales team
      </Link>
      <div className="mb-6 mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">{rep.display_name || rep.username}</h1>
        <span className="text-sm text-zinc-500">{rep.username ? `@${rep.username}` : rep.email}</span>
        {!rep.active ? (
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Deactivated</span>
        ) : online ? (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Online now
          </span>
        ) : (
          <span className="text-sm text-zinc-400">Last seen {timeAgo(rep.last_seen_at)}</span>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Signed this month" value={stats.contractsThisMonth} hint={rep.monthly_target ? `Target ${rep.monthly_target}` : undefined} tone="good" />
        <StatCard label="New revenue (month)" value={formatRand(stats.newMonthlyRevenue)} />
        <StatCard label="All contracts" value={stats.contractsTotal} hint={`${formatRand(stats.totalMonthlyRevenue)} /month`} />
        <StatCard label="Open leads" value={stats.leadsOpen} hint={`${stats.followUpsDue} follow-ups due`} tone={stats.followUpsDue ? 'warn' : undefined} />
        <StatCard
          label="Win rate"
          value={stats.conversionRate === null ? '—' : `${Math.round(stats.conversionRate * 100)}%`}
          hint={`Online ${formatDuration(onlineMs(sessions, weekAgo))} this week`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-medium text-white">Lead pipeline</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {LEAD_STATUSES.map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-1 text-xs ${LEAD_STATUS_STYLES[s]}`}>
                {LEAD_STATUS_LABELS[s]}: {leads.filter((l) => l.status === s).length}
              </span>
            ))}
          </div>
          {leads.length === 0 ? (
            <p className="text-sm text-zinc-500">No leads yet.</p>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {leads.map((l) => (
                <Link key={l.id} to={`/admin/leads/${l.id}`} className="flex justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-600">
                  <span className="truncate text-zinc-200">{l.business_name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {LEAD_STATUS_LABELS[l.status]} · {new Date(l.updated_at).toLocaleDateString('en-ZA')}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-6 font-medium text-white">Contracts signed</h2>
          {agreements.length === 0 ? (
            <p className="text-sm text-zinc-500">None yet.</p>
          ) : (
            <div className="space-y-1.5">
              {agreements.map((a) => (
                <div key={a.id} className="flex justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
                  <span className="truncate text-zinc-200">{a.client.company_name || a.client.legal_name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatRand(a.monthly_fee)} · {new Date(a.signed_at).toLocaleDateString('en-ZA')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-medium text-white">Online log (last {LOG_DAYS} days)</h2>
          {byDay.size === 0 ? (
            <p className="text-sm text-zinc-500">No activity recorded.</p>
          ) : (
            <div className="space-y-3">
              {[...byDay.entries()].map(([day, list]) => (
                <div key={day} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-zinc-200">
                      {new Date(day).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-zinc-400">{formatDuration(onlineMs(list, 0))}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[...list].reverse().map((s) => (
                      <span key={s.id} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {clock(s.started_at)}–{s.ended_at || Date.now() - new Date(s.last_seen_at).getTime() > 3 * 60_000 ? clock(s.ended_at ?? s.last_seen_at) : 'now'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-6 font-medium text-white">Account</h2>
          <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-2">
            <label className="text-sm text-zinc-300">
              Full name
              <input className={inputClass} value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} />
            </label>
            <label className="text-sm text-zinc-300">
              Phone
              <input className={inputClass} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </label>
            <label className="text-sm text-zinc-300">
              Monthly target (contracts)
              <input inputMode="numeric" className={inputClass} value={edit.monthly_target} onChange={(e) => setEdit({ ...edit, monthly_target: e.target.value.replace(/\D/g, '') })} />
            </label>
            <label className="text-sm text-zinc-300">
              Access
              <select
                className={inputClass}
                disabled={rep.id === me?.id}
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value as 'sales' | 'admin' })}
              >
                <option value="sales">Sales rep — sales portal only</option>
                <option value="admin">Management — full access</option>
              </select>
            </label>
            {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
            {notice && <p className="text-sm text-green-400 sm:col-span-2">{notice}</p>}
            <div className="flex justify-end sm:col-span-2">
              <button onClick={save} className="rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-400">
                Save
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
