export type UserRole = 'admin' | 'sales' | 'customer'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  /** Sign-in name for staff accounts created from Admin → Sales team. */
  username: string | null
  phone: string | null
  active: boolean
  last_seen_at: string | null
  /** Contracts this rep aims to sign per month. */
  monthly_target: number | null
  /** Management (set in schema.sql §15): manages staff, sees sales performance and the activity log. */
  super_admin: boolean
  /** Commission structure this sales person earns on (main admins assign it). */
  commission_structure_id: string | null
  created_at: string
}

export type StaffActivityAction =
  | 'sign_in'
  | 'sign_out'
  | 'client_added'
  | 'contract_signed'
  | 'lead_added'
  | 'lead_status'
  | 'ad_uploaded'
  | 'ad_deleted'
  | 'ad_assigned'

/** One line in the staff activity log (written by database triggers). */
export interface StaffActivity {
  id: string
  user_id: string | null
  actor_name: string | null
  action: StaffActivityAction
  summary: string
  entity_type: 'client' | 'lead' | 'ad' | null
  entity_id: string | null
  created_at: string
}

/** One continuous online period for a staff member, built from minute-by-minute heartbeats. */
export interface StaffSession {
  id: string
  user_id: string
  started_at: string
  last_seen_at: string
  ended_at: string | null
}

export interface SalesPackage {
  id: string
  name: string
  description: string | null
  monthly_fee: number | null
  areas: string[]
  features: string[]
  sort_order: number
  active: boolean
  created_at: string
}

export const LEAD_STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  meeting: 'Meeting set',
  proposal: 'Proposal sent',
  won: 'Signed',
  lost: 'Lost',
}

export interface Lead {
  id: string
  business_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  area: string | null
  status: LeadStatus
  source: string | null
  notes: string | null
  follow_up_date: string | null
  estimated_value: number | null
  client_id: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
}

export type LeadEventKind = 'note' | 'call' | 'visit' | 'status' | 'signed'

export interface LeadEvent {
  id: string
  lead_id: string
  user_id: string | null
  kind: LeadEventKind
  body: string
  created_at: string
}

export type MediaType = 'image' | 'video'

export interface Ad {
  id: string
  customer_id: string
  advertiser_name: string | null
  title: string
  media_path: string
  media_url: string
  media_type: MediaType
  duration_seconds: number
  /** Where a video's 10 seconds start (schema.sql §19). Missing on ads cached before it existed. */
  video_start_seconds?: number | null
  is_active: boolean
  start_date: string | null
  end_date: string | null
  /** The customer this ad was loaded for. */
  client_id: string | null
  created_at: string
}

export interface TuktukGroup {
  id: string
  name: string
  created_at: string
}

export interface Tuktuk {
  id: number
  label: string
  /** Optional friendly name, e.g. the owner's name — shown alongside the label in the admin. */
  nickname: string | null
  active: boolean
  group_id: string | null
  last_seen_at: string | null
}

/** "Tuk-Tuk 01 · Pieter van Zyl", or just the label when there's no nickname. */
export function tuktukName(t: Pick<Tuktuk, 'label' | 'nickname'>) {
  return t.nickname ? `${t.label} · ${t.nickname}` : t.label
}

export interface AdAssignment {
  id: string
  ad_id: string
  tuktuk_id: number
  sort_order: number
  created_at: string
}

export interface AdGroupAssignment {
  id: string
  ad_id: string
  group_id: string
  sort_order: number
  created_at: string
}

/** An ad joined with its assignment row for a specific tuktuk's playlist. */
export interface PlaylistItem extends Ad {
  assignment_id: string
  sort_order: number
}

export const TUKTUK_COUNT = 16

export interface Client {
  id: string
  legal_name: string
  company_name: string | null
  registration_no: string | null
  physical_address: string | null
  email: string
  telephone: string | null
  authorised_rep: string | null
  created_by: string | null
  created_at: string
}

export type VatOption = 'inclusive' | 'exclusive' | 'not_applicable'

/** A signed advertising agreement. Named "client_agreements" (not "ad…") for the ad-blocker reason in lib/supabase.ts. */
export interface ClientAgreement {
  id: string
  client_id: string
  effective_date: string
  areas: string[]
  other_area: string | null
  monthly_fee: number | null
  vat: VatOption | null
  campaign_start: string | null
  initial_term: string | null
  package_notes: string | null
  client_signer_name: string
  client_signer_company: string | null
  client_signer_capacity: string | null
  vm_signer_name: string
  vm_signer_capacity: string | null
  signed_at: string
  pdf_path: string | null
  emailed_at: string | null
  /** The lead this contract was signed from, if any. */
  lead_id: string | null
  /** Commission terms copied from the signer's structure when it was signed. */
  commission_structure_id: string | null
  commission_kind: CommissionKind | null
  commission_rate: number | null
  commission_months: number | null
  /** Set by a main admin when the customer stops advertising. */
  ended_on: string | null
  created_by: string | null
  created_at: string
}

export type CommissionKind = 'percent' | 'flat'

/** How a sales person is paid: a % of the monthly fee, or a flat amount, for the first `months` months of each contract. */
export interface CommissionStructure {
  id: string
  name: string
  kind: CommissionKind
  rate: number
  months: number
  notes: string | null
  active: boolean
  created_at: string
}

export interface Payout {
  id: string
  user_id: string | null
  amount: number
  paid_on: string
  note: string | null
  created_at: string
}

export interface Cost {
  id: string
  /** First day of the month the cost belongs to. */
  month: string
  category: string
  description: string | null
  amount: number
  created_at: string
}

export interface ClientAgreementWithClient extends ClientAgreement {
  client: Client
}
