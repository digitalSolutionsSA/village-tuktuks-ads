import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ADVERTISING_AREAS, EXTRA_AREA_FEE } from '../../lib/agreementText'
import { getLead } from '../../lib/salesApi'

/**
 * "What would my ad get?" — a clearly-labelled projection for a prospect, Standard
 * and Premium side by side. The figures are fixed assumptions; the only thing the
 * rep picks is which areas the ad runs in, and each extra area multiplies the
 * numbers. Both packages play equally often; Premium's longer ad doubles the time
 * on screen. Never presented as actual results (agreement clause 6).
 * Part of the pitch page (#projection); `?lead=<id>` pre-fills it from a lead.
 */

const PLAY_EVERY_SECONDS = 500
const HOURS_PER_DAY = 12
const SCREENS_PER_AREA = 5
const DAYS_PER_MONTH = 30
const PLAYS_PER_AREA_PER_DAY = ((HOURS_PER_DAY * 3600) / PLAY_EVERY_SECONDS) * SCREENS_PER_AREA

/** `fee` covers one area; every extra area adds EXTRA_AREA_FEE a month. */
const PACKAGES = [
  { name: 'Standard', adSeconds: 5, fee: 950, head: 'bg-brand-600', accent: 'text-brand-300', ring: 'border-brand-500/60' },
  { name: 'Premium', adSeconds: 10, fee: 1450, head: 'bg-logo-red', accent: 'text-red-300', ring: 'border-logo-red/60' },
] as const

const rand = (n: number) => `R${n.toLocaleString('en-US')}`

/** Seconds as "36 min", "1 h 12 min" or "18 h". */
const formatDuration = (seconds: number) => {
  const totalMin = Math.round(seconds / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

type Area = (typeof ADVERTISING_AREAS)[number]

const matchArea = (value: string | null | undefined) =>
  ADVERTISING_AREAS.find((a) => a.toLowerCase() === value?.toLowerCase())

export function ProjectionSection({ heading }: { heading: ReactNode }) {
  const [params] = useSearchParams()
  const leadId = params.get('lead')
  const [name, setName] = useState(params.get('name') ?? '')
  const [areas, setAreas] = useState<Area[]>(() => [matchArea(params.get('area')) ?? ADVERTISING_AREAS[0]])

  // Pre-fill from the lead the rep is working on.
  useEffect(() => {
    if (!leadId) return
    getLead(leadId)
      .then((l) => {
        if (!l) return
        setName((n) => n || l.business_name)
        const match = matchArea(l.area)
        if (match) setAreas([match])
      })
      .catch(() => {})
  }, [leadId])

  // Always keep at least one area selected.
  const toggleArea = (a: Area) =>
    setAreas((cur) => (cur.includes(a) ? (cur.length > 1 ? cur.filter((x) => x !== a) : cur) : [...cur, a]))

  const screens = SCREENS_PER_AREA * areas.length
  const extraAreas = areas.length - 1
  const playsPerDay = PLAYS_PER_AREA_PER_DAY * areas.length
  const playsPerMonth = playsPerDay * DAYS_PER_MONTH

  const label = name.trim() || 'Your business'
  const areaList = areas.length === 1 ? areas[0] : `${areas.slice(0, -1).join(', ')} and ${areas[areas.length - 1]}`

  const signupHref = leadId ? `/admin/signup?lead=${leadId}` : '/admin/signup'
  const fmt = (n: number) => Math.round(n).toLocaleString('en-ZA')

  return (
    <div id="projection" className="scroll-mt-36">
      {heading}

      <div data-reveal className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <label className="text-sm text-zinc-300">
            The customer's business name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Thandi's Boutique"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-brand-400"
            />
          </label>
          <div className="text-sm text-zinc-300">
            Areas <span className="text-zinc-500">(pick one or more)</span>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ADVERTISING_AREAS.map((a) => {
                const on = areas.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleArea(a)}
                    className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                      on ? 'border-logo-gold bg-logo-gold/20 text-white' : 'border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div data-reveal className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-200">
        <b>Projection</b> — estimated figures for illustration, not actual results. Real plays vary with routes and
        operating hours.
      </div>

      <div data-reveal="scale" className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 sm:p-10">
        <div className="brand-stripe absolute inset-x-0 top-0" aria-hidden />
        <p className="text-sm uppercase tracking-widest text-on-accent/75">Projected for</p>
        <h2 className="mb-1 text-3xl font-bold text-on-accent sm:text-4xl">{label}</h2>
        <p className="mb-6 text-on-accent/80">
          in {areaList} · {screens} screens, your ad every {PLAY_EVERY_SECONDS} seconds, {HOURS_PER_DAY} hours a day
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {PACKAGES.map((p) => (
            <div key={p.name} className={`overflow-hidden rounded-2xl border-2 ${p.ring} bg-zinc-900`}>
              <div className={`${p.head} px-5 py-3 text-center text-on-accent`}>
                <p className="text-lg font-extrabold uppercase">{p.name}</p>
                <p className="text-xs font-semibold uppercase opacity-90">{p.adSeconds} seconds per play</p>
              </div>
              <div className="border-b border-zinc-800 px-5 pt-5 pb-4 text-center sm:px-6">
                <p className={`text-[clamp(2rem,4.5vw,3rem)] font-black tabular-nums leading-none ${p.accent}`}>
                  {rand(p.fee + extraAreas * EXTRA_AREA_FEE)}
                  <span className="ml-1 text-sm font-semibold text-zinc-400">per month</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {extraAreas
                    ? `${rand(p.fee)} + ${rand(EXTRA_AREA_FEE)} × ${extraAreas} extra ${extraAreas === 1 ? 'area' : 'areas'}`
                    : `Includes one area · ${rand(EXTRA_AREA_FEE)} per extra area`}
                  {' · '}±R{((p.fee + extraAreas * EXTRA_AREA_FEE) / playsPerMonth).toFixed(2)} per play
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:p-6">
                <div>
                  <p className={`text-[clamp(1.75rem,4vw,2.75rem)] font-black tabular-nums leading-none ${p.accent}`}>{fmt(playsPerDay)}</p>
                  <p className="text-sm text-zinc-400">plays per day</p>
                </div>
                <div>
                  <p className={`text-[clamp(1.75rem,4vw,2.75rem)] font-black tabular-nums leading-none ${p.accent}`}>{fmt(playsPerMonth)}</p>
                  <p className="text-sm text-zinc-400">plays per month</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums text-white sm:text-2xl">{formatDuration(playsPerDay * p.adSeconds)}</p>
                  <p className="text-sm text-zinc-400">on screen per day</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums text-white sm:text-2xl">{formatDuration(playsPerMonth * p.adSeconds)}</p>
                  <p className="text-sm text-zinc-400">on screen per month</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div data-reveal className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-6 text-center">
        <p className="mb-4 text-lg text-white">Want these screens working for {name.trim() || 'your business'}?</p>
        <Link
          to={signupHref}
          className="inline-block rounded-xl bg-green-600 px-8 py-4 text-lg font-semibold text-on-accent hover:bg-green-500"
        >
          ✎ Sign up now
        </Link>
      </div>
    </div>
  )
}
