import { isSupabaseConfigured, supabase } from './supabase'
import { LEAD_STATUS_LABELS, type ClientAgreement, type Lead, type LeadEvent, type LeadEventKind, type LeadStatus, type SalesPackage } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to use the sales tools.'

const blank = (v: string | null | undefined) => (v ?? '').trim() || null
const money = (v: string | number | null | undefined) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''))
  return String(v ?? '').trim() && Number.isFinite(n) ? n : null
}

export const formatRand = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `R ${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`

// ---- Packages ----

export async function listPackages(includeInactive = false): Promise<SalesPackage[]> {
  if (!isSupabaseConfigured) return []
  let q = supabase.from('sales_packages').select('*').order('sort_order').order('created_at')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data as SalesPackage[]) ?? []
}

export interface PackageInput {
  name: string
  description: string
  monthly_fee: string
  areas: string[]
  features: string[]
  sort_order: number
  active: boolean
}

const packageRow = (p: PackageInput) => ({
  name: p.name.trim(),
  description: blank(p.description),
  monthly_fee: money(p.monthly_fee),
  areas: p.areas,
  features: p.features.map((f) => f.trim()).filter(Boolean),
  sort_order: p.sort_order,
  active: p.active,
})

export async function savePackage(id: string | null, p: PackageInput) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = id
    ? await supabase.from('sales_packages').update(packageRow(p)).eq('id', id)
    : await supabase.from('sales_packages').insert(packageRow(p))
  if (error) throw error
}

export async function deletePackage(id: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('sales_packages').delete().eq('id', id)
  if (error) throw error
}

// ---- Leads ----

/** Reps get their own leads; admins get everyone's (RLS). Optionally filter to one owner. */
export async function listLeads(ownerId?: string): Promise<Lead[]> {
  if (!isSupabaseConfigured) return []
  let q = supabase.from('leads').select('*').order('updated_at', { ascending: false })
  if (ownerId) q = q.eq('owner_id', ownerId)
  const { data, error } = await q
  if (error) throw error
  return (data as Lead[]) ?? []
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('leads').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Lead | null
}

export interface LeadInput {
  business_name: string
  contact_name: string
  phone: string
  email: string
  address: string
  area: string
  status: LeadStatus
  source: string
  notes: string
  follow_up_date: string
  estimated_value: string
}

export const emptyLeadInput = (): LeadInput => ({
  business_name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  area: '',
  status: 'new',
  source: '',
  notes: '',
  follow_up_date: '',
  estimated_value: '',
})

export const leadToInput = (l: Lead): LeadInput => ({
  business_name: l.business_name,
  contact_name: l.contact_name ?? '',
  phone: l.phone ?? '',
  email: l.email ?? '',
  address: l.address ?? '',
  area: l.area ?? '',
  status: l.status,
  source: l.source ?? '',
  notes: l.notes ?? '',
  follow_up_date: l.follow_up_date ?? '',
  estimated_value: l.estimated_value === null ? '' : String(l.estimated_value),
})

const leadRow = (l: LeadInput) => ({
  business_name: l.business_name.trim(),
  contact_name: blank(l.contact_name),
  phone: blank(l.phone),
  email: blank(l.email),
  address: blank(l.address),
  area: blank(l.area),
  status: l.status,
  source: blank(l.source),
  notes: blank(l.notes),
  follow_up_date: l.follow_up_date || null,
  estimated_value: money(l.estimated_value),
})

export async function createLead(input: LeadInput): Promise<Lead> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...leadRow(input), owner_id: auth.user?.id })
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

/** Saves the lead and logs a status change on its timeline when the status moved. */
export async function updateLead(prev: Lead, input: LeadInput): Promise<Lead> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('leads').update(leadRow(input)).eq('id', prev.id).select().single()
  if (error) throw error
  if (prev.status !== input.status) await addLeadEvent(prev.id, 'status', `Status changed to ${LEAD_STATUS_LABELS[input.status]}`)
  return data as Lead
}

export async function reassignLead(id: string, ownerId: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('leads').update({ owner_id: ownerId }).eq('id', id)
  if (error) throw error
}

export async function deleteLead(id: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export async function listLeadEvents(leadId: string): Promise<LeadEvent[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('lead_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as LeadEvent[]) ?? []
}

export async function addLeadEvent(leadId: string, kind: LeadEventKind, body: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('lead_events')
    .insert({ lead_id: leadId, kind, body: body.trim(), user_id: auth.user?.id })
  if (error) throw error
}

/** Called after a contract is signed from a lead: mark it won and link the new client. */
export async function markLeadSigned(leadId: string, clientId: string, agreementLabel: string) {
  if (!isSupabaseConfigured) return
  const { error } = await supabase
    .from('leads')
    .update({ status: 'won', client_id: clientId, follow_up_date: null })
    .eq('id', leadId)
  if (error) throw error
  await addLeadEvent(leadId, 'signed', `Contract signed: ${agreementLabel}`)
}

// ---- Performance ----

export interface SalesStats {
  leadsTotal: number
  leadsOpen: number
  leadsThisMonth: number
  followUpsDue: number
  contractsThisMonth: number
  contractsTotal: number
  /** Sum of monthly fees on contracts signed this month. */
  newMonthlyRevenue: number
  /** Sum of monthly fees across every contract signed. */
  totalMonthlyRevenue: number
  /** Won / (won + lost), or null with no closed leads. */
  conversionRate: number | null
}

const startOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export const todayIso = () => new Date().toLocaleDateString('en-CA')

export function computeStats(leads: Lead[], agreements: Pick<ClientAgreement, 'signed_at' | 'monthly_fee'>[]): SalesStats {
  const som = startOfMonth()
  const today = todayIso()
  const thisMonth = agreements.filter((a) => new Date(a.signed_at).getTime() >= som)
  const won = leads.filter((l) => l.status === 'won').length
  const lost = leads.filter((l) => l.status === 'lost').length
  const fees = (rows: typeof agreements) => rows.reduce((s, a) => s + Number(a.monthly_fee ?? 0), 0)
  return {
    leadsTotal: leads.length,
    leadsOpen: leads.filter((l) => l.status !== 'won' && l.status !== 'lost').length,
    leadsThisMonth: leads.filter((l) => new Date(l.created_at).getTime() >= som).length,
    followUpsDue: leads.filter(
      (l) => l.follow_up_date && l.follow_up_date <= today && l.status !== 'won' && l.status !== 'lost',
    ).length,
    contractsThisMonth: thisMonth.length,
    contractsTotal: agreements.length,
    newMonthlyRevenue: fees(thisMonth),
    totalMonthlyRevenue: fees(agreements),
    conversionRate: won + lost ? won / (won + lost) : null,
  }
}
