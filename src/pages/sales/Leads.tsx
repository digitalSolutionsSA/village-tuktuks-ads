import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LEAD_STATUS_STYLES } from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import { formatRand, listLeads, todayIso } from '../../lib/salesApi'
import { listStaff, staffName } from '../../lib/staffApi'
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type Lead, type LeadStatus, type Profile } from '../../types'

/** Lead list. In the sales portal: the rep's own leads. In management: everyone's, filterable by rep. */
export function Leads() {
  const { profile } = useAuth()
  const inSales = useLocation().pathname.startsWith('/sales')
  const base = inSales ? '/sales' : '/admin'
  const [leads, setLeads] = useState<Lead[]>([])
  const [staff, setStaff] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<LeadStatus | 'open' | 'all'>('open')
  const [owner, setOwner] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    listLeads(inSales ? profile?.id : undefined)
      .then(setLeads)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load leads.'))
      .finally(() => setLoading(false))
    if (!inSales) listStaff().then(setStaff).catch(() => {})
  }, [inSales, profile?.id])

  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff])
  const today = todayIso()
  const q = search.trim().toLowerCase()
  const shown = leads.filter(
    (l) =>
      (status === 'all' ||
        (status === 'open' ? l.status !== 'won' && l.status !== 'lost' : l.status === status)) &&
      (!owner || l.owner_id === owner) &&
      (!q ||
        [l.business_name, l.contact_name, l.phone, l.email, l.area]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))),
  )
  const count = (s: LeadStatus) => leads.filter((l) => l.status === s).length

  const chip = (value: typeof status, label: string) => (
    <button
      key={value}
      onClick={() => setStatus(value)}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        status === value ? 'border-purple-400 bg-purple-500/20 text-white' : 'border-zinc-700 text-zinc-400'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">{inSales ? 'My leads' : 'All leads'}</h1>
        <Link
          to={`${base}/leads/new`}
          className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-medium text-white hover:bg-purple-400"
        >
          + New lead
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {chip('open', `Open (${leads.length - count('won') - count('lost')})`)}
        {LEAD_STATUSES.map((s) => chip(s, `${LEAD_STATUS_LABELS[s]} (${count(s)})`))}
        {chip('all', `All (${leads.length})`)}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business, contact, phone or area"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400"
        />
        {!inSales && (
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"
          >
            <option value="">All reps</option>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {staffName(p)}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {leads.length === 0 ? 'No leads yet. Add every business you speak to.' : 'No leads match.'}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((l) => {
            const overdue =
              l.follow_up_date && l.follow_up_date <= today && l.status !== 'won' && l.status !== 'lost'
            return (
              <Link
                key={l.id}
                to={`${base}/leads/${l.id}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{l.business_name}</p>
                    <p className="text-sm text-zinc-400">
                      {[l.contact_name, l.phone, l.area].filter(Boolean).join(' · ') || 'No contact details'}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {!inSales && `${staffName(staffById.get(l.owner_id ?? ''))} · `}
                      {l.estimated_value !== null && `${formatRand(l.estimated_value)}/month · `}
                      Updated {new Date(l.updated_at).toLocaleDateString('en-ZA')}
                      {l.follow_up_date && (
                        <span className={overdue ? 'text-amber-300' : ''}>
                          {' '}
                          · Follow up {l.follow_up_date === today ? 'today' : l.follow_up_date}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${LEAD_STATUS_STYLES[l.status]}`}>
                    {LEAD_STATUS_LABELS[l.status]}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
