import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore'
import { logout } from '../auth'
import { Spinner, Btn } from '../components/UI'
import { LogOut, Building2, Users, CalendarCheck, Activity } from 'lucide-react'

export default function Platform() {
  const navigate = useNavigate()
  const [churches, setChurches] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, totalMembers: 0, totalSessions: 0 })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const churchSnap = await getDocs(query(collection(db, 'churches'), orderBy('createdAt', 'desc')))
      const churchData = []

      for (const c of churchSnap.docs) {
        const data = c.data()
        // Load counts for each church
        const [membersSnap, sessionsSnap, eventsSnap, teamSnap] = await Promise.all([
          getDocs(collection(db, 'churches', c.id, 'members')),
          getDocs(collection(db, 'churches', c.id, 'sessions')),
          getDocs(collection(db, 'churches', c.id, 'events')),
          getDocs(query(collection(db, 'churches', c.id, 'team')))
        ])

        // Find last session date
        let lastActivity = null
        sessionsSnap.docs.forEach(s => {
          const d = s.data().createdAt?.toDate?.()
          if (d && (!lastActivity || d > lastActivity)) lastActivity = d
        })

        churchData.push({
          id: c.id,
          name: data.name || 'The Elevation Church',
          branch: data.branch || '',
          active: data.active !== false,
          createdAt: data.createdAt,
          memberCount: membersSnap.size,
          sessionCount: sessionsSnap.size,
          eventCount: eventsSnap.size,
          teamCount: teamSnap.size,
          lastActivity
        })
      }

      setChurches(churchData)
      setStats({
        total: churchData.length,
        totalMembers: churchData.reduce((a, c) => a + c.memberCount, 0),
        totalSessions: churchData.reduce((a, c) => a + c.sessionCount, 0)
      })
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function toggleChurch(church) {
    await updateDoc(doc(db, 'churches', church.id), { active: !church.active })
    setChurches(prev => prev.map(c => c.id === church.id ? {...c, active: !c.active} : c))
  }

  function handleLogout() { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-black">GatherHQ</div>
          <div className="text-xs text-slate-400">Platform Admin Dashboard</div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-slate-500 border border-slate-200 px-3 py-2 rounded-md hover:border-red-300 hover:text-red-500 transition-all">
          <LogOut size={14} /> Logout
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-blue-600 rounded-lg p-5 text-white">
            <Building2 size={20} className="opacity-70 mb-2" />
            <div className="text-3xl font-bold">{stats.total}</div>
            <div className="text-xs text-blue-200 mt-1">Active Branches</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <Users size={20} className="text-slate-400 mb-2" />
            <div className="text-3xl font-bold text-black">{stats.totalMembers.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-1">Total Members Across All Branches</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <CalendarCheck size={20} className="text-slate-400 mb-2" />
            <div className="text-3xl font-bold text-black">{stats.totalSessions}</div>
            <div className="text-xs text-slate-400 mt-1">Total Sessions Recorded</div>
          </div>
        </div>

        {/* Invite link */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-blue-700 mb-0.5">Branch Invite Link</div>
            <div className="text-xs text-blue-500 font-mono break-all">
              {window.location.origin}/join?token=VxkiqXgOOVKr-oX-J-yBO0OsnmTC0Pez
            </div>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join?token=VxkiqXgOOVKr-oX-J-yBO0OsnmTC0Pez`); alert('Copied!') }}
            className="flex-shrink-0 bg-blue-600 text-white text-xs px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
            Copy Link
          </button>
        </div>

        {/* Branches table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-black">All Branches</div>
            <div className="text-xs text-slate-400">{churches.length} branch{churches.length !== 1 ? 'es' : ''}</div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner dark /></div>
          ) : churches.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Building2 size={32} className="mx-auto mb-3 opacity-30" />
              <div className="text-sm">No branches yet. Share the invite link to get started.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Branch', 'Members', 'Sessions', 'Events', 'Team', 'Last Activity', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {churches.map(c => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-black">{c.name}</div>
                        <div className="text-xs text-blue-600 font-medium">{c.branch}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{c.memberCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500">{c.sessionCount}</td>
                      <td className="px-4 py-3 text-slate-500">{c.eventCount}</td>
                      <td className="px-4 py-3 text-slate-500">{c.teamCount}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {c.lastActivity
                          ? c.lastActivity.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'No activity yet'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-sm border ${c.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {c.active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleChurch(c)}
                          className="text-xs text-slate-400 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 transition-colors">
                          {c.active ? 'Suspend' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
