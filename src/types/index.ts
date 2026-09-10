export type UserRole = 'admin' | 'customer'

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
  created_at: string
}

/** Public-safe subset (no PIN) shown to the tablet's driver picker. */
export interface DriverName {
  id: string
  username: string
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
