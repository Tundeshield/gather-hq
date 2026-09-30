import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import { isLoggedIn } from './auth'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Attendance from './pages/Attendance'
import SessionDetail from './pages/SessionDetail'
import BuilderPage from './pages/BuilderPage'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import PublicForm from './pages/PublicForm'
import Register from './pages/Register'
import CheckIn from './pages/CheckIn'

function ProtectedLayout() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 md:ml-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/attend/:id" element={<PublicForm />} />
          <Route path="/register/:id" element={<Register />} />
          <Route path="/checkin/:id" element={<CheckIn />} />

          {/* Protected admin routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/attendance/:id" element={<SessionDetail />} />
            <Route path="/attendance/:id/builder" element={<BuilderPage />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/events/:id/builder" element={<BuilderPage />} />
          </Route>

          {/* Redirect root */}
          <Route path="/" element={<Navigate to={isLoggedIn() ? '/dashboard' : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
