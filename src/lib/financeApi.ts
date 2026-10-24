import { isSupabaseConfigured, supabase } from './supabase'
import type { ClientAgreement, CommissionKind, CommissionStructure, Cost, Payout } from '../types'

// Commission structures, payouts and costs — main admins only (RLS, schema.sql §16).

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage finances.'

const need = () => {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
}

// ---- Commission structures ----

export async function listCommissionStructures(): Promise<CommissionStructure[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.from('commission_structures').select('*').order('name')
  if (error) throw error
  return (data as CommissionStructure[]) ?? []
}

export interface CommissionInput {
  name: string
  kind: CommissionKind
  rate: string
  months: string
  notes: string
  active: boolean
}

export async function saveCommissionStructure(id: string | null, input: CommissionInput) {
  need()
  const row = {
    name: input.name.trim(),
    kind: input.kind,
    rate: Number(input.rate.replace(',', '.')) || 0,
    months: Math.min(60, Math.max(1, Number.parseInt(input.months, 10) || 1)),
    notes: input.notes.trim() || null,
    active: input.active,
  }
  const { error } = id
    ? await supabase.from('commission_structures').update(row).eq('id', id)
    : await supabase.from('commission_structures').insert(row)
  if (error) throw error
}

export async function deleteCommissionStructure(id: string) {
  need()
  const { error } = await supabase.from('commission_structures').delete().eq('id', id)
  if (error) throw error
}

/** Which structure a sales person earns on. Applies to contracts they sign from now on. */
export async function assignCommissionStructure(userId: string, structureId: string | null) {
  need()
  const { error } = await supabase.from('profiles').update({ commission_structure_id: structureId }).eq('id', userId)
  if (error) throw error
}

export function describeCommission(s: Pick<CommissionStructure, 'kind' | 'rate' | 'months'>) {
  const amount = s.kind === 'percent' ? `${s.rate}% of the monthly fee` : `R ${Number(s.rate).toLocaleString('en-ZA')} per contract`
  return s.months === 1 ? `${amount}, first month only` : `${amount}, each month for ${s.months} months`
}

// ---- Payouts ----

export async function listPayouts(): Promise<Payout[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.from('payouts').select('*').order('paid_on', { ascending: false })
  if (error) throw error
  return (data as Payout[]) ?? []
}

export async function addPayout(userId: string, amount: number, paidOn: string, note: string) {
  need()
  const { error } = await supabase.from('payouts').insert({ user_id: userId, amount, paid_on: paidOn, note: note.trim() || null })
  if (error) throw error
}

export async function deletePayout(id: string) {
  need()
  const { error } = await supabase.from('payouts').delete().eq('id', id)
  if (error) throw error
}

// ---- Costs ----

export async function listCosts(): Promise<Cost[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.from('costs').select('*').order('month', { ascending: false })
  if (error) throw error
  return (data as Cost[]) ?? []
}

export async function addCost(month: string, category: string, description: string, amount: number) {
  need()
  const { error } = await supabase
    .from('costs')
    .insert({ month: `${month}-01`, category: category.trim(), description: description.trim() || null, amount })
  if (error) throw error
}

export async function deleteCost(id: string) {
  need()
  const { error } = await supabase.from('costs').delete().eq('id', id)
  if (error) throw error
}

/** Stops (or, with null, restarts) a contract's earnings from that date. */
export async function setAgreementEnded(id: string, endedOn: string | null) {
  need()
  const { error } = await supabase.from('client_agreements').update({ ended_on: endedOn }).eq('id', id)
  if (error) throw error
}

// ---- Month maths ----
// Months are 'YYYY-MM' keys. A contract earns its monthly fee every month from its campaign
// start (or signing date) until the month it ended in, inclusive.

export const monthKey = (iso: string) => iso.slice(0, 7)

export function thisMonthKey() {
  return new Date().toLocaleDateString('en-CA').slice(0, 7)
}

export function shiftMonth(key: string, by: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
}

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

type Earning = Pick<ClientAgreement, 'monthly_fee' | 'campaign_start' | 'signed_at' | 'ended_on'>

export function contractStartMonth(a: Earning) {
  return monthKey(a.campaign_start ?? a.signed_at)
}

/** Monthly fee this contract brings in during `month` (0 outside its running period). */
export function earningFor(a: Earning, month: string) {
  if (!a.monthly_fee) return 0
  if (monthsBetween(contractStartMonth(a), month) < 0) return 0
  if (a.ended_on && monthsBetween(monthKey(a.ended_on), month) > 0) return 0
  return Number(a.monthly_fee)
}

type Commissionable = Pick<ClientAgreement, 'monthly_fee' | 'signed_at' | 'ended_on' | 'commission_kind' | 'commission_rate' | 'commission_months'>

/** Commission the signer earns on this contract during `month`, counted from the month it was signed. */
export function commissionFor(a: Commissionable, month: string) {
  if (!a.commission_kind || a.commission_rate === null || !a.commission_months) return 0
  const k = monthsBetween(monthKey(a.signed_at), month)
  if (k < 0 || k >= a.commission_months) return 0
  if (a.ended_on && monthsBetween(monthKey(a.ended_on), month) > 0) return 0
  return a.commission_kind === 'percent' ? (Number(a.monthly_fee ?? 0) * Number(a.commission_rate)) / 100 : Number(a.commission_rate)
}

/** Commission earned on this contract from signing up to and including `month`. */
export function commissionToDate(a: Commissionable, month: string) {
  let total = 0
  const months = a.commission_months ?? 0
  for (let k = 0; k < months; k++) {
    const m = shiftMonth(monthKey(a.signed_at), k)
    if (monthsBetween(m, month) < 0) break
    total += commissionFor(a, m)
  }
  return total
}
