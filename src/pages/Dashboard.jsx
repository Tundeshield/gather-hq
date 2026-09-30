import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { StatCard, Badge, EmptyState, Spinner } from '../components/UI'
import { LogOut } from 'lucide-react'
import { logout } from '../auth'

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ today: 0, active: 0, events: 0, sessions: 0 })
  const [recent, setRecent] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [sessSnap, evtSnap] = await Promise.all([
        getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'events'), orderBy('createdAt', 'desc')))
      ])
      const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const today = new Date().toISOString().split('T')[0]
      let todayCount = 0
      const counts = {}
      await Promise.all(sessions.slice(0, 10).map(async s => {
        const sub = await getDocs(collection(db, 'sessions', s.id, 'submissions'))
        counts[s.id] = sub.size
        if (s.date === today) todayCount += sub.size
      }))
      setStats({
        today: todayCount,
        active: sessions.filter(s => s.status === 'active').length,
        events: evtSnap.docs.length,
        sessions: sessions.length
      })
      setRecent(sessions.slice(0, 5).map(s => ({ ...s, count: counts[s.id] || 0 })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function handleLogout() { logout(); navigate('/login') }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner dark /></div>

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">The Elevation Church — Attendance</p>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-slate-500 border border-slate-200 px-3 py-2 rounded-md hover:border-red-300 hover:text-red-500 transition-all">
          <LogOut size={14} /> Logout
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        <StatCard label="Today's Attendance" value={stats.today} hero />
        <StatCard label="Active Sessions" value={stats.active} />
        <StatCard label="Total Events" value={stats.events} />
        <StatCard label="Total Sessions" value={stats.sessions} />
      </div>

      <div className="text-sm font-semibold text-black mb-3">Recent Sessions</div>
      {recent.length === 0 ? (
        <EmptyState icon="📋" title="No sessions yet" subtitle="Go to Attendance to create your first session." />
      ) : (
        <div className="space-y-2.5">
          {recent.map(s => (
            <div key={s.id} onClick={() => navigate('/attendance/' + s.id)}
              className="bg-white border border-slate-200 rounded-lg px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:border-blue-400 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-black">{s.name}</span>
                  <Badge variant={s.status === 'active' ? 'active' : 'closed'}>{s.status === 'active' ? 'Active' : 'Closed'}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{s.date} · {s.count} response{s.count !== 1 ? 's' : ''}</div>
              </div>
              <span className="text-slate-300 text-lg">›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
