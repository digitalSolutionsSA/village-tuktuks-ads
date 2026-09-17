import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_CUSTOMERS,
  getCustomerStats,
  MEAN_IMPRESSION_INTERVAL_SECONDS,
  tuktukLabel,
  type DailyImpressions,
} from '../../lib/demoStats'
import { TUKTUK_COUNT } from '../../types'

interface ActivityEvent {
  id: string
  tuktukId: number
  at: number
}

/** Poisson-ish inter-arrival delay (ms) averaging meanSeconds, bounded so it never feels stuck or spammy. */
function nextDelayMs(meanSeconds: number) {
  const raw = -Math.log(1 - Math.random()) * meanSeconds
  const clamped = Math.min(Math.max(raw, meanSeconds * 0.25), meanSeconds * 3)
  return clamped * 1000
}

function timeAgo(fromMs: number, nowMs: number) {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (seconds < 3) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

export function Statistics() {
  const [customerId, setCustomerId] = useState(DEMO_CUSTOMERS[0].id)
  const customer = DEMO_CUSTOMERS.find((c) => c.id === customerId) ?? DEMO_CUSTOMERS[0]
  const baseStats = useMemo(() => getCustomerStats(customer.id), [customer.id])

  const [days, setDays] = useState<DailyImpressions[]>(baseStats.days)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [justUpdatedTuktuk, setJustUpdatedTuktuk] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const timeoutRef = useRef<number | null>(null)
  const highlightTimeoutRef = useRef<number | null>(null)

  // Reset the live feed whenever the selected customer changes.
  useEffect(() => {
    setDays(baseStats.days)
    setActivity([])
  }, [baseStats])

  // Keep "Xs ago" labels fresh.
  useEffect(() => {
    const clock = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  // One event = one ad play on one tuk-tuk. Paced to the platform's real
  // rotation: 50 customers sharing a 10s ad slot per tuk-tuk means this
  // customer's ad reappears on a given tuk-tuk every 500s, or ~every
  // MEAN_IMPRESSION_INTERVAL_SECONDS across the whole 16-tuk-tuk fleet.
  useEffect(() => {
    const scheduleNext = () => {
      timeoutRef.current = window.setTimeout(() => {
        const tuktukIdx = Math.floor(Math.random() * TUKTUK_COUNT)

        setDays((prev) => {
          if (!prev.length) return prev
          const lastIndex = prev.length - 1
          return prev.map((day, i) =>
            i === lastIndex
              ? {
                  ...day,
                  total: day.total + 1,
                  byTuktuk: day.byTuktuk.map((v, j) => (j === tuktukIdx ? v + 1 : v)),
                }
              : day,
          )
        })
        setActivity((prev) => [{ id: `${Date.now()}-${tuktukIdx}`, tuktukId: tuktukIdx + 1, at: Date.now() }, ...prev].slice(0, 6))

        setJustUpdatedTuktuk(tuktukIdx + 1)
        if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current = window.setTimeout(() => setJustUpdatedTuktuk(null), 1200)

        scheduleNext()
      }, nextDelayMs(MEAN_IMPRESSION_INTERVAL_SECONDS))
    }
    scheduleNext()
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current)
    }
  }, [baseStats])

  const derived = useMemo(() => {
    const totalImpressions = days.reduce((sum, d) => sum + d.total, 0)
    const totalsByTuktuk = Array.from({ length: TUKTUK_COUNT }, (_, i) => ({
      tuktukId: i + 1,
      label: tuktukLabel(i + 1),
      total: days.reduce((sum, d) => sum + d.byTuktuk[i], 0),
    })).sort((a, b) => b.total - a.total)
    const bestDay = days.length ? [...days].sort((a, b) => b.total - a.total)[0] : null
    const bestTuktuk = totalsByTuktuk[0]
    const avgPerDay = Math.round(totalImpressions / (days.length || 1))
    return { totalImpressions, totalsByTuktuk, bestDay, bestTuktuk, avgPerDay }
  }, [days])

  const maxDay = Math.max(...days.map((d) => d.total), 1)
  const maxTuktuk = derived.totalsByTuktuk[0]?.total ?? 1

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Statistics</h1>
        <span className="flex items-center gap-1.5 rounded bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live
        </span>
      </div>
      <p className="mb-6 text-sm text-zinc-400">Ad performance across the Village Tuk-Tuks fleet.</p>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
          >
            {DEMO_CUSTOMERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-zinc-500">{customer.contact}</p>
      </div>

      <p className="mb-3 text-sm font-medium text-zinc-300">Last 7 days · all 16 tuk-tuks</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total impressions" value={derived.totalImpressions.toLocaleString()} />
        <StatCard label="Avg. per day" value={derived.avgPerDay.toLocaleString()} />
        <StatCard
          label="Best day"
          value={derived.bestDay ? `${derived.bestDay.label} · ${derived.bestDay.total.toLocaleString()}` : '—'}
        />
        <StatCard
          label="Top tuk-tuk"
          value={derived.bestTuktuk ? `${derived.bestTuktuk.label} · ${derived.bestTuktuk.total.toLocaleString()}` : '—'}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-4 text-sm font-medium text-zinc-300">Impressions per day</p>
            <div className="flex h-48 items-end justify-between gap-2">
              {days.map((day) => (
                <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-medium tabular-nums text-zinc-300">
                    {day.total.toLocaleString()}
                  </span>
                  <div
                    className="w-full rounded-t bg-purple-500 transition-[height] duration-700 ease-out"
                    style={{ height: `${Math.max(4, (day.total / maxDay) * 100)}%` }}
                  />
                  <span className="text-xs text-zinc-500">{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-4 text-sm font-medium text-zinc-300">Impressions by tuk-tuk (last 7 days)</p>
            <div className="space-y-2">
              {derived.totalsByTuktuk.map((t) => (
                <div
                  key={t.tuktukId}
                  className={`flex items-center gap-3 rounded-md px-1.5 py-1 transition-colors duration-500 ${
                    justUpdatedTuktuk === t.tuktukId ? 'bg-emerald-500/10' : ''
                  }`}
                >
                  <span className="w-24 shrink-0 text-xs text-zinc-400">{t.label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.max(2, (t.total / maxTuktuk) * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-300">
                    {t.total.toLocaleString()}
                  </span>
                  {justUpdatedTuktuk === t.tuktukId && <span className="shrink-0 text-xs text-emerald-400">+1</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-4 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live activity
          </p>
          {activity.length === 0 ? (
            <p className="text-sm text-zinc-500">Waiting for the next play…</p>
          ) : (
            <div className="space-y-2">
              {activity.map((event, i) => (
                <div
                  key={event.id}
                  className={`rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300 ${
                    i === 0 ? 'live-row-in' : ''
                  }`}
                >
                  <span className="font-medium text-white">{tuktukLabel(event.tuktukId)}</span> played your ad
                  <p className="mt-0.5 text-zinc-500">{timeAgo(event.at, nowTick)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white transition-all duration-300">{value ?? '—'}</p>
    </div>
  )
}
