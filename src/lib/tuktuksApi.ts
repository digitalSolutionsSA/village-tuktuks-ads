import { isSupabaseConfigured, supabase } from './supabase'
import { DEMO_TUKTUKS } from './demoData'
import type { Tuktuk } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage real tuk-tuks.'
/** RLS hides blocked updates/deletes (no error, zero rows), so say so instead of failing silently. */
const BLOCKED_ERROR = 'Not saved — only management can change tuk-tuks.'

function assertChanged(rows: unknown[] | null) {
  if (!rows || rows.length === 0) throw new Error(BLOCKED_ERROR)
}

export async function listTuktuks(): Promise<Tuktuk[]> {
  if (!isSupabaseConfigured) return DEMO_TUKTUKS
  const { data, error } = await supabase.from('tuktuks').select('*').order('id')
  if (error) throw error
  return (data as Tuktuk[]) ?? []
}

export async function addTuktuk(groupId: string | null = null): Promise<Tuktuk> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const existing = await listTuktuks()
  const nextId = existing.length ? Math.max(...existing.map((t) => t.id)) + 1 : 1
  const label = `Tuk-Tuk ${String(nextId).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('tuktuks')
    .insert({ id: nextId, label, active: true, group_id: groupId })
    .select()
    .single()
  if (error) throw error
  return data as Tuktuk
}

export async function setTuktukActive(id: number, active: boolean) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('tuktuks').update({ active }).eq('id', id).select('id')
  if (error) throw error
  assertChanged(data)
}

export async function deleteTuktuk(id: number) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('tuktuks').delete().eq('id', id).select('id')
  if (error) throw error
  assertChanged(data)
}

export async function renameTuktuk(id: number, label: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('tuktuks').update({ label }).eq('id', id).select('id')
  if (error) throw error
  assertChanged(data)
}

export async function setTuktukNickname(id: number, nickname: string | null) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.from('tuktuks').update({ nickname }).eq('id', id).select('id')
  if (error) throw error
  assertChanged(data)
}

export async function setTuktukGroup(id: number, groupId: string | null) {
  await setTuktuksGroup([id], groupId)
}

/** Move several tuk-tuks into one area (or out of every area with null). */
export async function setTuktuksGroup(ids: number[], groupId: string | null) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  if (ids.length === 0) return
  const { data, error } = await supabase.from('tuktuks').update({ group_id: groupId }).in('id', ids).select('id')
  if (error) throw error
  assertChanged(data)
}
