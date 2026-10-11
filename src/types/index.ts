export type UserRole = 'admin' | 'sales' | 'customer'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
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
  is_active: boolean
  start_date: string | null
  end_date: string | null
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
  active: boolean
  group_id: string | null
  last_seen_at: string | null
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

export interface Driver {
  id: string
  username: string
  active: boolean
  /** The one tuk-tuk this driver's PIN works on. null = works on any tuk-tuk. */
  tuktuk_id: number | null
  created_at: string
}

/** Public-safe subset (no PIN) shown to the tablet's driver picker. */
export interface DriverName {
  id: string
  username: string
  tuktuk_id: number | null
}

export type DriverSessionAction = 'sign_in' | 'sign_out'

export interface DriverSession {
  id: string
  driver_id: string | null
  driver_username: string
  tuktuk_id: number | null
  tuktuk_label: string
  action: DriverSessionAction
  created_at: string
}

/** A tuk-tuk's own logo/services ad, cycled in the player's left sidebar. */
export interface SidebarAd {
  id: string
  tuktuk_id: number
  title: string
  media_path: string
  media_url: string
  is_active: boolean
  sort_order: number
  created_at: string
}

/** A scrolling top-bar ad. tuktuk_id null = shows fleet-wide. */
export interface MarqueeMessage {
  id: string
  tuktuk_id: number | null
  advertiser_name: string | null
  message: string
  media_path: string | null
  media_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
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
  created_by: string | null
  created_at: string
}

export interface ClientAgreementWithClient extends ClientAgreement {
  client: Client
}
