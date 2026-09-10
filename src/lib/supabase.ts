import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True once VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY have been filled in. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Falls back to a harmless placeholder so the app can render a "not configured"
// screen instead of crashing when env vars haven't been set up yet.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
)

// Named to avoid "ads"/"ads-media" appearing in request paths — ad-blocker
// extensions (uBlock, Brave, AdGuard, etc.) commonly block any URL containing
// that substring, which silently breaks uploads/edits for a lot of real users.
export const MEDIA_BUCKET = 'creative-media'
