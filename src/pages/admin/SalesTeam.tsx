import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { StatCard } from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import { listAgreements } from '../../lib/clientsApi'
import { computeStats, formatRand, listLeads } from '../../lib/salesApi'
import {
  createStaff,
  formatDuration,
  isStaffOnline,
  listStaff,
  listStaffSessions,
  onlineMs,
  setStaffActive,
  setStaffPassword,
  timeAgo,
  type NewStaffInput,
} from '../../lib/staffApi'
import type { ClientAgreementWithClient, Lead, Profile, StaffSession } from '../../types'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400'

const emptyForm = (): NewStaffInput => ({
  username: '',
  password: '',
  display_name: '',
  role: 'sales',
  phone: '',
  monthly_target: '',
})

export function SalesTeam() {
  const { profile: me } = useAuth()
  const [staff, setStaff] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<StaffSession[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [agreements, setAgreements] = useState<ClientAgreementWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewStaffInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, ss, l, a] = await Promise.all([listStaff(), listStaffSessions(7), listLeads(), listAgreements()])
      setStaff(s)
      setSessions(ss)
      setLeads(l)
      setAgreements(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the sales team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // Keep the online dots fresh while management watches the page.
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const weekAgo = Date.now() - 7 * 86_400_000
  const rows = useMemo(
    () =>
      staff.map((p) => {
        const mine = sessions.filter((s) => s.user_id === p.id)
        return {
          profile: p,
          online: isStaffOnline(p, mine[0]),
          weekOnline: onlineMs(mine, weekAgo),
          stats: computeStats(
            leads.filter((l) => l.owner_id === p.id),
            agreements.filter((a) => a.created_by === p.id),
          ),
        }
      }),
    [staff, sessions, leads, agreements, weekAgo],
  )
  const team = computeStats(leads, agreements)
  const onlineCount = rows.filter((r) => r.online).length
  const shown = rows
    .filter((r) => showInactive || r.profile.active)
    .sort((a, b) => Number(b.online) - Number(a.online) || b.stats.contractsThisMonth - a.stats.contractsThisMonth)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      await createStaff(form)
      setNotice(
        `Account created. ${form.display_name} signs in at /sales/login with username "${form.username.trim().toLowerCase()}" and the password you set.`,
      )
      setForm(emptyForm())
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the account.')
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async (p: Profile) => {
    const pw = prompt(`New password for ${p.display_name || p.username} (at least 8 characters):`)
    if (!pw) return
    setError(null)
    setNotice(null)
    try {
      await setStaffPassword(p.id, pw)
      setNotice(`Password changed for ${p.display_name || p.username}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change the password.')
    }
  }

  const toggleActive = async (p: Profile) => {
    const verb = p.active ? 'Deactivate' : 'Reactivate'
    if (!confirm(`${verb} ${p.display_name || p.username}? ${p.active ? 'They will be signed out and unable to log in.' : ''}`)) return
    setError(null)
    try {
      await setStaffActive(p.id, !p.active)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${verb.toLowerCase()}.`)
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Sales team</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-400"
        >
          {showForm ? 'Close' : '+ Add salesperson'}
        </button>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Reps sign in at <span className="text-zinc-200">/sales/login</span> with the username you give them. They only
        see the sales portal — never tuk-tuks, ads or drivers.
      </p>

      {showForm && (
        <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-3">
          <label className="text-sm text-zinc-300">
            Full name *
            <input required className={inputClass} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </label>
          <label className="text-sm text-zinc-300">
            Username *
            <input
              required
              autoCapitalize="none"
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,29}"
              title="3–30 letters, numbers, dots, dashes or underscores"
              placeholder="e.g. thabo.m"
              className={inputClass}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '') })}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Password * <span className="text-zinc-500">(min 8)</span>
            <input required minLength={8} className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="text-sm text-zinc-300">
            Phone
            <input type="tel" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="text-sm text-zinc-300">
            Monthly target (contracts)
            <input inputMode="numeric" className={inputClass} value={form.monthly_target} onChange={(e) => setForm({ ...form, monthly_target: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label className="text-sm text-zinc-300">
            Access
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as NewStaffInput['role'] })}>
              <option value="sales">Sales rep — sales portal only</option>
              <option value="admin">Management — full access</option>
            </select>
          </label>
          <div className="flex justify-end sm:col-span-3">
            <button disabled={saving} className="rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-400">{notice}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Online now" value={loading ? undefined : `${onlineCount} / ${rows.filter((r) => r.profile.active).length}`} tone={onlineCount ? 'good' : undefined} />
        <StatCard label="Signed this month" value={loading ? undefined : team.contractsThisMonth} />
        <StatCard label="New monthly revenue" value={loading ? undefined : formatRand(team.newMonthlyRevenue)} hint="Signed this month" />
        <StatCard label="Open leads" value={loading ? undefined : team.leadsOpen} hint={loading ? undefined : `${team.leadsThisMonth} new this month`} />
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show deactivated accounts
      </label>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-zinc-500">No sales staff yet. Add your first salesperson above.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Open leads</th>
                <th className="px-4 py-3 text-right">Signed (month / all)</th>
                <th className="px-4 py-3 text-right">New revenue</th>
                <th className="px-4 py-3 text-right">Online (7 days)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {shown.map(({ profile: p, online, weekOnline, stats }) => (
                <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <Link to={`/admin/sales-team/${p.id}`} className="font-medium text-white hover:underline">
                      {p.display_name || p.username || p.email}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {p.username ? `@${p.username}` : p.email}
                      {p.role === 'admin' && <span className="ml-2 rounded bg-purple-500/20 px-1.5 text-purple-300">management</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {!p.active ? (
                      <span className="text-zinc-500">Deactivated</span>
                    ) : online ? (
                      <span className="flex items-center gap-1.5 text-green-400">
                        <span className="h-2 w-2 rounded-full bg-green-500" /> Online
                      </span>
                    ) : (
                      <span className="text-zinc-400">Last seen {timeAgo(p.last_seen_at)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-200">{stats.leadsOpen}</td>
                  <td className="px-4 py-3 text-right text-zinc-200">
                    {stats.contractsThisMonth}
                    {p.monthly_target ? <span className="text-zinc-500"> of {p.monthly_target}</span> : null} / {stats.contractsTotal}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-200">{formatRand(stats.newMonthlyRevenue)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{weekOnline ? formatDuration(weekOnline) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => resetPassword(p)} className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                        Reset password
                      </button>
                      {p.id !== me?.id && (
                        <button onClick={() => toggleActive(p)} className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                          {p.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
