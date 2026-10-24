import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { StatCard } from '../../components/StatCard'
import { listAgreements } from '../../lib/clientsApi'
import {
  addCost,
  addPayout,
  commissionFor,
  commissionToDate,
  contractStartMonth,
  deleteCost,
  deletePayout,
  earningFor,
  listCosts,
  listPayouts,
  monthKey,
  monthLabel,
  setAgreementEnded,
  shiftMonth,
  thisMonthKey,
} from '../../lib/financeApi'
import { formatRand } from '../../lib/salesApi'
import { listStaff, staffName } from '../../lib/staffApi'
import type { ClientAgreementWithClient, Cost, Payout, Profile } from '../../types'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-400'
const COST_CATEGORIES = ['Fuel', 'Mobile data', 'Driver fees', 'Maintenance', 'Tablets & hardware', 'Printing', 'Software', 'Other']
const TREND_MONTHS = 6

const today = () => new Date().toLocaleDateString('en-CA')
const money = (n: number) => formatRand(Math.round(n * 100) / 100)

/** Main admins: monthly earnings vs costs vs commission, and what each sales person is owed. */
export function Finance() {
  const [month, setMonth] = useState(thisMonthKey())
  const [agreements, setAgreements] = useState<ClientAgreementWithClient[]>([])
  const [staff, setStaff] = useState<Profile[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [costs, setCosts] = useState<Cost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', paidOn: today(), note: '' })
  const [costForm, setCostForm] = useState({ category: COST_CATEGORIES[0], description: '', amount: '' })

  const load = useCallback(async () => {
    try {
      const [a, s, p, c] = await Promise.all([listAgreements(), listStaff(), listPayouts(), listCosts()])
      setAgreements(a)
      setStaff(s)
      setPayouts(p)
      setCosts(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load finances.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<void>, done: string) => {
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(done)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const totals = (m: string) => {
    const earnings = agreements.reduce((sum, a) => sum + earningFor(a, m), 0)
    const cost = costs.filter((c) => monthKey(c.month) === m).reduce((sum, c) => sum + Number(c.amount), 0)
    const commission = agreements.reduce((sum, a) => sum + commissionFor(a, m), 0)
    const paid = payouts.filter((p) => monthKey(p.paid_on) === m).reduce((sum, p) => sum + Number(p.amount), 0)
    return { earnings, cost, commission, paid, net: earnings - cost - commission }
  }
  const current = totals(month)
  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonth(month, i - TREND_MONTHS + 1)).map((m) => ({ m, ...totals(m) }))
  const trendMax = Math.max(1, ...trend.map((t) => Math.max(t.earnings, t.cost + t.commission)))

  // What each sales person has earned (up to the selected month) and been paid.
  const reps = useMemo(() => {
    const ids = new Set([...agreements.map((a) => a.created_by), ...payouts.map((p) => p.user_id)].filter(Boolean) as string[])
    return [...ids]
      .map((id) => {
        const person = staff.find((s) => s.id === id)
        const mine = agreements.filter((a) => a.created_by === id)
        const earned = mine.reduce((sum, a) => sum + commissionToDate(a, month), 0)
        const paid = payouts
          .filter((p) => p.user_id === id && monthKey(p.paid_on) <= month)
          .reduce((sum, p) => sum + Number(p.amount), 0)
        return {
          id,
          name: person ? staffName(person) : 'Deleted user',
          contracts: mine.length,
          thisMonth: mine.reduce((sum, a) => sum + commissionFor(a, month), 0),
          earned,
          paid,
          owed: Math.max(0, earned - paid),
        }
      })
      .filter((r) => r.earned > 0 || r.paid > 0 || r.contracts > 0)
      .sort((a, b) => b.owed - a.owed)
  }, [agreements, payouts, staff, month])
  const totalOwed = reps.reduce((sum, r) => sum + r.owed, 0)

  const monthCosts = costs.filter((c) => monthKey(c.month) === month)
  const contracts = [...agreements].sort((a, b) => contractStartMonth(b).localeCompare(contractStartMonth(a)))

  const submitPayout = (e: FormEvent) => {
    e.preventDefault()
    if (!payFor) return
    const amount = Number(payForm.amount.replace(',', '.'))
    if (!(amount > 0)) return setError('Enter the amount paid.')
    void run(async () => {
      await addPayout(payFor, amount, payForm.paidOn, payForm.note)
      setPayFor(null)
    }, 'Payout recorded.')
  }

  const submitCost = (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(costForm.amount.replace(',', '.'))
    if (!(amount > 0)) return setError('Enter the cost amount.')
    void run(async () => {
      await addCost(month, costForm.category, costForm.description, amount)
      setCostForm({ ...costForm, description: '', amount: '' })
    }, 'Cost added.')
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Finance</h1>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Month
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputClass} w-auto`} />
        </label>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Earnings are the monthly fees of contracts running that month (from campaign start until an end date is set below).
        Commission follows each contract's terms from when it was signed.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-400">{notice}</p>}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={`Earnings · ${monthLabel(month)}`} value={money(current.earnings)} tone="good" />
        <StatCard label="Costs" value={money(current.cost)} />
        <StatCard label="Commission earned" value={money(current.commission)} hint={`${money(current.paid)} paid out this month`} />
        <StatCard label="Net profit" value={money(current.net)} tone={current.net < 0 ? 'warn' : 'good'} hint="Earnings − costs − commission" />
        <StatCard label="Payouts owed" value={money(totalOwed)} tone={totalOwed ? 'warn' : undefined} hint={`All sales people, to end of ${monthLabel(month)}`} />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-medium text-white">Last {TREND_MONTHS} months</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Earnings</th>
                <th className="px-4 py-3 text-right">Costs</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">Paid out</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="w-48 px-4 py-3">Earnings vs outgoings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {trend.map((t) => (
                <tr key={t.m} className={t.m === month ? 'bg-brand-500/10' : ''}>
                  <td className="px-4 py-3 text-zinc-200">{monthLabel(t.m)}</td>
                  <td className="px-4 py-3 text-right text-zinc-200">{money(t.earnings)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{money(t.cost)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{money(t.commission)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{money(t.paid)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${t.net < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(t.net)}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="h-2 rounded-full bg-logo-green" style={{ width: `${(t.earnings / trendMax) * 100}%` }} title="Earnings" />
                      <div className="flex h-2 overflow-hidden rounded-full" style={{ width: `${((t.cost + t.commission) / trendMax) * 100}%` }}>
                        <div className="bg-logo-red" style={{ flex: t.cost || 0.0001 }} title="Costs" />
                        <div className="bg-logo-gold" style={{ flex: t.commission || 0.0001 }} title="Commission" />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-logo-green" /> Earnings</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-logo-red" /> Costs</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-logo-gold" /> Commission</span>
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-medium text-white">Payouts owed</h2>
        {reps.length === 0 ? (
          <p className="text-sm text-zinc-500">No commission earned yet. Assign commission structures under Commissions.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Sales person</th>
                  <th className="px-4 py-3 text-right">Contracts</th>
                  <th className="px-4 py-3 text-right">Earned {monthLabel(month)}</th>
                  <th className="px-4 py-3 text-right">Earned to date</th>
                  <th className="px-4 py-3 text-right">Paid to date</th>
                  <th className="px-4 py-3 text-right">Owed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {reps.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-zinc-200">{r.name}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{r.contracts}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{money(r.thisMonth)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{money(r.earned)}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{money(r.paid)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.owed ? 'text-amber-300' : 'text-zinc-500'}`}>{money(r.owed)}</td>
                    <td className="px-4 py-3 text-right">
                      {payFor === r.id ? (
                        <form onSubmit={submitPayout} className="ml-auto grid max-w-xs gap-2 text-left">
                          <input autoFocus inputMode="decimal" placeholder="Amount (R)" className={inputClass} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value.replace(/[^\d.,]/g, '') })} />
                          <input type="date" className={inputClass} value={payForm.paidOn} onChange={(e) => setPayForm({ ...payForm, paidOn: e.target.value })} />
                          <input placeholder="Note (optional)" className={inputClass} value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setPayFor(null)} className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                              Cancel
                            </button>
                            <button className="rounded bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-on-accent hover:bg-brand-400">Save payout</button>
                          </div>
                        </form>
                      ) : (
                        r.id && (
                          <button
                            onClick={() => {
                              setPayFor(r.id)
                              setPayForm({ amount: r.owed ? String(Math.round(r.owed * 100) / 100) : '', paidOn: today(), note: '' })
                            }}
                            className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                          >
                            Record payout
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payouts.length > 0 && (
          <details className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
            <summary className="cursor-pointer text-zinc-300">Payout history ({payouts.length})</summary>
            <div className="mt-3 space-y-1.5">
              {payouts.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950 px-3 py-2">
                  <span className="text-zinc-300">
                    {new Date(p.paid_on).toLocaleDateString('en-ZA')} · {staffName(staff.find((s) => s.id === p.user_id))} · {money(Number(p.amount))}
                    {p.note && <span className="text-zinc-500"> · {p.note}</span>}
                  </span>
                  <button
                    onClick={() => confirm('Delete this payout record?') && void run(() => deletePayout(p.id), 'Payout deleted.')}
                    className="text-xs text-red-300 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-medium text-white">Costs · {monthLabel(month)}</h2>
        <form onSubmit={submitCost} className="mb-3 grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-[1fr_2fr_1fr_auto]">
          <select className={inputClass} value={costForm.category} onChange={(e) => setCostForm({ ...costForm, category: e.target.value })}>
            {COST_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input placeholder="Description (optional)" className={inputClass} value={costForm.description} onChange={(e) => setCostForm({ ...costForm, description: e.target.value })} />
          <input inputMode="decimal" placeholder="Amount (R)" className={inputClass} value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value.replace(/[^\d.,]/g, '') })} />
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-accent hover:bg-brand-400">+ Add cost</button>
        </form>
        {monthCosts.length === 0 ? (
          <p className="text-sm text-zinc-500">No costs recorded for {monthLabel(month)}.</p>
        ) : (
          <div className="space-y-1.5">
            {monthCosts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm">
                <span className="text-zinc-200">
                  {c.category}
                  {c.description && <span className="text-zinc-500"> · {c.description}</span>}
                </span>
                <span className="flex items-center gap-4">
                  <b className="text-zinc-200">{money(Number(c.amount))}</b>
                  <button
                    onClick={() => confirm('Delete this cost?') && void run(() => deleteCost(c.id), 'Cost deleted.')}
                    className="text-xs text-red-300 hover:underline"
                  >
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-medium text-white">Contracts</h2>
        <p className="mb-3 text-sm text-zinc-500">Set an end date when a customer stops advertising — their fee stops counting after that month.</p>
        {contracts.length === 0 ? (
          <p className="text-sm text-zinc-500">No contracts signed yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Sales person</th>
                  <th className="px-4 py-3 text-right">Monthly fee</th>
                  <th className="px-4 py-3">Runs from</th>
                  <th className="px-4 py-3">Commission terms</th>
                  <th className="px-4 py-3">Ended on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {contracts.map((a) => (
                  <tr key={a.id} className={a.ended_on ? 'opacity-60' : ''}>
                    <td className="px-4 py-3 text-zinc-200">{a.client.company_name || a.client.legal_name}</td>
                    <td className="px-4 py-3 text-zinc-400">{staffName(staff.find((s) => s.id === a.created_by))}</td>
                    <td className="px-4 py-3 text-right text-zinc-200">{formatRand(a.monthly_fee)}</td>
                    <td className="px-4 py-3 text-zinc-400">{monthLabel(contractStartMonth(a))}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {a.commission_kind
                        ? `${a.commission_kind === 'percent' ? `${a.commission_rate}%` : formatRand(a.commission_rate)} × ${a.commission_months} mo`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        className={`${inputClass} w-40`}
                        value={a.ended_on ?? ''}
                        onChange={(e) => void run(() => setAgreementEnded(a.id, e.target.value || null), e.target.value ? 'Contract end date saved.' : 'Contract is running again.')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
