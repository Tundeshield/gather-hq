import { NavLink, useNavigate } from 'react-router-dom'
import { logout, currentUser, isSuperAdmin, hasRole, currentChurchName } from '../auth'
import { LayoutDashboard, CalendarCheck, Users, MessageSquare, DollarSign, LogOut, Menu, X, CalendarRange, UserCog } from 'lucide-react'
import { useState } from 'react'

const allNavItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ['super_admin','admin','attendance_lead','viewer'] },
  { label: 'Attendance', to: '/attendance', icon: CalendarCheck, roles: ['super_admin','admin','attendance_lead'] },
  { label: 'Events', to: '/events', icon: CalendarRange, roles: ['super_admin','admin','attendance_lead'] },
  { label: 'People', to: '/people', icon: Users, roles: ['super_admin','admin'] },
  { label: 'Team', to: '/team', icon: UserCog, roles: ['super_admin'] },
]

const soonItems = [
  { label: 'Communication', icon: MessageSquare },
  { label: 'Giving', icon: DollarSign },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const user = currentUser()

  function handleLogout() { logout(); navigate('/login') }

  const navItems = allNavItems.filter(item =>
    user && item.roles.includes(user.role)
  )

  const content = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="text-lg font-bold text-black tracking-tight">GatherHQ</div>
        <div className="text-xs text-slate-400 mt-0.5">{currentChurchName()}</div>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-hide">
        <div className="px-5 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Main</div>
        {navItems.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium transition-all border-l-2 ${isActive
                ? 'bg-blue-50 text-blue-600 border-blue-600'
                : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-900'}`
            }>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
        {isSuperAdmin() && (
          <>
            <div className="px-5 py-2 mt-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Coming Soon</div>
            {soonItems.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium text-slate-300 cursor-not-allowed">
                <Icon size={16} />
                {label}
                <span className="ml-auto text-[9px] bg-blue-100 text-blue-500 px-1.5 py-0.5 rounded">Soon</span>
              </div>
            ))}
          </>
        )}
      </nav>
      <div className="px-5 py-4 border-t border-slate-100">
        <div className="text-xs text-slate-500 font-medium mb-0.5 truncate">{user?.name || 'Admin'}</div>
        <div className="text-[10px] text-slate-400 mb-2 truncate">{user?.email}</div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-300 rounded-md px-3 py-1.5 w-full transition-all">
          <LogOut size={13} /> Logout
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="md:hidden flex items-center gap-3 px-4 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-40">
        <button onClick={() => setOpen(!open)} className="text-slate-500">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="text-base font-bold text-black">GatherHQ</span>
      </div>
      {open && <div className="md:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setOpen(false)} />}
      <aside className={`fixed top-0 left-0 h-screen w-60 bg-white border-r border-slate-200 z-40 transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        {content}
      </aside>
    </>
  )
}
