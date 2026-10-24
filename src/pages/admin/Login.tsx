import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { homeFor, useAuth } from '../../context/AuthContext'
import { loginEmail, recordSignIn } from '../../lib/staffApi'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'

/** One sign-in for all staff — sales reps (username) and management (email). */
export function Login() {
  const { session, profile, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { theme } = useTheme()

  if (session && !loading) return <Navigate to={homeFor(profile)} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password })
    setSubmitting(false)
    if (!error) void recordSignIn().catch(() => {})
    if (error) {
      setError(
        /invalid login|credentials/i.test(error.message)
          ? 'Wrong username or password.'
          : /banned/i.test(error.message)
            ? 'This account has been deactivated. Contact Village Media management.'
            : error.message,
      )
    }
  }

  return (
    <div data-theme={theme} className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="absolute right-4 top-4 text-sm">
        <ThemeToggle />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6 pt-0"
      >
        <div className="brand-stripe -mx-6 mb-6" aria-hidden />
        <img src="/LOGO.png" alt="Village Media" className="mx-auto mb-4 h-24 w-auto" />
        <h1 className="mb-1 text-lg font-semibold text-white">
          Staff sign in
        </h1>
        <p className="mb-5 text-sm text-zinc-400">Village Media · Village Tuk advertising network</p>

        <label className="mb-1 block text-xs font-medium text-zinc-400">
          Username or email
        </label>
        <input
          required
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-brand-400"
        />

        <label className="mb-1 block text-xs font-medium text-zinc-400">Password</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-brand-400"
        />

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-500 py-3 text-sm font-medium text-on-accent hover:bg-brand-400 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          <Link to="/" className="hover:text-zinc-300 hover:underline">
            ← Back to the ads
          </Link>
        </p>

        {!isSupabaseConfigured && (
          <p className="mt-3 text-center text-xs text-zinc-500">
            No database connected yet —{' '}
            <Link to="/admin" className="text-amber-300 hover:underline">
              preview the demo
            </Link>
          </p>
        )}
      </form>
    </div>
  )
}
