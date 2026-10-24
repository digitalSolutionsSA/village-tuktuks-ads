import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { isSuperAdmin, useAuth } from '../context/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import { isSupabaseConfigured } from '../lib/supabase'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand-500 text-on-accent' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`

interface NavItem {
  to: string
  label: string
  end?: boolean
}

/** Everything sales people do. Main admins get these too. */
const SALES_LINKS: NavItem[] = [
  { to: '/admin', label: '▶ Pitch', end: true },
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/signup', label: 'Sign client' },
  { to: '/admin/clients', label: 'Clients' },
  { to: '/admin/ads', label: 'Ads' },
  { to: '/admin/statistics', label: 'Statistics' },
]

/** Main admins only. */
const SUPER_ADMIN_LINKS: NavItem[] = [
  { to: '/admin/sales-team', label: 'Sales team' },
  { to: '/admin/commissions', label: 'Commissions' },
  { to: '/admin/finance', label: 'Finance' },
  { to: '/admin/tuktuks', label: 'Tuk-tuks & areas' },
  { to: '/admin/logs', label: 'Logs' },
]

const Divider = () => <span className="mx-2 h-5 w-px shrink-0 bg-zinc-800" aria-hidden />

/**
 * The one Village Media portal for all staff — sales reps and management alike.
 * Home is the customer-facing pitch, so a rep can open it and stay there at a customer's premises.
 */
export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const superAdmin = isSuperAdmin(profile)
  const online = useOnlineStatus()
  const { theme } = useTheme()
  // The pitch (portal home) runs edge to edge; every other page sits in a centred column.
  const fullBleed = useLocation().pathname.replace(/\/$/, '') === '/admin'

  const groups = [SALES_LINKS, ...(superAdmin ? [SUPER_ADMIN_LINKS] : [])]

  return (
    <div data-theme={theme} className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="brand-stripe" aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link to="/admin" className="flex items-center gap-3">
            <img src="/LOGO.png" alt="" className="h-11 w-auto" />
            <span className="hidden text-sm font-semibold tracking-wide text-white sm:inline">Village Media</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <a
              href="/player?preview"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-brand-500/50 px-3 py-1.5 text-brand-300 hover:bg-brand-500/10"
            >
              ▶<span className="hidden sm:inline"> Preview player</span>
            </a>
            <NavLink
              to="/admin/account"
              title="My account · change password"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:text-white"
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-zinc-600'}`} />
              <span className="hidden max-w-[16rem] truncate md:inline">
                {profile?.display_name || profile?.username || profile?.email}
              </span>
              <span className="hidden rounded bg-brand-500/20 px-1.5 py-0.5 text-xs text-brand-300 sm:inline">
                {superAdmin ? 'management' : 'admin'}
              </span>
            </NavLink>
            <ThemeToggle />
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:px-6 lg:px-10">
          {groups.map((links, i) => (
            <span key={i} className="contents">
              {i > 0 && <Divider />}
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                  {l.label}
                </NavLink>
              ))}
            </span>
          ))}
        </nav>
      </header>
      {!isSupabaseConfigured && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-300">
          Demo mode — showing sample ads, not a real database. Connect Supabase (see README) to
          go live.
        </div>
      )}

      <main className={fullBleed ? '' : 'mx-auto max-w-6xl px-4 py-6'}>
        <Outlet />
      </main>
    </div>
  )
}
