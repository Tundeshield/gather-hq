import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import { isLoggedIn, isPlatformAdmin, hasRole, currentUser } from './auth'

import Login from './pages/Login'
import Join from './pages/Join'
import Platform from './pages/Platform'
import Migrate from './pages/Migrate'
import Dashboard from './pages/Dashboard'
import Attendance from './pages/Attendance'
import SessionDetail from './pages/SessionDetail'
import BuilderPage from './pages/BuilderPage'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Members from './pages/Members'
import Team from './pages/Team'
import PublicForm from './pages/PublicForm'
import Register from './pages/Register'
import CheckIn from './pages/CheckIn'

function ProtectedLayout({ requiredRoles }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  if (isPlatformAdmin()) return <Navigate to="/platform" replace />
  const user = currentUser()
  if (requiredRoles && !requiredRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 md:ml-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}

function PlatformLayout() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  if (!isPlatformAdmin()) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Join />} />
          <Route path="/attend/:id" element={<PublicForm />} />
          <Route path="/register/:id" element={<Register />} />
          <Route path="/checkin/:id" element={<CheckIn />} />

          {/* Platform admin */}
          <Route element={<PlatformLayout />}>
            <Route path="/platform" element={<Platform />} />
          </Route>

          {/* All church users */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>

          {/* Attendance + Events */}
          <Route element={<ProtectedLayout requiredRoles={['super_admin','admin','attendance_lead']} />}>
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/attendance/:id" element={<SessionDetail />} />
            <Route path="/attendance/:id/builder" element={<BuilderPage />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/events/:id/builder" element={<BuilderPage />} />
          </Route>

          {/* People */}
          <Route element={<ProtectedLayout requiredRoles={['super_admin','admin']} />}>
            <Route path="/people" element={<Members />} />
          </Route>

          {/* Team — super admin only */}
          <Route element={<ProtectedLayout requiredRoles={['super_admin']} />}>
            <Route path="/team" element={<Team />} />
            <Route path="/migrate" element={<Migrate />} />
          </Route>

          <Route path="/" element={<Navigate to={isLoggedIn() ? (isPlatformAdmin() ? '/platform' : '/dashboard') : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
