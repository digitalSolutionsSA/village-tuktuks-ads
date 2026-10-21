import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { isSupabaseConfigured } from '../lib/supabase'

const TABS = [
  { to: '/sales', label: 'Home', icon: '⌂', end: true },
  { to: '/sales/pitch', label: 'Pitch', icon: '▶' },
  { to: '/sales/leads', label: 'Leads', icon: '☰' },
  { to: '/sales/signup', label: 'Sign client', icon: '✎' },
  { to: '/sales/clients', label: 'My clients', icon: '✓' },
]

/** Village Media sales portal — touch-first, for reps on tablets at customers' premises. */
export function SalesLayout() {
  const { profile, signOut } = useAuth()
  const online = useOnlineStatus()

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">Village Media · Sales</p>
            <p className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-zinc-600'}`} />
              {profile?.display_name || profile?.username}
              {!online && ' · offline'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profile?.role === 'admin' && (
              <Link
                to="/admin"
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Management
              </Link>
            )}
            <Link
              to="/sales/account"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Account
            </Link>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {!isSupabaseConfigured && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-300">
          Demo mode — not connected to a real database.
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-3 text-xs font-medium ${
                  isActive ? 'text-purple-300' : 'text-zinc-400 hover:text-white'
                }`
              }
            >
              <span className="text-xl leading-none" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
