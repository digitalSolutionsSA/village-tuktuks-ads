import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { homeFor, isSuperAdmin, useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import type { UserRole } from '../types'

/**
 * Signed-in staff only. `superAdmin` pages (sales performance, logs) send
 * everyone else back to the portal home. The database's RLS policies enforce
 * the same split, so this is about navigation, not security.
 */
export function ProtectedRoute({
  children,
  roles,
  loginPath = '/admin/login',
  superAdmin = false,
}: {
  children: ReactNode
  roles: UserRole[]
  loginPath?: string
  /** Management-only pages (sales performance, logs). */
  superAdmin?: boolean
}) {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  // No backend connected yet — let the demo dashboard through without a login.
  if (!isSupabaseConfigured) return <>{children}</>

  if (!session) return <Navigate to={loginPath} replace />

  if (!profile || (profile.role !== 'admin' && profile.role !== 'sales')) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center text-zinc-300">
        <p>This account doesn't have portal access. Ask Village Media management to set it up.</p>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
        >
          Sign out
        </button>
      </div>
    )
  }

  if (!roles.includes(profile.role)) return <Navigate to={homeFor(profile)} replace />
  if (superAdmin && !isSuperAdmin(profile)) return <Navigate to="/admin" replace />

  return <>{children}</>
}
