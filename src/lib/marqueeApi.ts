import { isSupabaseConfigured, MEDIA_BUCKET, supabase } from './supabase'
import { demoMarqueeFor } from './demoData'
import type { MarqueeMessage } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to manage marquee messages.'

/** Active messages for one tuk-tuk: fleet-wide ones plus any aimed at it directly. */
export async function listMarqueeForTuktuk(tuktukId: number): Promise<MarqueeMessage[]> {
  if (!isSupabaseConfigured) return demoMarqueeFor(tuktukId)
  const { data, error } = await supabase
    .from('marquee_messages')
    .select('*')
    .or(`tuktuk_id.is.null,tuktuk_id.eq.${tuktukId}`)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data as MarqueeMessage[]) ?? []
}

/** Every marquee message (active + paused) — for the admin page. */
export async function listAllMarquee(): Promise<MarqueeMessage[]> {
  if (!isSupabaseConfigured) return [...demoMarqueeFor(1)]
  const { data, error } = await supabase
    .from('marquee_messages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as MarqueeMessage[]) ?? []
}

export async function createMarqueeMessage(input: {
  tuktukId: number | null
  advertiserName: string
  message: string
  file?: File | null
}): Promise<MarqueeMessage> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)

  let mediaPath: string | null = null
  let mediaUrl: string | null = null
  if (input.file) {
    const ext = input.file.name.split('.').pop() || 'jpg'
    mediaPath = `marquee/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(mediaPath, input.file, { cacheControl: '31536000', upsert: false })
    if (uploadError) throw uploadError
    mediaUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(mediaPath).data.publicUrl
  }

  const { data, error } = await supabase
    .from('marquee_messages')
    .insert({
      tuktuk_id: input.tuktukId,
      advertiser_name: input.advertiserName || null,
      message: input.message,
      media_path: mediaPath,
      media_url: mediaUrl,
    })
    .select()
    .single()
  if (error) throw error
  return data as MarqueeMessage
}

export async function setMarqueeActive(id: string, active: boolean) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('marquee_messages').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

export async function deleteMarqueeMessage(id: string, mediaPath: string | null) {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { error } = await supabase.from('marquee_messages').delete().eq('id', id)
  if (error) throw error
  if (mediaPath) await supabase.storage.from(MEDIA_BUCKET).remove([mediaPath])
}
