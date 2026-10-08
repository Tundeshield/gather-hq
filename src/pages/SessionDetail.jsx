import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { churchDoc, subCol, subDoc } from '../db'
import { doc, getDoc, updateDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { Badge, Btn, Spinner, EmptyState } from '../components/UI'
import QRCard from '../components/QRCard'
import { useToast } from '../components/Toast'
import { ArrowLeft, Pencil } from 'lucide-react'

const APP_URL = window.location.origin

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [session, setSession] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [search, setSearch] = useState('')
  const [filterFirstTimer, setFilterFirstTimer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    getDoc(churchDoc('sessions', id)).then(snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
    const unsub = onSnapshot(
      query(subCol('sessions', id, 'submissions'), orderBy('createdAt', 'desc')),
      snap => setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => unsub()
  }, [id])

  async function toggleStatus() {
    if (!session) return
    setToggling(true)
    const newStatus = session.status === 'active' ? 'closed' : 'active'
    await updateDoc(churchDoc('sessions', id), { status: newStatus })
    setSession(prev => ({ ...prev, status: newStatus }))
    setToggling(false)
    toast(newStatus === 'active' ? 'Session reopened.' : 'Session closed.')
  }

  function copyWhatsApp() {
    if (!session) return
    const fields = session.fields || []
    let txt = `📋 ${session.name} — ${session.date}\n━━━━━━━━━━━━━━━━\n`
    submissions.slice().reverse().forEach((s, i) => {
      const vals = fields.map(f => (s.data || {})[f.label] || '').filter(Boolean)
      txt += `${i + 1}. ${vals.join(' | ')}\n`
    })
    txt += `━━━━━━━━━━━━━━━━\n✅ Total: ${submissions.length} checked in`
    navigator.clipboard.writeText(txt).then(() => toast('Copied for WhatsApp!', 'success')).catch(() => toast('Copy failed', 'error'))
  }

  function copyEmails() {
    const fields = session?.fields || []
    const emailField = fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'))
    if (!emailField) { toast('No email field in this session', 'error'); return }
    const emails = [...new Set(submissions.map(s => (s.data || {})[emailField.label]).filter(Boolean))]
    if (!emails.length) { toast('No emails found', 'error'); return }
    navigator.clipboard.writeText(emails.join(', ')).then(() => toast(`${emails.length} emails copied — paste into BCC`, 'success')).catch(() => toast('Copy failed', 'error'))
  }

  function exportExcel() {
    if (!session) return
    const fields = session.fields || []
    // Export whatever is currently filtered
    const toExport = (search || filterFirstTimer) ? filtered : [...submissions].reverse()
    const headers = ['#', 'Time Submitted', ...fields.map(f => f.label)]
    const rows = [...toExport].reverse().map((s, i) => [
      i + 1,
      s.createdAt?.toDate?.()?.toLocaleString() || '',
      ...fields.map(f => (s.data || {})[f.label] || '')
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    const suffix = filterFirstTimer ? '-FirstTimers' : ''
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions')
    XLSX.writeFile(wb, `${session.name}-${session.date}${suffix}.xlsx`)
    toast(`Exported ${toExport.length} submission${toExport.length !== 1 ? 's' : ''}`, 'success')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner dark /></div>
  if (!session) return <div className="p-7 text-slate-500">Session not found.</div>

  const fields = session.fields || []

  // Detect first timer field — any field with "first timer" or "first time" in label
  const firstTimerField = fields.find(f =>
    f.label.toLowerCase().includes('first timer') ||
    f.label.toLowerCase().includes('first time') ||
    f.label.toLowerCase().includes('new member')
  )

  const firstTimerCount = firstTimerField
    ? submissions.filter(s => {
        const val = ((s.data || {})[firstTimerField.label] || '').toLowerCase()
        return val === 'yes' || val === 'true' || val === 'y'
      }).length
    : 0

  const filtered = submissions.filter(s => {
    if (search && !Object.values(s.data || {}).some(v => String(v).toLowerCase().includes(search.toLowerCase()))) return false
    if (filterFirstTimer && firstTimerField) {
      const val = ((s.data || {})[firstTimerField.label] || '').toLowerCase()
      if (val !== 'yes' && val !== 'true' && val !== 'y') return false
    }
    return true
  })

  const emailCount = [...new Set(submissions.flatMap(s => Object.values(s.data || {})).filter(v => typeof v === 'string' && v.includes('@')))].length
  const formURL = `${APP_URL}/attend/${id}`

  return (
    <div className="p-7 max-w-6xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/attendance')} className="p-1.5 border border-slate-200 rounded-md text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all">
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-black">{session.name}</h1>
              <Badge variant={session.status === 'active' ? 'active' : 'closed'}>{session.status === 'active' ? 'Active' : 'Closed'}</Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{session.date}{session.description ? ' · ' + session.description : ''}</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="secondary" onClick={() => navigate(`/attendance/${id}/builder`)}><Pencil size={13} />Edit Form</Btn>
          <Btn variant="secondary" onClick={toggleStatus} disabled={toggling}>
            {toggling ? 'Updating...' : session.status === 'active' ? 'Close Session' : 'Reopen Session'}
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        {/* Sidebar */}
        <div>
          <div className="bg-blue-600 rounded-lg p-5 text-white text-center mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1.5">Checked In</div>
            <div className="text-5xl font-bold leading-none">{submissions.length}</div>
            <div className="text-xs opacity-70 mt-2 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" /> Live
            </div>
          </div>

          {firstTimerField && (
            <button
              onClick={() => setFilterFirstTimer(f => !f)}
              className={`w-full rounded-lg p-4 text-center mb-3 border transition-all ${
                filterFirstTimer
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}>
              <div className="text-3xl font-bold leading-none mb-1">{firstTimerCount}</div>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80">First Timers</div>
              <div className="text-[10px] mt-1 opacity-70">
                {filterFirstTimer ? 'Showing first timers only — click to clear' : 'Click to filter'}
              </div>
            </button>
          )}
          <QRCard url={formURL} name={session.name} />
        </div>

        {/* Main */}
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search submissions..."
              className="flex-1 min-w-[140px] border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            {firstTimerField && (
              <button
                onClick={() => setFilterFirstTimer(f => !f)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border transition-all ${
                  filterFirstTimer
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                }`}>
                🌟 First Timers {filterFirstTimer && `(${firstTimerCount})`}
              </button>
            )}
            <Btn variant="secondary" className="text-xs" onClick={copyWhatsApp}>📋 WhatsApp</Btn>
            <Btn variant="secondary" className="text-xs" onClick={copyEmails}>📧 Emails ({emailCount})</Btn>
            <Btn className="text-xs" onClick={exportExcel}>📥 Excel</Btn>
          </div>
          {(search || filterFirstTimer) && (
            <div className="text-xs text-slate-400 mb-3">
              Showing <strong className="text-slate-700">{filtered.length}</strong> of {submissions.length} submissions
              {filterFirstTimer && <span className="ml-1 text-amber-600 font-medium">· First Timers only</span>}
              {(search || filterFirstTimer) && (
                <button onClick={() => { setSearch(''); setFilterFirstTimer(false) }} className="ml-2 text-blue-500 underline">Clear</button>
              )}
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">#</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Time</th>
                    {fields.map(f => (
                      <th key={f.id} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={fields.length + 2} className="text-center py-12 text-slate-400 text-sm">No submissions yet. Share the QR or link.</td></tr>
                  ) : filtered.map((s, i) => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-400">{filtered.length - i}</td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {s.createdAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || ''}
                      </td>
                      {fields.map(f => (
                        <td key={f.id} className="px-3 py-2.5 text-slate-700">{(s.data || {})[f.label] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
