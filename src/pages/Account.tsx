import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { STAFF_EMAIL_DOMAIN } from '../lib/staffApi'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-brand-400'

/** "My account" in both portals — lets anyone signed in change their own password. */
export function Account() {
  const { session, profile } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const email = session?.user.email ?? ''
  const signInName = email.endsWith(`@${STAFF_EMAIL_DOMAIN}`) ? email.split('@')[0] : email

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next.length < 8) return setError('The new password must be at least 8 characters.')
    if (next !== confirm) return setError("The new passwords don't match.")
    if (next === current) return setError('Choose a password different from your current one.')
    if (!isSupabaseConfigured) return setError('Demo mode — connect Supabase to change passwords.')

    setSaving(true)
    try {
      // Supabase doesn't check the old password on update, so confirm it first —
      // otherwise anyone picking up a signed-in tablet could change it.
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current })
      if (authError) throw new Error('Your current password is wrong.')
      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) throw updateError
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-semibold text-white">My account</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {profile?.display_name && <>{profile.display_name} · </>}
        Signs in as <span className="text-zinc-200">{signInName}</span>
      </p>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-medium text-white">Change password</h2>
        <label className="block text-sm text-zinc-300">
          Current password
          <input type="password" required autoComplete="current-password" className={`mt-1 ${inputClass}`} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="block text-sm text-zinc-300">
          New password <span className="text-zinc-500">(at least 8 characters)</span>
          <input type="password" required minLength={8} autoComplete="new-password" className={`mt-1 ${inputClass}`} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="block text-sm text-zinc-300">
          Confirm new password
          <input type="password" required autoComplete="new-password" className={`mt-1 ${inputClass}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {done && <p className="text-sm text-green-400">Password changed. Use the new one next time you sign in.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-brand-500 py-3 font-medium text-on-accent hover:bg-brand-400 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
