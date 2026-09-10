import { isSupabaseConfigured, supabase } from './supabase'
import { DEMO_DRIVER, DEMO_DRIVER_PIN } from './demoData'
import type { Driver, DriverName, DriverSession, DriverSessionAction } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage real drivers.'

/** Public-safe list for the tablet's driver picker — usernames only, no PINs. */
export async function listActiveDriverNames(): Promise<DriverName[]> {
  if (!isSupabaseConfigured) return [DEMO_DRIVER]
  const { data, error } = await supabase
    .from('active_driver_names')
    .select('id, username')
    .order('username')
  if (error) throw error
  return (data as DriverName[]) ?? []
}

export async function verifyDriverPin(driverId: string, candidate: string): Promise<boolean> {
  if (!isSupabaseConfigured) return candidate === DEMO_DRIVER_PIN
  const { data, error } = await supabase.rpc('verify_driver_pin', {
    driver_id_param: driverId,
    candidate,
  })
  if (error) {
    console.warn('[driversApi] verify failed', error)
    return false
  }
  return Boolean(data)
}

export async function logDriverSession(
  driverId: string,
  tuktukId: number,
  action: DriverSessionAction,
): Promise<void> {
  if (!isSupabaseConfigured) return
  await supabase
    .rpc('log_driver_session', {
      driver_id_param: driverId,
      tuktuk_id_param: tuktukId,
      action_param: action,
    })
    .then(undefined, () => {
      /* offline — sign-in still proceeds even if the log write fails */
    })
}

// ---- Admin management (never fetches the PIN itself back to the client) ----

export async function listDrivers(): Promise<Driver[]> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase
    .from('drivers')
    .select('id, username, active, created_at')
    .order('username')
  if (error) throw error
  return (data as Driver[]) ?? []
}

export async function addDriver(username: string, pin: string): Promise<Driver> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be exactly 6 digits.')
  const { data, error } = await supabase
    .from('drivers')
    .insert({ username, pin })
    .select('id, username, active, created_at')
    .single()
  if (error) throw error
  return data as Driver
}

export async function setDriverActive(id: string, active: boolean): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('drivers').update({ active }).eq('id', id)
  if (error) throw error
}

export async function setDriverPin(id: string, pin: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be exactly 6 digits.')
  const { error } = await supabase.from('drivers').update({ pin }).eq('id', id)
  if (error) throw error
}

export async function deleteDriver(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('drivers').delete().eq('id', id)
  if (error) throw error
}

export async function listRecentSessions(limit = 25): Promise<DriverSession[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('driver_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as DriverSession[]) ?? []
}
