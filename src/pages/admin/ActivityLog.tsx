import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatCard } from '../../components/StatCard'
import { isStaffOnline, listStaff, listStaffActivity, listStaffSessions, staffName, timeAgo } from '../../lib/staffApi'
import type { Profile, StaffActivity, StaffActivityAction, StaffSession } from '../../types'

const ACTION_LABELS: Record<StaffActivityAction, string> = {
  sign_in: 'Signed in',
  sign_out: 'Signed out',
  client_added: 'Customer added',
  contract_signed: 'Contract signed',
  lead_added: 'Lead added',
  lead_status: 'Lead updated',
  ad_uploaded: 'Ad uploaded',
  ad_deleted: 'Ad deleted',
  ad_assigned: 'Ad put live',
}

const ACTION_STYLES: Record<StaffActivityAction, string> = {
  sign_in: 'bg-green-500/15 text-green-300',
  sign_out: 'bg-zinc-800 text-zinc-400',
  client_added: 'bg-sky-500/15 text-sky-300',
  contract_signed: 'bg-brand-500/20 text-brand-300',
  lead_added: 'bg-amber-500/15 text-amber-300',
  lead_status: 'bg-amber-500/10 text-amber-200',
  ad_uploaded: 'bg-pink-500/15 text-pink-300',
  ad_deleted: 'bg-red-500/15 text-red-300',
  ad_assigned: 'bg-pink-500/10 text-pink-200',
}

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
]

const selectClass =
  'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-400'

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })

function entityLink(item: StaffActivity) {
  if (!item.entity_id) return null
  if (item.entity_type === 'lead') return `/admin/leads/${item.entity_id}`
  if (item.entity_type === 'ad' && item.action !== 'ad_deleted') return `/admin/ads/${item.entity_id}`
  if (item.entity_type === 'client') return '/admin/clients'
  return null
}

/** One log line; also used on a salesperson's detail page. */
export function ActivityItem({ item, showName = false }: { item: StaffActivity; showName?: boolean }) {
  const to = entityLink(item)
  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
      <span className="w-12 shrink-0 pt-0.5 text-xs text-zinc-500">{clock(item.created_at)}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${ACTION_STYLES[item.action] ?? 'bg-zinc-800 text-zinc-300'}`}>
        {ACTION_LABELS[item.action] ?? item.action}
      </span>
      <span className="min-w-0 flex-1 text-zinc-200">
        {showName && (
          <span className="font-medium text-white">
            {item.user_id ? (
              <Link to={`/admin/sales-team/${item.user_id}`} className="hover:underline">
                {item.actor_name ?? 'Unknown'}
              </Link>
            ) : (
              <span title="Account deleted">{item.actor_name ?? 'Deleted user'}</span>
            )}
            {' · '}
          </span>
        )}
        {to ? (
          <Link to={to} className="hover:underline">
            {item.summary}
          </Link>
        ) : (
          item.summary
        )}
        {!showName && <span className="ml-2 text-xs text-zinc-500">{new Date(item.created_at).toLocaleDateString('en-ZA')}</span>}
      </span>
    </div>
  )
}

/** Management only: who is online, when people signed in, and what they did. */
export function ActivityLog() {
  const [staff, setStaff] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<StaffSession[]>([])
  const [activity, setActivity] = useState<StaffActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [person, setPerson] = useState('')
  const [action, setAction] = useState<StaffActivityAction | ''>('')

  const load = useCallback(async () => {
    try {
      const [s, ss, act] = await Promise.all([listStaff(), listStaffSessions(1), listStaffActivity(days)])
      setStaff(s)
      setSessions(ss)
      setActivity(act)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the logs.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const online = useMemo(
    () =>
      staff
        .filter((p) => p.active)
        .map((p) => ({ profile: p, session: sessions.find((s) => s.user_id === p.id) }))
        .filter(({ profile, session }) => isStaffOnline(profile, session)),
    [staff, sessions],
  )

  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const today = activity.filter((a) => new Date(a.created_at).getTime() >= startOfToday)
  const countToday = (kind: StaffActivityAction) => today.filter((a) => a.action === kind).length

  const shown = activity.filter((a) => (!person || a.user_id === person) && (!action || a.action === action))
  const byDay = new Map<string, StaffActivity[]>()
  for (const a of shown) {
    const key = new Date(a.created_at).toLocaleDateString('en-CA')
    byDay.set(key, [...(byDay.get(key) ?? []), a])
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-white">Logs</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Who's online, when they signed in, and every customer, contract, lead and ad they added. Refreshes every 30 seconds.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Online now" value={loading ? undefined : online.length} tone={online.length ? 'good' : undefined} />
        <StatCard label="Sign-ins today" value={loading ? undefined : countToday('sign_in')} />
        <StatCard label="Customers added today" value={loading ? undefined : countToday('client_added')} />
        <StatCard label="Contracts signed today" value={loading ? undefined : countToday('contract_signed')} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-medium text-white">Online now</h2>
        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : online.length === 0 ? (
          <p className="text-sm text-zinc-500">Nobody is online right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {online.map(({ profile: p, session }) => (
              <Link
                key={p.id}
                to={`/admin/sales-team/${p.id}`}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-600"
              >
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-white">{staffName(p)}</span>
                {session && <span className="text-xs text-zinc-500">since {clock(session.started_at)}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium text-white">Activity</h2>
          <div className="flex flex-wrap gap-2">
            <select className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Everyone</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {staffName(p)}
                  {p.active ? '' : ' (deactivated)'}
                </option>
              ))}
            </select>
            <select className={selectClass} value={action} onChange={(e) => setAction(e.target.value as StaffActivityAction | '')}>
              <option value="">All actions</option>
              {Object.entries(ACTION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-lg border border-zinc-700">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-2 text-sm ${days === r.days ? 'bg-white text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : byDay.size === 0 ? (
          <p className="text-sm text-zinc-500">Nothing logged for this filter.</p>
        ) : (
          <div className="space-y-5">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {dayLabel(list[0].created_at)} · {list.length}
                </p>
                <div className="space-y-1.5">
                  {list.map((a) => (
                    <ActivityItem key={a.id} item={a} showName />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && activity.length >= 1000 && (
          <p className="mt-3 text-xs text-zinc-500">Showing the latest 1,000 entries — narrow the range to see older ones.</p>
        )}
        {!loading && staff.length > 0 && (
          <p className="mt-6 text-xs text-zinc-500">
            Last seen:{' '}
            {staff
              .filter((p) => p.active)
              .map((p) => `${staffName(p)} ${timeAgo(p.last_seen_at)}`)
              .join(' · ')}
          </p>
        )}
      </section>
    </div>
  )
}
