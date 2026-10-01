import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { normalizePhone } from '../utils'
import { Badge, Btn, Spinner } from '../components/UI'
import QRCard from '../components/QRCard'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { ArrowLeft, Pencil, Upload } from 'lucide-react'

const APP_URL = window.location.origin

// ── IMPORT REGISTRANTS MODAL ───────────────────────────────────
function ImportRegistrantsModal({ show, onClose, eventId, onImported }) {
  const toast = useToast()
  const fileRef = useRef()
  const [step, setStep] = useState('upload')
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [nameCol, setNameCol] = useState('')
  const [phoneCol, setPhoneCol] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)

  function reset() { setStep('upload'); setRows([]); setHeaders([]); setNameCol(''); setPhoneCol(''); setProgress(0) }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) { toast('File appears empty', 'error'); return }
      const hdrs = data[0].map(h => String(h).trim()).filter(Boolean)
      setHeaders(hdrs)
      setRows(data.slice(1).filter(r => r.some(c => c)))
      // Auto-detect columns
      hdrs.forEach(h => {
        const hl = h.toLowerCase()
        if (!nameCol && (hl.includes('name'))) setNameCol(h)
        if (!phoneCol && (hl.includes('phone') || hl.includes('mobile') || hl.includes('tel'))) setPhoneCol(h)
      })
      setStep('map')
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function doImport() {
    if (!nameCol || !phoneCol) { toast('Name and Phone columns required', 'error'); return }
    const nameIdx = headers.indexOf(nameCol)
    const phoneIdx = headers.indexOf(phoneCol)
    setImporting(true); setStep('importing')

    // Get existing registrations to avoid duplicates
    const existing = await getDocs(collection(db, 'events', eventId, 'registrations'))
    const existingPhones = new Set(existing.docs.map(d => d.data().phone))

    let imported = 0, skipped = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      setProgress(Math.round((i / rows.length) * 100))
      const name = String(r[nameIdx] || '').trim()
      const phone = normalizePhone(r[phoneIdx])
      if (!name || !phone) { skipped++; continue }
      if (existingPhones.has(phone)) { skipped++; continue }
      try {
        await addDoc(collection(db, 'events', eventId, 'registrations'), {
          name, phone,
          data: { 'Full Name': name, 'Phone Number': phone },
          checkedIn: false,
          isLateRegistrant: false,
          createdAt: serverTimestamp()
        })
        imported++
      } catch(e) { skipped++ }
    }
    setImporting(false)
    toast(`✅ Imported ${imported} registrants${skipped > 0 ? ` (${skipped} skipped)` : ''}`, 'success')
    onImported()
    reset()
    onClose()
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg p-7 w-full max-w-lg shadow-xl">
        <div className="text-lg font-bold text-black mb-1">Import Registrants</div>
        <div className="text-sm text-slate-500 mb-6">Upload an Excel sheet of pre-registered attendees.</div>

        {step === 'upload' && (
          <div>
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <Upload size={28} className="mx-auto text-slate-300 mb-3" />
              <div className="text-sm font-medium text-slate-600">Click to upload Excel file</div>
              <div className="text-xs text-slate-400 mt-1">.xlsx or .xls files</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
              Minimum columns needed: <strong>Name</strong> and <strong>Phone Number</strong>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div>
            <div className="text-sm font-medium text-black mb-4">{rows.length} rows found — map your columns:</div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-black mb-1.5">Full Name column <span className="text-red-500">*</span></label>
              <select value={nameCol} onChange={e => setNameCol(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white cursor-pointer">
                <option value="">Select column...</option>
                {headers.map(h => <option key={h}>{h}</option>)}
              </select>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-black mb-1.5">Phone Number column <span className="text-red-500">*</span></label>
              <select value={phoneCol} onChange={e => setPhoneCol(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white cursor-pointer">
                <option value="">Select column...</option>
                {headers.map(h => <option key={h}>{h}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" onClick={reset}>Back</Btn>
              <Btn onClick={doImport} disabled={!nameCol || !phoneCol}>Import {rows.length} Registrants</Btn>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="text-center py-8">
            <Spinner dark />
            <div className="text-sm font-medium text-black mt-4 mb-2">Importing registrants...</div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{width: progress + '%'}} />
            </div>
            <div className="text-xs text-slate-400">{progress}% complete</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
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
  const [showImport, setShowImport] = useState(false)

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
    regs.forEach((r, i) => { txt += `${i+1}. ${r.name||''} | ${r.phone||''} | ${r.checkedIn ? '✓ Checked in' : 'Pending'}${r.isLateRegistrant ? ' | Late' : ''}\n` })
    txt += `━━━━━━━━━━━━━━━━`
    navigator.clipboard.writeText(txt).then(() => toast('Copied!', 'success')).catch(() => toast('Copy failed', 'error'))
  }

  function copyEmails() {
    const emails = [...new Set(regs.map(r => (r.data || {})['Email Address'] || (r.data || {})['Email'] || '').filter(e => e.includes('@')))]
    if (!emails.length) { toast('No emails found', 'error'); return }
    navigator.clipboard.writeText(emails.join(', ')).then(() => toast(`${emails.length} emails copied`, 'success')).catch(() => toast('Copy failed', 'error'))
  }

  function exportExcel() {
    if (!event) return
    const fields = event.fields || []
    const extra = fields.filter(f => !['Full Name', 'Phone Number'].includes(f.label))
    const headers = ['#', 'Name', 'Phone', ...extra.map(f => f.label), 'Checked In', 'Check-in Time', 'Late Registrant', 'Registered At']
    const rows = regs.map((r, i) => [
      i+1, r.name||'', r.phone||'',
      ...extra.map(f => (r.data||{})[f.label]||''),
      r.checkedIn ? 'Yes' : 'No',
      r.checkedInAt?.toDate?.()?.toLocaleString()||'',
      r.isLateRegistrant ? 'Yes' : 'No',
      r.createdAt?.toDate?.()?.toLocaleString()||''
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
  const filtered = regs.filter(r => !search ||
    (r.name||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.phone||'').includes(search)
  )
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
          <Btn variant="secondary" onClick={() => setShowImport(true)}><Upload size={13} />Import Registrants</Btn>
          {event.mode === 'registration' && <Btn onClick={() => setModeModal('checkin')}>Switch to Check-in Mode</Btn>}
          {event.mode === 'checkin' && <>
            <Btn variant="secondary" onClick={() => setModeModal('closed')}>Close Event</Btn>
            <Btn variant="success" onClick={() => window.open(ciURL, '_blank')}>📺 Project Check-in QR</Btn>
          </>}
          {event.mode === 'closed' && <>
            <Btn variant="secondary" onClick={() => setModeModal('registration')}>Reopen Registration</Btn>
            <Btn variant="secondary" onClick={() => setModeModal('checkin')}>Reopen Check-in</Btn>
          </>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-blue-600 border border-blue-600 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{regs.length}</div>
          <div className="text-xs text-blue-200 mt-1">Registered</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-black">{checked}</div>
          <div className="text-xs text-slate-400 mt-1">Checked In</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-black">{late}</div>
          <div className="text-xs text-slate-400 mt-1">Late / Walk-in</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-5">
        {['regs', 'qrs'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${tab === t ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-700'}`}>
            {t === 'regs' ? `Registrations (${regs.length})` : 'QR Codes'}
          </button>
        ))}
      </div>

      {tab === 'regs' && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
              className="flex-1 min-w-[180px] border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            <Btn variant="secondary" className="text-xs" onClick={copyWhatsApp}>📋 WhatsApp</Btn>
            <Btn variant="secondary" className="text-xs" onClick={copyEmails}>📧 Emails</Btn>
            <Btn className="text-xs" onClick={exportExcel}>📥 Excel</Btn>
          </div>

          {regs.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-sm font-medium text-slate-500 mb-1">No registrations yet</div>
              <div className="text-xs text-slate-400">Share the registration QR or import a list</div>
            </div>
          ) : (
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
                    {filtered.map((r, i) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-400">{filtered.length - i}</td>
                        <td className="px-3 py-2.5">
                          {r.checkedIn
                            ? <Badge variant="checkin">✓ {r.checkedInAt?.toDate?.()?.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})||''}</Badge>
                            : <Badge variant="closed">Pending</Badge>}
                          {r.isLateRegistrant && <span className="ml-1"><Badge variant="late">Walk-in</Badge></span>}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{r.name||''}</td>
                        <td className="px-3 py-2.5 text-slate-500">{r.phone||''}</td>
                        {extraFields.map(f => <td key={f.id} className="px-3 py-2.5 text-slate-500">{(r.data||{})[f.label]||''}</td>)}
                        <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                          {r.createdAt?.toDate?.()?.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})||''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'qrs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <div className="text-sm font-semibold text-black mb-1">Registration QR</div>
              <div className="text-xs text-slate-400 mb-3">Members scan this to register before the event</div>
              <QRCard url={regURL} name={event.name} label="Scan to Register" preText="Register for" subText={`${event.date}${event.venue?' · '+event.venue:''}`} />
            </div>
            <div>
              <div className="text-sm font-semibold text-black mb-1">Check-in QR</div>
              <div className="text-xs text-slate-400 mb-3">Show on the day — members scan to check in</div>
              <QRCard url={ciURL} name={event.name} label="Scan to Check In" preText="Check in for" subText={`${event.date}${event.venue?' · '+event.venue:''}`} />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 max-w-2xl">
            💡 <strong>On the day:</strong> Display the Check-in QR on a screen. Members scan, enter their phone number, and are marked as checked in instantly — no form filling if they're in the directory.
          </div>
        </div>
      )}

      {/* Mode switch modal */}
      <Modal show={!!modeModal} onClose={() => setModeModal(null)}
        title={modeModal==='checkin'?'Switch to Check-in Mode?':modeModal==='closed'?'Close Event?':'Reopen Registration?'}
        subtitle={modeModal==='checkin'?'Registration will stop. Members scan the check-in QR to mark attendance.':modeModal==='closed'?'The event will be marked as closed.':'People will be able to register again.'}
        actions={[
          <Btn key="c" variant="secondary" onClick={() => setModeModal(null)}>Cancel</Btn>,
          <Btn key="s" onClick={() => switchMode(modeModal)} disabled={switching}>{switching?'Switching...':'Confirm'}</Btn>
        ]} />

      <ImportRegistrantsModal show={showImport} onClose={() => setShowImport(false)} eventId={id} onImported={load} />
    </div>
  )
}
