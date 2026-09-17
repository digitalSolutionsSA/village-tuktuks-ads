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
import { Player } from './pages/player/Player'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/player/:id" element={<Player />} />
        <Route path="/player" element={<Player />} />

        <Route path="/admin/login" element={<Login />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
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
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
