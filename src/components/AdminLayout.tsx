import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-white text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isSales = profile?.role === 'sales'
  const { pathname } = useLocation()

  // Sales staff only sign up clients — keep them out of ads, tuk-tuks and drivers.
  if (isSales && !pathname.startsWith('/admin/clients')) {
    return <Navigate to="/admin/clients" replace />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-wide text-white">
              Village Tuk-Tuks · Ad Platform
            </span>
            <nav className="flex flex-wrap gap-1">
              {!isSales && (
                <>
                  <NavLink to="/admin" end className={linkClass}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/admin/ads" className={linkClass}>
                    Ads
                  </NavLink>
                  <NavLink to="/admin/tuktuks" className={linkClass}>
                    Tuk-Tuks
                  </NavLink>
                  <NavLink to="/admin/groups" className={linkClass}>
                    Groups
                  </NavLink>
                  <NavLink to="/admin/marquee" className={linkClass}>
                    Marquee
                  </NavLink>
                  <NavLink to="/admin/statistics" className={linkClass}>
                    Statistics
                  </NavLink>
                </>
              )}
              <NavLink to="/admin/clients" className={linkClass}>
                Clients
              </NavLink>
              {isAdmin && (
                <NavLink to="/admin/drivers" className={linkClass}>
                  Drivers
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span>
              {profile?.display_name || profile?.email}
              {(isAdmin || isSales) && (
                <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-xs text-purple-300">
                  {profile?.role}
                </span>
              )}
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {!isSupabaseConfigured && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-300">
          Demo mode — showing sample ads, not a real database. Connect Supabase (see README) to
          go live.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
