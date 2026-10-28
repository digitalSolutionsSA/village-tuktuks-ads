import { isSupabaseConfigured, supabase } from './supabase'
import type { TuktukGroup } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage real groups.'
/** RLS hides blocked updates/deletes (no error, zero rows), so say so instead of failing silently. */
const BLOCKED_ERROR = 'Not saved — only management can change areas.'

export async function listGroups(): Promise<TuktukGroup[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.from('tuktuk_groups').select('*').order('name')
  if (error) throw error
  return (data as TuktukGroup[]) ?? []
}

export async function addGroup(name: string): Promise<TuktukGroup> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase
    .from('tuktuk_groups')
    .insert({ name })
    .select()
    .single()
  if (error) throw error
  return data as TuktukGroup
}

export async function renameGroup(id: string, name: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('tuktuk_groups').update({ name }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(BLOCKED_ERROR)
}

/** Tuk-tuks in the area become "no area"; ads aimed at the area stop playing there. */
export async function deleteGroup(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('tuktuk_groups').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(BLOCKED_ERROR)
}
