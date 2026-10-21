import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './components/AdminLayout'
import { Landing } from './pages/Landing'
import { Login } from './pages/admin/Login'
import { Dashboard } from './pages/admin/Dashboard'
import { AdsList } from './pages/admin/AdsList'
import { AdForm } from './pages/admin/AdForm'
import { TuktuksOverview } from './pages/admin/TuktuksOverview'
import { TuktukDetail } from './pages/admin/TuktukDetail'
import { Groups } from './pages/admin/Groups'
import { Drivers } from './pages/admin/Drivers'
import { Marquee } from './pages/admin/Marquee'
import { Statistics } from './pages/admin/Statistics'
import { Clients } from './pages/admin/Clients'
import { ClientSignup } from './pages/admin/ClientSignup'
import { SalesTeam } from './pages/admin/SalesTeam'
import { SalesRepDetail } from './pages/admin/SalesRepDetail'
import { Packages } from './pages/admin/Packages'
import { SalesLayout } from './components/SalesLayout'
import { SalesHome } from './pages/sales/SalesHome'
import { Pitch } from './pages/sales/Pitch'
import { Projection } from './pages/sales/Projection'
import { Leads } from './pages/sales/Leads'
import { LeadDetail } from './pages/sales/LeadDetail'
import { Account } from './pages/Account'
import { Player } from './pages/player/Player'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/player/:id" element={<Player />} />
        <Route path="/player" element={<Player />} />

        <Route path="/admin/login" element={<Login />} />
        <Route path="/sales/login" element={<Login variant="sales" />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="ads" element={<AdsList />} />
          <Route path="ads/new" element={<AdForm />} />
          <Route path="ads/:id" element={<AdForm />} />
          <Route path="tuktuks" element={<TuktuksOverview />} />
          <Route path="tuktuks/:id" element={<TuktukDetail />} />
          <Route path="groups" element={<Groups />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="marquee" element={<Marquee />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/new" element={<ClientSignup />} />
          <Route path="sales-team" element={<SalesTeam />} />
          <Route path="sales-team/:id" element={<SalesRepDetail />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="packages" element={<Packages />} />
          <Route path="signup" element={<ClientSignup />} />
          <Route path="account" element={<Account />} />
        </Route>

        <Route
          path="/sales"
          element={
            <ProtectedRoute roles={['sales', 'admin']} loginPath="/sales/login">
              <SalesLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SalesHome />} />
          <Route path="pitch" element={<Pitch />} />
          <Route path="projection" element={<Projection />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="signup" element={<ClientSignup />} />
          <Route path="clients" element={<Clients />} />
          <Route path="account" element={<Account />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
