import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-white text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`

const FLEET_LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/ads', label: 'Ads' },
  { to: '/admin/tuktuks', label: 'Tuk-Tuks' },
  { to: '/admin/groups', label: 'Groups' },
  { to: '/admin/drivers', label: 'Drivers' },
  { to: '/admin/marquee', label: 'Marquee' },
  { to: '/admin/statistics', label: 'Statistics' },
]

const SALES_LINKS = [
  { to: '/admin/sales-team', label: 'Sales team' },
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/clients', label: 'Clients' },
  { to: '/admin/packages', label: 'Packages' },
]

/** Village Media management portal — admins only (see ProtectedRoute in App.tsx). */
export function AdminLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold tracking-wide text-white">Village Media · Management</span>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <a
              href="/player?preview"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-purple-500/50 px-3 py-1.5 text-purple-300 hover:bg-purple-500/10"
            >
              ▶ Preview player
            </a>
            <NavLink
              to="/sales"
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              Sales portal
            </NavLink>
            <NavLink to="/admin/account" title="My account · change password" className="hover:text-white">
              {profile?.display_name || profile?.username || profile?.email}
              <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-xs text-purple-300">admin</span>
            </NavLink>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 pb-3">
          {FLEET_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
          <span className="mx-2 h-5 w-px bg-zinc-800" aria-hidden />
          {SALES_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>
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
