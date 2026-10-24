// Creates and manages Village Media staff logins (sales reps and admins).
// Only callable by an active super admin (profiles.super_admin). Staff sign in with a username; behind the
// scenes each username maps to <username>@STAFF_EMAIL_DOMAIN in Supabase Auth
// (keep in sync with src/lib/staffApi.ts). No email is ever sent to it.
//
// Actions (POST JSON):
//   { action: 'create', username, password, display_name, role?, phone?, monthly_target? }
//   { action: 'update', user_id, display_name?, phone?, monthly_target?, role? }
//   { action: 'set_password', user_id, password }
//   { action: 'set_active', user_id, active }
//   { action: 'delete', user_id }
import { createClient } from 'npm:@supabase/supabase-js@2'

const STAFF_EMAIL_DOMAIN = 'staff.villagemedia.local'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/
const ROLES = ['admin', 'sales']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json(401, { error: 'Please sign in again.' })

  const { data: caller } = await admin
    .from('profiles')
    .select('super_admin, active')
    .eq('id', userData.user.id)
    .single()
  if (!caller?.super_admin || !caller.active) return json(403, { error: 'Only management can manage staff.' })

  const body = await req.json().catch(() => ({}))
  const optionalText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const optionalInt = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number.parseInt(String(v), 10) || null)
  const checkPassword = (p: unknown) =>
    typeof p === 'string' && p.length >= 8 ? null : 'Password must be at least 8 characters.'

  // Super admin accounts are set in schema.sql §15 and can't be changed from the app.
  const isProtected = async (userId: unknown) => {
    if (typeof userId !== 'string') return false
    const { data } = await admin.from('profiles').select('super_admin').eq('id', userId).maybeSingle()
    return Boolean(data?.super_admin)
  }

  switch (body.action) {
    case 'create': {
      const username = String(body.username ?? '').trim().toLowerCase()
      if (!USERNAME_RE.test(username)) {
        return json(400, { error: 'Username must be 3–30 characters: letters, numbers, dots, dashes or underscores.' })
      }
      const pwError = checkPassword(body.password)
      if (pwError) return json(400, { error: pwError })
      const displayName = optionalText(body.display_name)
      if (!displayName) return json(400, { error: 'Full name is required.' })
      const role = ROLES.includes(body.role) ? body.role : 'sales'

      const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (taken) return json(409, { error: `The username "${username}" is already taken.` })

      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${username}@${STAFF_EMAIL_DOMAIN}`,
        password: body.password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })
      if (error || !created.user) return json(400, { error: error?.message ?? 'Could not create the user.' })

      // The on_auth_user_created trigger has already inserted the profile row.
      const { error: profileError } = await admin
        .from('profiles')
        .update({
          username,
          display_name: displayName,
          role,
          phone: optionalText(body.phone),
          monthly_target: optionalInt(body.monthly_target),
          active: true,
        })
        .eq('id', created.user.id)
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json(500, { error: profileError.message })
      }
      return json(200, { user_id: created.user.id })
    }

    case 'update': {
      if (typeof body.user_id !== 'string') return json(400, { error: 'user_id is required' })
      const patch: Record<string, unknown> = {}
      if ('display_name' in body) patch.display_name = optionalText(body.display_name)
      if ('phone' in body) patch.phone = optionalText(body.phone)
      if ('monthly_target' in body) patch.monthly_target = optionalInt(body.monthly_target)
      if ('role' in body) {
        if (!ROLES.includes(body.role)) return json(400, { error: 'Invalid role.' })
        if (await isProtected(body.user_id)) return json(400, { error: "Management accounts can't be changed here." })
        patch.role = body.role
      }
      const { error } = await admin.from('profiles').update(patch).eq('id', body.user_id)
      if (error) return json(500, { error: error.message })
      return json(200, { ok: true })
    }

    case 'set_password': {
      if (typeof body.user_id !== 'string') return json(400, { error: 'user_id is required' })
      const pwError = checkPassword(body.password)
      if (pwError) return json(400, { error: pwError })
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password })
      if (error) return json(400, { error: error.message })
      return json(200, { ok: true })
    }

    case 'set_active': {
      if (typeof body.user_id !== 'string') return json(400, { error: 'user_id is required' })
      if (body.user_id === userData.user.id) return json(400, { error: "You can't deactivate your own account." })
      if (await isProtected(body.user_id)) return json(400, { error: "Management accounts can't be deactivated." })
      const active = Boolean(body.active)
      // Banning blocks new sign-ins; is_staff() checks `active`, so existing sessions lose access too.
      const { error: banError } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: active ? 'none' : '876000h',
      })
      if (banError) return json(400, { error: banError.message })
      const { error } = await admin.from('profiles').update({ active }).eq('id', body.user_id)
      if (error) return json(500, { error: error.message })
      if (!active) {
        await admin
          .from('staff_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('user_id', body.user_id)
          .is('ended_at', null)
      }
      return json(200, { ok: true })
    }

    case 'delete': {
      if (typeof body.user_id !== 'string') return json(400, { error: 'user_id is required' })
      if (body.user_id === userData.user.id) return json(400, { error: "You can't delete your own account." })
      if (await isProtected(body.user_id)) return json(400, { error: "Management accounts can't be deleted." })
      // Their clients, contracts and leads stay (created_by/owner_id are set to null);
      // the activity log keeps their name in actor_name.
      const { error } = await admin.auth.admin.deleteUser(body.user_id)
      if (error) return json(400, { error: error.message })
      return json(200, { ok: true })
    }

    default:
      return json(400, { error: 'Unknown action.' })
  }
})
