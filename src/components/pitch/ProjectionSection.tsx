import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { ADVERTISING_AREAS } from '../../lib/agreementText'
import { DEMO_ADS, DEMO_TUKTUKS } from '../../lib/demoData'
import { getLead } from '../../lib/salesApi'
import type { Ad, Tuktuk, TuktukGroup } from '../../types'

/**
 * "What would my ad get?" — a clearly-labelled projection for a prospect, built
 * from the real fleet and today's real ad rotation plus a few stated
 * assumptions the rep can adjust. Never presented as actual results
 * (agreement clause 6), and never attached to another business's name.
 * Part of the pitch page (#projection); `?lead=<id>` pre-fills it from a lead.
 */

const AD_SECONDS = 10
const SLOT_OPTIONS = [
  { seconds: 5, label: 'Standard · 5s' },
  { seconds: 10, label: 'Premium · 10s' },
] as const
const BUSINESS_TYPES = [
  'Clothing store',
  'Restaurant / takeaway',
  'Hair & beauty salon',
  'Pharmacy',
  'Butchery',
  'Hardware store',
  'Car wash',
  'Mechanic / auto parts',
  'Supermarket / spaza',
  'Church / event',
  'School / training',
  'Property / estate agent',
]

type Mode = 'own' | 'example'

