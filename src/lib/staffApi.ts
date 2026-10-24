import { isSupabaseConfigured, supabase } from './supabase'
import type { Profile, StaffActivity, StaffSession, UserRole } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage staff.'

/**
 * Staff sign in with a username; Supabase Auth needs an email, so each username
 * maps to <username>@STAFF_EMAIL_DOMAIN. Keep in sync with
 * supabase/functions/manage-staff/index.ts.
 */
export const STAFF_EMAIL_DOMAIN = 'staff.villagemedia.local'

/** Accepts either a staff username or a real email address (management accounts). */
export function loginEmail(usernameOrEmail: string) {
  const v = usernameOrEmail.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${STAFF_EMAIL_DOMAIN}`
}

/** A heartbeat arrives every minute while the portal is open. */
export const STAFF_ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function isStaffOnline(p: Pick<Profile, 'last_seen_at'>, latestSession?: StaffSession) {
  if (!p.last_seen_at) return false
  if (latestSession?.ended_at) return false
  return Date.now() - new Date(p.last_seen_at).getTime() < STAFF_ONLINE_THRESHOLD_MS
}

export function staffName(p: Pick<Profile, 'display_name' | 'username' | 'email'> | undefined | null) {
  return p?.display_name || p?.username || p?.email || 'Unknown'
}

export async function sendHeartbeat() {
  if (!isSupabaseConfigured) return
  await supabase.rpc('staff_heartbeat')
}

/** Starts a fresh online session and writes "Signed in" to the activity log. */
export async function recordSignIn() {
  if (!isSupabaseConfigured) return
  await supabase.rpc('staff_sign_in')
}

export async function recordSignOut() {
  if (!isSupabaseConfigured) return
  await supabase.rpc('staff_sign_out')
}

/** Everyone with portal access (management + sales). Admin only (RLS). */
export async function listStaff(): Promise<Profile[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['admin', 'sales'])
    .order('display_name')
  if (error) throw error
  return (data as Profile[]) ?? []
}

export async function getStaff(id: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

/** Online periods since `sinceDays` ago, newest first. Pass a userId to limit to one person. */
export async function listStaffSessions(sinceDays: number, userId?: string): Promise<StaffSession[]> {
  if (!isSupabaseConfigured) return []
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
  let q = supabase
    .from('staff_sessions')
    .select('*')
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })
    .limit(1000)
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q
  if (error) throw error
  return (data as StaffSession[]) ?? []
}

/** Activity log, newest first. Super admins only (RLS). */
export async function listStaffActivity(sinceDays: number, userId?: string): Promise<StaffActivity[]> {
  if (!isSupabaseConfigured) return []
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
  let q = supabase
    .from('staff_activity')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q
  if (error) throw error
  return (data as StaffActivity[]) ?? []
}

async function callManageStaff(body: Record<string, unknown>) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.functions.invoke('manage-staff', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const res = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(res?.error ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export interface NewStaffInput {
  username: string
  password: string
  display_name: string
  role: Extract<UserRole, 'admin' | 'sales'>
  phone: string
  monthly_target: string
}

export const createStaff = (input: NewStaffInput) => callManageStaff({ action: 'create', ...input })

export const updateStaff = (
  userId: string,
  patch: Partial<Pick<NewStaffInput, 'display_name' | 'phone' | 'monthly_target' | 'role'>>,
) => callManageStaff({ action: 'update', user_id: userId, ...patch })

export const setStaffPassword = (userId: string, password: string) =>
  callManageStaff({ action: 'set_password', user_id: userId, password })

export const setStaffActive = (userId: string, active: boolean) =>
  callManageStaff({ action: 'set_active', user_id: userId, active })

export const deleteStaff = (userId: string) => callManageStaff({ action: 'delete', user_id: userId })

export function formatDuration(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** Time online within the window, from heartbeat sessions. */
export function onlineMs(sessions: StaffSession[], sinceMs: number) {
  return sessions.reduce((sum, s) => {
    const start = Math.max(new Date(s.started_at).getTime(), sinceMs)
    const end = new Date(s.ended_at ?? s.last_seen_at).getTime()
    return sum + Math.max(0, end - start)
  }, 0)
}
