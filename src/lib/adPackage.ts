import { countAreas, EXTRA_AREA_FEE } from './agreementText'
import type { ClientAgreement } from '../types'

/** The two ad lengths we sell: Standard (R950) and Premium (R1,450). */
export const AD_SECONDS_OPTIONS = [5, 10] as const

/** One-area fees at or above this are Premium — halfway between R950 and R1,450. */
const PREMIUM_FEE_FROM = 1200

/**
 * Seconds per play a signed customer's package allows: the package named in the notes,
 * otherwise the one-area fee. Null when the agreement says neither.
 * Keep in sync with public.package_ad_seconds in supabase/schema.sql.
 */
export function packageAdSeconds(a: Pick<ClientAgreement, 'package_notes' | 'monthly_fee' | 'areas' | 'other_area'>): 5 | 10 | null {
  const notes = (a.package_notes ?? '').toLowerCase()
  if (notes.includes('premium')) return 10
  if (notes.includes('standard')) return 5
  if (a.monthly_fee === null) return null
  const extraAreas = Math.max(countAreas(a.areas, a.other_area ?? '') - 1, 0)
  return Number(a.monthly_fee) - extraAreas * EXTRA_AREA_FEE >= PREMIUM_FEE_FROM ? 10 : 5
}

/** Video is Premium only, and every video stops after this many seconds however long the file is. */
export const VIDEO_MAX_SECONDS = 10

export const packageLabel =(seconds: number) => (seconds === 10 ? 'Premium' : 'Standard')
