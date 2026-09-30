import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
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
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'sessions', id)).then(snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
    const unsub = onSnapshot(
      query(collection(db, 'sessions', id, 'submissions'), orderBy('createdAt', 'desc')),
      snap => setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => unsub()
  }, [id])

  async function toggleStatus() {
    if (!session) return
    setToggling(true)
    const newStatus = session.status === 'active' ? 'closed' : 'active'
    await updateDoc(doc(db, 'sessions', id), { status: newStatus })
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
    const headers = ['#', 'Time Submitted', ...fields.map(f => f.label)]
    const rows = [...submissions].reverse().map((s, i) => [
      i + 1,
      s.createdAt?.toDate?.()?.toLocaleString() || '',
      ...fields.map(f => (s.data || {})[f.label] || '')
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions')
    XLSX.writeFile(wb, `${session.name}-${session.date}.xlsx`)
    toast('Excel downloaded!', 'success')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner dark /></div>
  if (!session) return <div className="p-7 text-slate-500">Session not found.</div>

  const fields = session.fields || []
  const filtered = submissions.filter(s =>
    !search || Object.values(s.data || {}).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  )
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
          <QRCard url={formURL} name={session.name} />
        </div>

        {/* Main */}
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search submissions..."
              className="flex-1 min-w-[140px] border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            <Btn variant="secondary" className="text-xs" onClick={copyWhatsApp}>📋 WhatsApp</Btn>
            <Btn variant="secondary" className="text-xs" onClick={copyEmails}>📧 Emails ({emailCount})</Btn>
            <Btn className="text-xs" onClick={exportExcel}>📥 Excel</Btn>
          </div>

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
