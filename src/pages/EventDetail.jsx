import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { Badge, Btn, Spinner } from '../components/UI'
import QRCard from '../components/QRCard'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { ArrowLeft, Pencil } from 'lucide-react'

const APP_URL = window.location.origin

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [event, setEvent] = useState(null)
  const [regs, setRegs] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('regs')
  const [loading, setLoading] = useState(true)
  const [modeModal, setModeModal] = useState(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const snap = await getDoc(doc(db, 'events', id))
    if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    const rSnap = await getDocs(query(collection(db, 'events', id, 'registrations'), orderBy('createdAt', 'desc')))
    setRegs(rSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  async function switchMode(newMode) {
    setSwitching(true)
    await updateDoc(doc(db, 'events', id), { mode: newMode })
    setEvent(prev => ({ ...prev, mode: newMode }))
    setModeModal(null)
    setSwitching(false)
    toast('Mode updated.')
  }

  function modeBadge(mode) {
    if (mode === 'registration') return <Badge variant="registration">Registration Open</Badge>
    if (mode === 'checkin') return <Badge variant="checkin">Check-in Open</Badge>
    return <Badge variant="closed">Closed</Badge>
  }

  function copyWhatsApp() {
    if (!event) return
    const checked = regs.filter(r => r.checkedIn).length
    let txt = `📋 ${event.name} — ${event.date}\n📍 ${event.venue || ''}${event.startTime ? ' | ⏰ ' + event.startTime : ''}\n━━━━━━━━━━━━━━━━\nREGISTERED: ${regs.length} | CHECKED IN: ${checked}\n\n`
    regs.forEach((r, i) => { txt += `${i + 1}. ${r.name || ''} | ${r.phone || ''} | ${r.checkedIn ? '✓ Checked in' : 'Pending'}${r.isLateRegistrant ? ' | Late' : ''}\n` })
    txt += `━━━━━━━━━━━━━━━━`
    navigator.clipboard.writeText(txt).then(() => toast('Copied for WhatsApp!', 'success')).catch(() => toast('Copy failed', 'error'))
  }

  function copyEmails() {
    const fields = event?.fields || []
    const emailField = fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'))
    if (!emailField) { toast('No email field in this event', 'error'); return }
    const emails = [...new Set(regs.map(r => (r.data || {})[emailField.label]).filter(Boolean))]
    if (!emails.length) { toast('No emails found', 'error'); return }
    navigator.clipboard.writeText(emails.join(', ')).then(() => toast(`${emails.length} emails copied`, 'success')).catch(() => toast('Copy failed', 'error'))
  }

  function exportExcel() {
    if (!event) return
    const fields = event.fields || []
    const extra = fields.filter(f => !['Full Name', 'Phone Number'].includes(f.label))
    const headers = ['#', 'Name', 'Phone', ...extra.map(f => f.label), 'Checked In', 'Check-in Time', 'Late Registrant', 'Registered At']
    const rows = regs.map((r, i) => [
      i + 1, r.name || '', r.phone || '',
      ...extra.map(f => (r.data || {})[f.label] || ''),
      r.checkedIn ? 'Yes' : 'No',
      r.checkedInAt?.toDate?.()?.toLocaleString() || '',
      r.isLateRegistrant ? 'Yes' : 'No',
      r.createdAt?.toDate?.()?.toLocaleString() || ''
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations')
    XLSX.writeFile(wb, `${event.name}-${event.date}.xlsx`)
    toast('Excel downloaded!', 'success')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner dark /></div>
  if (!event) return <div className="p-7 text-slate-500">Event not found.</div>

  const checked = regs.filter(r => r.checkedIn).length
  const late = regs.filter(r => r.isLateRegistrant).length
  const fields = event.fields || []
  const extraFields = fields.filter(f => !['Full Name', 'Phone Number'].includes(f.label))
  const filtered = regs.filter(r => !search || (r.name || '').toLowerCase().includes(search.toLowerCase()) || (r.phone || '').includes(search))
  const regURL = `${APP_URL}/register/${id}`
  const ciURL = `${APP_URL}/checkin/${id}`

  return (
    <div className="p-7 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/events')} className="p-1.5 border border-slate-200 rounded-md text-slate-400 hover:text-slate-700 transition-all">
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-black">{event.name}</h1>
              {modeBadge(event.mode)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {event.date}{event.venue ? ' · ' + event.venue : ''}{event.startTime ? ' · ' + event.startTime : ''}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="secondary" onClick={() => navigate(`/events/${id}/builder?mode=event`)}><Pencil size={13} />Edit Form</Btn>
          {event.mode === 'registration' && <Btn onClick={() => setModeModal('checkin')}>Switch to Check-in Mode</Btn>}
          {event.mode === 'checkin' && <>
            <Btn variant="secondary" onClick={() => setModeModal('closed')}>Close Event</Btn>
            <Btn variant="success" onClick={() => window.open(ciURL, '_blank')}>📺 Open Check-in Screen</Btn>
          </>}
          {event.mode === 'closed' && <>
            <Btn variant="secondary" onClick={() => setModeModal('registration')}>Reopen Registration</Btn>
            <Btn variant="secondary" onClick={() => setModeModal('checkin')}>Reopen Check-in</Btn>
          </>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-black">{regs.length}</div>
          <div className="text-xs text-slate-400 mt-1">Registered</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-black">{checked}</div>
          <div className="text-xs text-slate-400 mt-1">Checked In</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-black">{late}</div>
          <div className="text-xs text-slate-400 mt-1">Late Registrants</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-5">
        {['regs', 'qrs'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${tab === t ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-700'}`}>
            {t === 'regs' ? 'Registrations' : 'QR Codes'}
          </button>
        ))}
      </div>

      {tab === 'regs' && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
              className="flex-1 min-w-[140px] border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            <Btn variant="secondary" className="text-xs" onClick={copyWhatsApp}>📋 WhatsApp</Btn>
            <Btn variant="secondary" className="text-xs" onClick={copyEmails}>📧 Emails</Btn>
            <Btn className="text-xs" onClick={exportExcel}>📥 Excel</Btn>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">#</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                    {extraFields.map(f => <th key={f.id} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{f.label}</th>)}
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={extraFields.length + 5} className="text-center py-12 text-slate-400 text-sm">No registrations yet.</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-400">{filtered.length - i}</td>
                      <td className="px-3 py-2.5">
                        {r.checkedIn
                          ? <Badge variant="checkin">✓ {r.checkedInAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || ''}</Badge>
                          : <Badge variant="closed">Pending</Badge>}
                        {r.isLateRegistrant && <span className="ml-1"><Badge variant="late">Late</Badge></span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{r.name || ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.phone || ''}</td>
                      {extraFields.map(f => <td key={f.id} className="px-3 py-2.5 text-slate-700">{(r.data || {})[f.label] || ''}</td>)}
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-xs">
                        {r.createdAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'qrs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <div className="text-sm font-semibold text-black mb-1">Registration QR</div>
              <div className="text-xs text-slate-400 mb-3">Members scan this to register before the event</div>
              <QRCard url={regURL} name={event.name} label="Scan to Register" preText="Register for" subText={`${event.date}${event.venue ? ' · ' + event.venue : ''}`} />
            </div>
            <div>
              <div className="text-sm font-semibold text-black mb-1">Check-in QR</div>
              <div className="text-xs text-slate-400 mb-3">Show on the day — members scan to check in</div>
              <QRCard url={ciURL} name={event.name} label="Scan to Check In" preText="Check in for" subText={`${event.date}${event.venue ? ' · ' + event.venue : ''}`} />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 max-w-2xl">
            💡 <strong>On the day:</strong> Display the Check-in QR on a screen or print it. Members scan it, enter their phone number, and check in instantly.
          </div>
        </div>
      )}

      {/* Mode switch modal */}
      <Modal show={!!modeModal} onClose={() => setModeModal(null)}
        title={modeModal === 'checkin' ? 'Switch to Check-in Mode?' : modeModal === 'closed' ? 'Close Event?' : 'Reopen Registration?'}
        subtitle={modeModal === 'checkin' ? 'Registration will stop. Only registered members can check in.' : modeModal === 'closed' ? 'The event will be marked as closed.' : 'People will be able to register again.'}
        actions={[
          <Btn key="c" variant="secondary" onClick={() => setModeModal(null)}>Cancel</Btn>,
          <Btn key="s" onClick={() => switchMode(modeModal)} disabled={switching}>{switching ? 'Switching...' : 'Confirm'}</Btn>
        ]} />
    </div>
  )
}
