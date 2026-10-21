import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { ADVERTISING_AREAS, VILLAGE_MEDIA } from '../../lib/agreementText'
import { formatRand, listPackages } from '../../lib/salesApi'
import { DEMO_ADS, DEMO_TUKTUKS } from '../../lib/demoData'
import type { Ad, SalesPackage, Tuktuk } from '../../types'

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000
const NEW_AD_SECONDS = 10

const STEPS = [
  { title: 'Pick your area', body: `Choose where you want to be seen: ${ADVERTISING_AREAS.join(', ')}.` },
  { title: 'Send your artwork', body: 'Logo, photos, video, prices, QR code. Need a design? We can make it for you.' },
  { title: 'You approve it', body: 'Nothing goes live until you have approved the final ad.' },
  { title: 'Live on the screens', body: 'Your 10-second ad plays in rotation on the screens inside Village Tuk vehicles.' },
]

const BENEFITS = [
  ['Seated, captive audience', 'Passengers face the screen for their whole trip — no scrolling past.'],
  ['Hyper-local', 'Reach people right in the community where your business trades.'],
  ['Seen again and again', 'Your ad repeats all day, so locals remember your name.'],
  ['Easy to act on', 'Add a QR code, phone number or special offer to drive enquiries.'],
  ['Change it anytime', 'New special this month? We update the content remotely.'],
  ['Affordable monthly', 'A fixed monthly fee — no printing, no media agency.'],
]

const TERMS = [
  'Standard ad: up to 10 seconds, in a rotating playlist.',
  'Initial term: 12 months from your campaign start date, then month-to-month (30 days’ notice).',
  'Monthly fee paid in advance by the 25th for the following month, by EFT.',
  'Design and video production quoted separately, only if you need it.',
  'Plays and audience figures are estimates — not guaranteed results.',
]

/** Customer-facing presentation for reps to walk through on the tablet. */
export function Pitch() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [packages, setPackages] = useState<SalesPackage[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setTuktuks(DEMO_TUKTUKS)
      setAds(DEMO_ADS)
      return
    }
    supabase.from('tuktuks').select('*').then(({ data }) => setTuktuks((data as Tuktuk[]) ?? []))
    supabase
      .from('creatives')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => setAds((data as Ad[]) ?? []))
    listPackages().then(setPackages).catch(() => {})
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void rootRef.current?.requestFullscreen?.()
  }

  const activeTuktuks = tuktuks.filter((t) => t.active)
  const onlineNow = activeTuktuks.filter(
    (t) => t.last_seen_at && Date.now() - new Date(t.last_seen_at).getTime() < ONLINE_THRESHOLD_MS,
  ).length
  // Rough cadence for a new advertiser: one more 10s slot added to today's rotation.
  const rotationSeconds = ads.reduce((s, a) => s + (a.duration_seconds || NEW_AD_SECONDS), 0) + NEW_AD_SECONDS
  const everyMinutes = Math.max(1, Math.round(rotationSeconds / 60))
  const showcase = ads.slice(0, 8)

  return (
    <div ref={rootRef} className={fullscreen ? 'h-full overflow-y-auto bg-zinc-950 px-6 py-8' : ''}>
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Link
          to="/sales/projection"
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400"
        >
          📈 Show a projection
        </Link>
        <button
          onClick={toggleFullscreen}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          {fullscreen ? 'Exit full screen' : '⛶ Present full screen'}
        </button>
      </div>

      <section className="mb-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 p-8 sm:p-12">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-purple-200">Village Media</p>
        <h1 className="mb-4 text-3xl font-bold text-white sm:text-5xl">Put your business on screen in every Village Tuk.</h1>
        <p className="max-w-2xl text-lg text-purple-100">
          Digital screens inside Village Tuk passenger vehicles, showing your ad to local commuters all day,
          every day.
        </p>
      </section>

      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat value={activeTuktuks.length || '—'} label="Vehicles with screens" />
        <BigStat value={onlineNow} label="Screens online right now" />
        <BigStat value={ADVERTISING_AREAS.length} label="Operating areas" />
        <BigStat value={ads.length} label="Ads running today" />
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-semibold text-white">How it works</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
                {i + 1}
              </p>
              <p className="mb-1 font-semibold text-white">{s.title}</p>
              <p className="text-sm text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-semibold text-white">Why advertise in a Village Tuk</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {BENEFITS.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="mb-1 font-semibold text-white">{title}</p>
              <p className="text-sm text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
        {ads.length > 0 && (
          <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
            With today's rotation, a new ad would come around roughly <b className="text-white">every {everyMinutes} min</b>{' '}
            on each screen it's scheduled on.{' '}
            <span className="text-zinc-500">Estimate only — actual plays vary with routes and operating hours.</span>
          </p>
        )}
      </section>

      {showcase.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold text-white">What's on the screens now</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {showcase.map((ad) => (
              <figure key={ad.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
                {ad.media_type === 'video' ? (
                  <video src={ad.media_url} muted loop autoPlay playsInline className="aspect-video w-full object-cover" />
                ) : (
                  <img src={ad.media_url} alt={ad.title} className="aspect-video w-full object-cover" />
                )}
                <figcaption className="truncate px-3 py-2 text-xs text-zinc-400">
                  {ad.advertiser_name || ad.title}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-semibold text-white">Packages</h2>
        {packages.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
            Pricing is tailored to your area and campaign. Ask your Village Media rep for a quote.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {packages.map((p) => (
              <div key={p.id} className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 p-6">
                <p className="text-lg font-semibold text-white">{p.name}</p>
                <p className="my-2 text-3xl font-bold text-purple-300">
                  {formatRand(p.monthly_fee)}
                  <span className="text-sm font-normal text-zinc-400"> /month</span>
                </p>
                {p.description && <p className="mb-3 text-sm text-zinc-400">{p.description}</p>}
                {p.areas.length > 0 && <p className="mb-2 text-sm text-zinc-300">📍 {p.areas.join(', ')}</p>}
                <ul className="mb-5 space-y-1 text-sm text-zinc-300">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link
                  to={`/sales/signup?package=${p.id}`}
                  className="mt-auto rounded-lg bg-purple-500 py-3 text-center font-medium text-white hover:bg-purple-400"
                >
                  Sign up with this package
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-3 text-xl font-semibold text-white">The fine print, in plain language</h2>
        <ul className="space-y-2 text-sm text-zinc-300">
          {TERMS.map((t) => (
            <li key={t}>• {t}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-8 text-center">
        <h2 className="mb-2 text-2xl font-semibold text-white">Ready to get on screen?</h2>
        <p className="mb-5 text-zinc-300">
          Sign right here on the tablet — you get a copy of the agreement by email. Questions? Call{' '}
          {VILLAGE_MEDIA.telephone}.
        </p>
        <Link
          to="/sales/signup"
          className="inline-block rounded-xl bg-green-600 px-8 py-4 text-lg font-semibold text-white hover:bg-green-500"
        >
          ✎ Sign up now
        </Link>
      </section>
    </div>
  )
}

function BigStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center">
      <p className="text-4xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-zinc-400">{label}</p>
    </div>
  )
}
