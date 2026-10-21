import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LEAD_STATUS_STYLES, StatCard } from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import { listAgreements } from '../../lib/clientsApi'
import { computeStats, formatRand, listLeads, todayIso, type SalesStats } from '../../lib/salesApi'
import { LEAD_STATUS_LABELS, type Lead } from '../../types'

export function SalesHome() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<SalesStats | null>(null)
  const [followUps, setFollowUps] = useState<Lead[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    Promise.all([listLeads(profile.id), listAgreements(profile.id)])
      .then(([leads, agreements]) => {
        setStats(computeStats(leads, agreements))
        const soon = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('en-CA')
        setFollowUps(
          leads
            .filter((l) => l.follow_up_date && l.follow_up_date <= soon && l.status !== 'won' && l.status !== 'lost')
            .sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!)),
        )
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your numbers.'))
  }, [profile])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const target = profile?.monthly_target ?? null
  const progress = stats && target ? Math.min(1, stats.contractsThisMonth / target) : null
  const today = todayIso()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">
        {greeting}, {profile?.display_name?.split(' ')[0] || profile?.username}
      </h1>
      <p className="mb-6 text-sm text-zinc-400">Here's how your month is going.</p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Signed this month"
          value={stats?.contractsThisMonth}
          hint={target ? `Target: ${target}` : undefined}
          tone="good"
        />
        <StatCard label="New monthly revenue" value={stats ? formatRand(stats.newMonthlyRevenue) : undefined} hint="Signed this month" />
        <StatCard label="Open leads" value={stats?.leadsOpen} hint={stats ? `${stats.leadsThisMonth} added this month` : undefined} />
        <StatCard
          label="Follow-ups due"
          value={stats?.followUpsDue}
          tone={stats?.followUpsDue ? 'warn' : undefined}
          hint="Today or overdue"
        />
      </div>

      {progress !== null && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-zinc-300">Monthly target</span>
            <span className="text-zinc-400">
              {stats!.contractsThisMonth} / {target} contracts
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/sales/pitch" className="rounded-xl bg-purple-500 p-5 text-white hover:bg-purple-400">
          <p className="text-lg font-semibold">▶ Start pitch</p>
          <p className="text-sm text-purple-100">Show a customer how it works</p>
        </Link>
        <Link to="/sales/projection" className="rounded-xl border border-zinc-700 p-5 hover:bg-zinc-900">
          <p className="text-lg font-semibold text-white">📈 Projection</p>
          <p className="text-sm text-zinc-400">Estimated views for their business</p>
        </Link>
        <Link to="/sales/leads/new" className="rounded-xl border border-zinc-700 p-5 hover:bg-zinc-900">
          <p className="text-lg font-semibold text-white">+ New lead</p>
          <p className="text-sm text-zinc-400">Capture a business you visited</p>
        </Link>
        <Link to="/sales/signup" className="rounded-xl border border-zinc-700 p-5 hover:bg-zinc-900">
          <p className="text-lg font-semibold text-white">✎ Sign a client</p>
          <p className="text-sm text-zinc-400">Contract signed on the tablet</p>
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-medium text-white">Follow-ups (next 7 days)</h2>
        {followUps.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing scheduled. Set follow-up dates on your leads.</p>
        ) : (
          <div className="space-y-2">
            {followUps.map((l) => (
              <Link
                key={l.id}
                to={`/sales/leads/${l.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-600"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">{l.business_name}</p>
                  <p className="text-sm text-zinc-400">{[l.contact_name, l.phone].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm ${l.follow_up_date! <= today ? 'text-amber-300' : 'text-zinc-300'}`}>
                    {l.follow_up_date === today ? 'Today' : l.follow_up_date! < today ? `Overdue (${l.follow_up_date})` : l.follow_up_date}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${LEAD_STATUS_STYLES[l.status]}`}>
                    {LEAD_STATUS_LABELS[l.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
