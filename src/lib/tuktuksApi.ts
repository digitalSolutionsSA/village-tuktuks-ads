import { isSupabaseConfigured, supabase } from './supabase'
import { DEMO_TUKTUKS } from './demoData'
import type { Tuktuk } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage real tuk-tuks.'

export async function listTuktuks(): Promise<Tuktuk[]> {
  if (!isSupabaseConfigured) return DEMO_TUKTUKS
  const { data, error } = await supabase.from('tuktuks').select('*').order('id')
  if (error) throw error
  return (data as Tuktuk[]) ?? []
}

export async function addTuktuk(): Promise<Tuktuk> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const existing = await listTuktuks()
  const nextId = existing.length ? Math.max(...existing.map((t) => t.id)) + 1 : 1
  const label = `Tuk-Tuk ${String(nextId).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('tuktuks')
    .insert({ id: nextId, label, active: true })
    .select()
    .single()
  if (error) throw error
  return data as Tuktuk
}

export async function setTuktukActive(id: number, active: boolean) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuks').update({ active }).eq('id', id)
  if (error) throw error
}

export async function deleteTuktuk(id: number) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuks').delete().eq('id', id)
  if (error) throw error
}

export async function renameTuktuk(id: number, label: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuks').update({ label }).eq('id', id)
  if (error) throw error
}

export async function setTuktukNickname(id: number, nickname: string | null) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuks').update({ nickname }).eq('id', id)
  if (error) throw error
}

export async function setTuktukGroup(id: number, groupId: string | null) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuks').update({ group_id: groupId }).eq('id', id)
  if (error) throw error
}
