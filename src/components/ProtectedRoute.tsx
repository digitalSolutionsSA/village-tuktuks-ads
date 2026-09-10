import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-400">
        Loading…
      </div>
    )
  }

  // No backend connected yet — let the demo dashboard through without a login.
  if (!session && isSupabaseConfigured) {
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
