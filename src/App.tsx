import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './components/AdminLayout'
import { Login } from './pages/admin/Login'
import { AdsList } from './pages/admin/AdsList'
import { AdForm } from './pages/admin/AdForm'
import { Statistics } from './pages/admin/Statistics'
import { Clients } from './pages/admin/Clients'
import { ClientSignup } from './pages/admin/ClientSignup'
import { SalesTeam } from './pages/admin/SalesTeam'
import { SalesRepDetail } from './pages/admin/SalesRepDetail'
import { ActivityLog } from './pages/admin/ActivityLog'
import { Commissions } from './pages/admin/Commissions'
import { Finance } from './pages/admin/Finance'
import { TuktuksAreas } from './pages/admin/TuktuksAreas'
import { Leads } from './pages/sales/Leads'
import { LeadDetail } from './pages/sales/LeadDetail'
import { Account } from './pages/Account'
import { Player } from './pages/player/Player'

// The pitch carries three.js + GSAP, so it loads on its own — the tuk-tuk tablets never download it.
const Pitch = lazy(() => import('./pages/sales/Pitch').then((m) => ({ default: m.Pitch })))

const pitchFallback = <p className="py-20 text-center text-zinc-500">Loading pitch…</p>

/** The projection is now a section of the pitch page — keep old links (incl. ?lead=) working. */
function ProjectionRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/admin', search, hash: '#projection' }} replace />
}

/** The old separate sales portal now lives inside /admin — keep bookmarked links working. */
function SalesRedirect() {
  const { pathname, search } = useLocation()
  const rest = pathname.replace(/^\/sales\/?/, '')
  const target = rest === '' || rest === 'pitch' ? '/admin' : `/admin/${rest}`
  return <Navigate to={target + search} replace />
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* The tablets in the tuk-tuks: ads start playing straight away. */}
        <Route path="/" element={<Player />} />
        <Route path="/player/:id" element={<Player />} />
        <Route path="/player" element={<Player />} />

        <Route path="/admin/login" element={<Login />} />
        <Route path="/sales/login" element={<Navigate to="/admin/login" replace />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin', 'sales']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={pitchFallback}>
                <Pitch />
              </Suspense>
            }
          />
          <Route path="projection" element={<ProjectionRedirect />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="signup" element={<ClientSignup />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/new" element={<ClientSignup />} />
          <Route path="ads" element={<AdsList />} />
          <Route path="ads/new" element={<AdForm />} />
          <Route path="ads/:id" element={<AdForm />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="account" element={<Account />} />
          <Route path="sales-team" element={<ProtectedRoute roles={['admin', 'sales']} superAdmin><SalesTeam /></ProtectedRoute>} />
          <Route path="sales-team/:id" element={<ProtectedRoute roles={['admin', 'sales']} superAdmin><SalesRepDetail /></ProtectedRoute>} />
          <Route path="logs" element={<ProtectedRoute roles={['admin', 'sales']} superAdmin><ActivityLog /></ProtectedRoute>} />
          <Route path="commissions" element={<ProtectedRoute roles={['admin', 'sales']} superAdmin><Commissions /></ProtectedRoute>} />
          <Route path="finance" element={<ProtectedRoute roles={['admin', 'sales']} superAdmin><Finance /></ProtectedRoute>} />
          <Route path="tuktuks" element={<ProtectedRoute roles={['admin', 'sales']} superAdmin><TuktuksAreas /></ProtectedRoute>} />
          {/* Removed pages (dashboard, marquee, packages, …) land on the pitch. */}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        <Route path="/sales/*" element={<SalesRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
