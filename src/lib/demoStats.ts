import { TUKTUK_COUNT } from '../types'

/**
 * Ad performance stats shown to advertisers. There is no real impression-
 * tracking table yet (only assignment relationships exist), so the historical
 * 7-day baseline is generated — deterministic per customer/day/tuk-tuk so the
 * numbers tell the same story on every reload — and the on-screen counters
 * then tick forward live from that baseline (see Statistics.tsx).
 *
 * The rates are grounded in the platform's real ad-rotation cadence: with
 * AD_SLOT_SECONDS per ad and FLEET_CUSTOMER_COUNT ads sharing each tuk-tuk's
 * rotation, one customer's ad reappears on a given tuk-tuk every
 * AD_SLOT_SECONDS * FLEET_CUSTOMER_COUNT seconds; across the whole fleet of
 * TUKTUK_COUNT tuk-tuks running independently, that works out to one
 * impression roughly every AD_SLOT_SECONDS * FLEET_CUSTOMER_COUNT /
 * TUKTUK_COUNT seconds for that customer.
 */
export const AD_SLOT_SECONDS = 10
export const FLEET_CUSTOMER_COUNT = 50

/** Seconds between two showings of the same customer's ad, on one tuk-tuk. */
export const PER_TUKTUK_INTERVAL_SECONDS = AD_SLOT_SECONDS * FLEET_CUSTOMER_COUNT

/** Mean seconds between impressions for one customer, across the whole fleet. */
export const MEAN_IMPRESSION_INTERVAL_SECONDS = PER_TUKTUK_INTERVAL_SECONDS / TUKTUK_COUNT

export interface DemoCustomer {
  id: string
  name: string
  contact: string
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { id: 'digital-solutions-sa', name: 'Digital Solutions SA', contact: 'info@digitalsolutionssa.co.za' },
  { id: 'agile-unlimited', name: 'Agile Unlimited', contact: 'Fleet operator — Village Tuk-Tuks' },
]

/** Deterministic pseudo-random float in [0, 1) from an integer seed. */
function seededUnitFloat(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export function tuktukLabel(id: number) {
  return `Tuk-Tuk ${String(id).padStart(2, '0')}`
}

export interface DailyImpressions {
  date: string
  label: string
  total: number
  byTuktuk: number[]
}

export interface TuktukTotal {
  tuktukId: number
  label: string
  total: number
}

export interface CustomerStats {
  customerId: string
  days: DailyImpressions[]
  totalImpressions: number
  avgPerDay: number
  totalsByTuktuk: TuktukTotal[]
  bestDay: DailyImpressions
  bestTuktuk: TuktukTotal
}

// One customer's expected impressions per tuk-tuk per day, from the rotation
// math above (86,400s / per-tuk-tuk interval), lightly randomized per tuk-tuk/day.
const EXPECTED_PER_TUKTUK_PER_DAY = 86400 / PER_TUKTUK_INTERVAL_SECONDS
const BASE_IMPRESSIONS_PER_DAY = Math.round(EXPECTED_PER_TUKTUK_PER_DAY * 0.8)
const IMPRESSIONS_VARIANCE = Math.round(EXPECTED_PER_TUKTUK_PER_DAY * 0.4)

export function getCustomerStats(customerId: string, dayCount = 7): CustomerStats {
  const customerSeed = customerId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

  // Stable per-tuk-tuk "popularity" factor (0.75-1.35) so the same tuk-tuks
  // consistently over/under-perform, like a real route would.
  const popularity = Array.from({ length: TUKTUK_COUNT }, (_, i) => {
    const t = i + 1
    return 0.75 + seededUnitFloat(customerSeed + t * 13) * 0.6
  })

  const today = new Date()
  const days: DailyImpressions[] = []

  for (let offset = dayCount - 1; offset >= 0; offset--) {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    const dateStr = date.toISOString().slice(0, 10)
    const label = date.toLocaleDateString('en-ZA', { weekday: 'short' })
    const dow = date.getDay()
    const weekendBoost = dow === 0 || dow === 5 || dow === 6 ? 1.15 : 1

    const dayIndex = dayCount - offset
    const byTuktuk = Array.from({ length: TUKTUK_COUNT }, (_, i) => {
      const t = i + 1
      const noise = seededUnitFloat(customerSeed + t * 97 + dayIndex * 131)
      const raw = (BASE_IMPRESSIONS_PER_DAY + noise * IMPRESSIONS_VARIANCE) * popularity[i] * weekendBoost
      return Math.round(raw)
    })
    const total = byTuktuk.reduce((a, b) => a + b, 0)
    days.push({ date: dateStr, label, total, byTuktuk })
  }

  const totalImpressions = days.reduce((sum, d) => sum + d.total, 0)
  const totalsByTuktuk: TuktukTotal[] = Array.from({ length: TUKTUK_COUNT }, (_, i) => ({
    tuktukId: i + 1,
    label: tuktukLabel(i + 1),
    total: days.reduce((sum, d) => sum + d.byTuktuk[i], 0),
  })).sort((a, b) => b.total - a.total)

  const bestDay = [...days].sort((a, b) => b.total - a.total)[0]
  const bestTuktuk = totalsByTuktuk[0]
  const avgPerDay = Math.round(totalImpressions / days.length)

  return { customerId, days, totalImpressions, avgPerDay, totalsByTuktuk, bestDay, bestTuktuk }
}
