import { isSupabaseConfigured, MEDIA_BUCKET, supabase } from './supabase'
import { demoSidebarAdsFor } from './demoData'
import type { SidebarAd } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage sidebar ads.'

/** Active sidebar ads for one tuk-tuk — what the player actually shows. */
export async function listSidebarAdsForTuktuk(tuktukId: number): Promise<SidebarAd[]> {
  if (!isSupabaseConfigured) return demoSidebarAdsFor(tuktukId)
  const { data, error } = await supabase
    .from('tuktuk_sidebar_ads')
    .select('*')
    .eq('tuktuk_id', tuktukId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data as SidebarAd[]) ?? []
}

/** All sidebar ads (active + paused) for one tuk-tuk — for the admin page. */
export async function listAllSidebarAdsForTuktuk(tuktukId: number): Promise<SidebarAd[]> {
  if (!isSupabaseConfigured) return demoSidebarAdsFor(tuktukId)
  const { data, error } = await supabase
    .from('tuktuk_sidebar_ads')
    .select('*')
    .eq('tuktuk_id', tuktukId)
    .order('sort_order')
  if (error) throw error
  return (data as SidebarAd[]) ?? []
}

export async function createSidebarAd(
  tuktukId: number,
  file: File,
  title: string,
): Promise<SidebarAd> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const ext = file.name.split('.').pop() || 'jpg'
  const mediaPath = `sidebar/${tuktukId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(mediaPath, file, { cacheControl: '31536000', upsert: false })
  if (uploadError) throw uploadError
  const mediaUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(mediaPath).data.publicUrl

  const { data: existing } = await supabase
    .from('tuktuk_sidebar_ads')
    .select('sort_order')
    .eq('tuktuk_id', tuktukId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextSort = existing && existing.length ? existing[0].sort_order + 1 : 0

  const { data, error } = await supabase
    .from('tuktuk_sidebar_ads')
    .insert({
      tuktuk_id: tuktukId,
      title,
      media_path: mediaPath,
      media_url: mediaUrl,
      sort_order: nextSort,
    })
    .select()
    .single()
  if (error) throw error
  return data as SidebarAd
}

export async function setSidebarAdActive(id: string, active: boolean) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuk_sidebar_ads').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

export async function deleteSidebarAd(id: string, mediaPath: string) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('tuktuk_sidebar_ads').delete().eq('id', id)
  if (error) throw error
  await supabase.storage.from(MEDIA_BUCKET).remove([mediaPath])
}