export function ProjectionSection({ heading }: { heading: ReactNode }) {
  const [params] = useSearchParams()
  const leadId = params.get('lead')
  const [mode, setMode] = useState<Mode>('own')
  const [slotSeconds, setSlotSeconds] = useState<number>(AD_SECONDS)
  const [name, setName] = useState(params.get('name') ?? '')
  const [type, setType] = useState(BUSINESS_TYPES[0])
  const [area, setArea] = useState<string>(params.get('area') ?? 'All areas')
  const [hoursPerDay, setHoursPerDay] = useState(12)
  const [passengers, setPassengers] = useState(2)
  const [occupancy, setOccupancy] = useState(50)

  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [groups, setGroups] = useState<TuktukGroup[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setTuktuks(DEMO_TUKTUKS)
      setAds(DEMO_ADS)
      return
    }
    supabase.from('tuktuks').select('*').eq('active', true).then(({ data }) => setTuktuks((data as Tuktuk[]) ?? []))
    supabase.from('tuktuk_groups').select('*').then(({ data }) => setGroups((data as TuktukGroup[]) ?? []))
    supabase
      .from('creatives')
      .select('id, duration_seconds')
      .eq('is_active', true)
      .then(({ data }) => setAds((data as Ad[]) ?? []))
  }, [])

  // Pre-fill from the lead the rep is working on.
  useEffect(() => {
    if (!leadId) return
    getLead(leadId)
      .then((l) => {
        if (!l) return
        setName((n) => n || l.business_name)
        const match = ADVERTISING_AREAS.find((a) => a.toLowerCase() === l.area?.toLowerCase())
        if (match) setArea(match)
      })
      .catch(() => {})
  }, [leadId])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Screens in the chosen area: tuk-tuks in a group named after the area, else the whole active fleet.
  const { screens, areaMatched } = useMemo(() => {
    if (area === 'All areas') return { screens: tuktuks.length, areaMatched: false }
    const groupIds = new Set(groups.filter((g) => g.name.toLowerCase().includes(area.toLowerCase())).map((g) => g.id))
    const inArea = tuktuks.filter((t) => t.group_id && groupIds.has(t.group_id)).length
    return { screens: inArea || tuktuks.length, areaMatched: inArea > 0 }
  }, [area, tuktuks, groups])

  const rotationSeconds = ads.reduce((s, a) => s + (a.duration_seconds || AD_SECONDS), 0) + slotSeconds
  const playsPerScreenPerDay = Math.floor((hoursPerDay * 3600) / rotationSeconds)
  const playsPerDay = playsPerScreenPerDay * screens
  // Only plays with someone on board count as views.
  const viewsPerDay = Math.round(playsPerDay * (occupancy / 100) * passengers)
  const perMonth = (n: number) => n * 30

  // Live counter: projected plays so far today, assuming the operating day starts at 06:00.
  const dayStart = new Date(now)
  dayStart.setHours(6, 0, 0, 0)
  const elapsed = Math.min(Math.max(0, (now - dayStart.getTime()) / 1000), hoursPerDay * 3600)
  const playsSoFar = Math.floor((elapsed / (hoursPerDay * 3600)) * playsPerDay)
  const operating = elapsed > 0 && elapsed < hoursPerDay * 3600

  const label =
    mode === 'own'
      ? name.trim() || 'Your business'
      : `${type} in ${area === 'All areas' ? 'your area' : area} (example)`

  const signupHref = leadId ? `/admin/signup?lead=${leadId}` : '/admin/signup'
  const fmt = (n: number) => n.toLocaleString('en-ZA')

  return (
    <div id="projection" className="scroll-mt-36">
      {heading}

      <div data-reveal className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ['own', "Customer's business"],
              ['example', 'A business like yours'],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg border px-3 py-3 text-sm font-medium ${
                mode === m ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-zinc-700 text-zinc-400'
              }`}
            >
              {text}
            </button>
          ))}
          <div className="flex flex-1 gap-2">
            {SLOT_OPTIONS.map((o) => (
              <button
                key={o.seconds}
                onClick={() => setSlotSeconds(o.seconds)}
                className={`flex-1 rounded-lg border px-3 py-3 text-sm font-medium ${
                  slotSeconds === o.seconds ? 'border-logo-gold bg-logo-gold/20 text-white' : 'border-zinc-700 text-zinc-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {mode === 'own' ? (
            <label className="text-sm text-zinc-300">
              The customer's business name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Thandi's Boutique"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-brand-400"
              />
            </label>
          ) : (
            <label className="text-sm text-zinc-300">
              Type of business
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white"
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm text-zinc-300">
            Area
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white"
            >
              <option>All areas</option>
              {ADVERTISING_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm text-zinc-300">
              Hours/day
              <input
                type="number"
                min={1}
                max={24}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white"
              />
            </label>
            <label className="text-sm text-zinc-300">
              Per trip
              <input
                type="number"
                min={1}
                max={6}
                value={passengers}
                onChange={(e) => setPassengers(Math.min(6, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white"
              />
            </label>
            <label className="text-sm text-zinc-300">
              % time full
              <input
                type="number"
                min={5}
                max={100}
                step={5}
                value={occupancy}
                onChange={(e) => setOccupancy(Math.min(100, Math.max(5, Number(e.target.value) || 5)))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white"
              />
            </label>
          </div>
        </div>
      </div>

      <div data-reveal className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-200">
        <b>Projection</b> — estimated figures for illustration, not actual results. Real plays and views vary with routes,
        operating hours and passenger numbers.
      </div>

      <div data-reveal="scale" className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 sm:p-10 lg:p-14">
        <div className="brand-stripe absolute inset-x-0 top-0" aria-hidden />
        <p className="text-sm uppercase tracking-widest text-on-accent/75">Projected for</p>
        <h2 className="mb-5 text-3xl font-bold text-on-accent sm:text-4xl">{label}</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-[clamp(2.25rem,5vw,3.75rem)] font-black tabular-nums leading-none text-on-accent">{fmt(playsPerDay)}</p>
            <p className="text-on-accent/80">plays per day</p>
          </div>
          <div>
            <p className="text-[clamp(2.25rem,5vw,3.75rem)] font-black tabular-nums leading-none text-on-accent">{fmt(viewsPerDay)}</p>
            <p className="text-on-accent/80">passenger views per day</p>
          </div>
          <div>
            <p className="text-[clamp(2.25rem,5vw,3.75rem)] font-black tabular-nums leading-none text-on-accent">{fmt(perMonth(viewsPerDay))}</p>
            <p className="text-on-accent/80">passenger views per month</p>
          </div>
        </div>
      </div>

      <div data-reveal-stagger className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-500">
            {operating && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
            Projected plays so far today
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-white">{fmt(playsSoFar)}</p>
          <p className="text-xs text-zinc-500">{operating ? 'Counting up through the operating day' : 'Outside operating hours'}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">On each screen</p>
          <p className="mt-1 text-3xl font-semibold text-white">
            every {Math.max(1, Math.round(rotationSeconds / 60))} min
          </p>
          <p className="text-xs text-zinc-500">≈ {fmt(playsPerScreenPerDay)} plays per screen per day</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Screens</p>
          <p className="mt-1 text-3xl font-semibold text-white">{screens}</p>
          <p className="text-xs text-zinc-500">{areaMatched ? `Vehicles in ${area}` : area === 'All areas' ? 'Whole active fleet' : `Whole fleet (no ${area} group set up)`}</p>
        </div>
      </div>

      <div data-reveal className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-4 text-sm font-medium text-zinc-300">Projected passenger views — first 12 months</p>
        <div data-bars className="flex h-40 items-end gap-1 sm:h-56 sm:gap-2">
          {Array.from({ length: 12 }, (_, i) => {
            const cumulative = perMonth(viewsPerDay) * (i + 1)
            const max = perMonth(viewsPerDay) * 12 || 1
            return (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div
                  data-bar
                  className="w-full origin-bottom rounded-t bg-gradient-to-t from-brand-600 to-brand-400 transition-[height] duration-500"
                  style={{ height: `${Math.max(3, (cumulative / max) * 100)}%` }}
                />
                <span className="text-[10px] text-zinc-500">M{i + 1}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          ≈ <b className="text-white">{fmt(perMonth(viewsPerDay) * 12)}</b> passenger views over 12 months.
        </p>
      </div>

      <details data-reveal className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        <summary className="cursor-pointer text-zinc-300">How this is estimated</summary>
        <ul className="mt-2 space-y-1">
          <li>• Today's real rotation: {ads.length} ads running, plus one new {slotSeconds}-second slot = {rotationSeconds}s per loop.</li>
          <li>• {screens} active screens{areaMatched ? ` in ${area}` : ''} (from the live fleet{area !== 'All areas' && !areaMatched ? `; no tuk-tuk group named ${area} yet, so the whole fleet is used` : ''}).</li>
          <li>• Assumes {hoursPerDay} operating hours a day from 06:00 passengers on board {occupancy}% of that time, {passengers} per trip.</li>
          <li>• As more advertisers join, the loop gets longer and each ad plays less often.</li>
          <li>• A play is not a guarantee that every passenger saw or remembered the ad (agreement clause 6).</li>
        </ul>
      </details>

      <div data-reveal className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-6 text-center">
        <p className="mb-4 text-lg text-white">Want these screens working for {mode === 'own' && name.trim() ? name.trim() : 'your business'}?</p>
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
