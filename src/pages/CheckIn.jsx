import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  doc, getDoc, updateDoc, addDoc,
  collection, query, where, getDocs, serverTimestamp, increment
} from 'firebase/firestore'
import { Spinner } from '../components/UI'
import { findSessionById, findEventById, submissionsCol, registrationsCol, membersCol, memberDocRef } from '../publicDb'
import { normalizePhone } from '../utils'

// ── FIELD INPUT ────────────────────────────────────────────────
function FieldInput({ field, value, onChange }) {
  const base = 'w-full border border-slate-200 rounded-lg px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-all'
  if (field.type === 'dropdown') {
    const opts = (field.options || '').split(',').map(o => o.trim()).filter(Boolean)
    return <select className={base + ' cursor-pointer'} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select...</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  }
  const t = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text'
  return <input type={t} className={base} value={value} onChange={e => onChange(e.target.value)}
    placeholder={field.type === 'phone' ? 'e.g. 08012345678' : field.label} />
}

// ── WELCOME ANIMATION ──────────────────────────────────────────
function WelcomeBack({ name }) {
  return (
    <div className="text-center py-4 animate-pulse-once">
      <div className="text-5xl mb-3">👋</div>
      <div className="text-xl font-bold text-black">Welcome back,</div>
      <div className="text-2xl font-bold text-blue-600 mt-1">{name}!</div>
      <div className="text-sm text-slate-400 mt-2">Attendance recorded ✅</div>
    </div>
  )
}

// ── MAIN CHECK-IN ──────────────────────────────────────────────
export default function CheckIn() {
  const { id } = useParams()
  // id could be a session id or event id — we handle both
  const [record, setRecord] = useState(null)  // session or event
  const [recordType, setRecordType] = useState(null) // 'session' | 'event'
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState('phone') // phone | welcome | already | newmember | latesuccess | notopen
  const [phone, setPhone] = useState('')
  const [looking, setLooking] = useState(false)
  const [foundMember, setFoundMember] = useState(null)
  const [newForm, setNewForm] = useState({ name: '', email: '' })
  const [newErrors, setNewErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [alreadyTime, setAlreadyTime] = useState('')
  const phoneRef = useRef()

  useEffect(() => { loadRecord() }, [id])

  async function loadRecord() {
    // Try session first, then event
    let data = await findSessionById(id).catch(() => null)
    if (data) { setRecord(data); setRecordType('session'); setLoading(false); return }
    data = await findEventById(id).catch(() => null)
    if (data) { setRecord(data); setRecordType('event'); setLoading(false); return }
    setLoading(false)
  }

  useEffect(() => { if (state === 'phone') setTimeout(() => phoneRef.current?.focus(), 100) }, [state])



  async function lookup() {
    const p = normalizePhone(phone)
    if (!p) return
    setLooking(true)

    try {
      if (recordType === 'session') {
        await handleSessionCheckin(p)
      } else {
        await handleEventCheckin(p)
      }
    } catch(e) {
      console.error(e)
      alert('Network error. Please try again.')
    } finally {
      setLooking(false)
    }
  }

  // ── SESSION CHECK-IN ────────────────────────────────────────
  async function handleSessionCheckin(p) {
    // Check if already checked in today
    const existingSub = await getDocs(query(
      submissionsCol(record.churchId, id),
      where('phone', '==', p)
    ))
    if (!existingSub.empty) {
      const sub = existingSub.docs[0].data()
      const time = sub.createdAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || 'earlier'
      setAlreadyTime(time)
      setState('already')
      setTimeout(() => resetToPhone(), 3000)
      return
    }

    // Look up in member directory
    const memberSnap = await getDocs(query(membersCol(record.churchId), where('phone', '==', p)))
    if (!memberSnap.empty) {
      const member = { id: memberSnap.docs[0].id, ...memberSnap.docs[0].data() }
      setFoundMember(member)
      // Auto check-in
      await recordSessionCheckin(p, member.name, member.id)
      setState('welcome')
      setTimeout(() => resetToPhone(), 3000)
    } else {
      // New person — show short form
      setFoundMember(null)
      setState('newmember')
    }
  }

  async function recordSessionCheckin(p, name, memberId) {
    const data = { name: name || '', phone: p }
    // Add any extra fields from session
    await addDoc(submissionsCol(record.churchId, id), {
      data, phone: p, createdAt: serverTimestamp()
    })
    // Update member stats
    if (memberId) {
      await updateDoc(memberDocRef(record.churchId, memberId), {
        lastSeenAt: serverTimestamp(),
        totalAttendance: increment(1)
      })
    }
  }

  async function submitNewMember() {
    const errs = {}
    if (!newForm.name.trim()) errs.name = 'Name is required'
    if (Object.keys(errs).length) { setNewErrors(errs); return }
    const p = normalizePhone(phone)
    setSubmitting(true)
    try {
      // Add to member directory
      const memberRef = await addDoc(membersCol(record.churchId), {
        name: newForm.name.trim(),
        phone: p,
        email: newForm.email.trim(),
        totalAttendance: 1,
        lastSeenAt: serverTimestamp(),
        createdAt: serverTimestamp()
      })
      // Record attendance
      await addDoc(submissionsCol(record.churchId, id), {
        data: { name: newForm.name.trim(), phone: p, email: newForm.email.trim() },
        phone: p,
        createdAt: serverTimestamp()
      })
      setFoundMember({ name: newForm.name.trim() })
      setState('welcome')
      setTimeout(() => resetToPhone(), 3000)
    } catch(e) { alert('Failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  // ── EVENT CHECK-IN ──────────────────────────────────────────
  async function handleEventCheckin(p) {
    // 1. Check registrations subcollection first
    const regSnap = await getDocs(query(
      registrationsCol(record.churchId, id),
      where('phone', '==', p)
    ))

    if (!regSnap.empty) {
      const reg = { id: regSnap.docs[0].id, ...regSnap.docs[0].data() }
      if (reg.checkedIn) {
        const time = reg.checkedInAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || 'earlier'
        setAlreadyTime(time)
        setState('already')
        setTimeout(() => resetToPhone(), 3000)
        return
      }
      await updateDoc(doc(registrationsCol(record.churchId, id), reg.id), {
        checkedIn: true, checkedInAt: serverTimestamp()
      })
      setFoundMember({ name: reg.name || 'there' })
      setState('welcome')
      setTimeout(() => resetToPhone(), 3000)
      return
    }

    // 2. Not in registrations — check members directory
    const memberSnap = await getDocs(query(membersCol(record.churchId), where('phone', '==', p)))
    if (!memberSnap.empty) {
      const member = { id: memberSnap.docs[0].id, ...memberSnap.docs[0].data() }
      // Auto-register and check them in as late registrant
      await addDoc(registrationsCol(record.churchId, id), {
        phone: p,
        name: member.name,
        data: { 'Full Name': member.name, 'Phone Number': p, 'Email Address': member.email || '' },
        checkedIn: true,
        checkedInAt: serverTimestamp(),
        isLateRegistrant: true,
        createdAt: serverTimestamp()
      })
      // Update member stats
      await updateDoc(memberDocRef(record.churchId, member.id), {
        lastSeenAt: serverTimestamp(),
        totalAttendance: increment(1)
      })
      setFoundMember({ name: member.name })
      setState('welcome')
      setTimeout(() => resetToPhone(), 3000)
      return
    }

    // 3. Completely new — show short form
    setFoundMember(null)
    setState('newmember')
  }

  async function submitLateEvent() {
    const errs = {}
    if (!newForm.name.trim()) errs.name = 'Name is required'
    if (Object.keys(errs).length) { setNewErrors(errs); return }
    const p = normalizePhone(phone)
    setSubmitting(true)
    try {
      await addDoc(registrationsCol(record.churchId, id), {
        phone: p,
        name: newForm.name.trim(),
        data: { 'Full Name': newForm.name.trim(), 'Phone Number': p, 'Email Address': newForm.email.trim() },
        checkedIn: true,
        checkedInAt: serverTimestamp(),
        isLateRegistrant: true,
        createdAt: serverTimestamp()
      })
      setFoundMember({ name: newForm.name.trim() })
      setState('welcome')
      setTimeout(() => resetToPhone(), 3000)
    } catch(e) { alert('Failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  function resetToPhone() {
    setState('phone')
    setPhone('')
    setFoundMember(null)
    setNewForm({ name: '', email: '' })
    setNewErrors({})
  }

  // ── RENDER ──────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Spinner />
    </div>
  )

  if (!record) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center text-white">
        <div className="text-4xl mb-3">🔍</div>
        <div className="text-lg font-semibold">Not found</div>
        <div className="text-sm text-white/50 mt-1">Please scan the correct QR code.</div>
      </div>
    </div>
  )

  const isOpen = recordType === 'session'
    ? record.status === 'active'
    : record.mode === 'checkin'

  if (!isOpen) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center text-white">
        <div className="text-4xl mb-3">🕐</div>
        <div className="text-lg font-semibold">
          {recordType === 'session' ? 'Check-in is closed.' : 'Check-in not open yet.'}
        </div>
        <div className="text-sm text-white/50 mt-1">Please see an usher.</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      {/* Event/Session name */}
      <div className="text-white text-xl font-bold text-center mb-1">{record.name}</div>
      <div className="text-white/50 text-sm text-center mb-8">
        {record.date}{record.venue ? ' · ' + record.venue : ''}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl p-7 w-full max-w-sm shadow-2xl min-h-[280px] flex flex-col justify-center">

        {/* Phone lookup */}
        {state === 'phone' && (
          <div>
            <div className="text-base font-semibold text-black mb-1 text-center">Check In</div>
            <div className="text-sm text-slate-400 mb-5 text-center">Enter your phone number</div>
            <input
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !looking && phone.trim() && lookup()}
              placeholder="e.g. 08012345678"
              className="w-full border border-slate-200 rounded-xl px-4 py-4 text-xl text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 mb-4 font-mono"
              autoFocus
            />
            <button onClick={lookup} disabled={looking || !phone.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 text-base font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {looking ? <><Spinner />Checking...</> : 'Continue →'}
            </button>
          </div>
        )}

        {/* Welcome back */}
        {state === 'welcome' && foundMember && (
          <WelcomeBack name={foundMember.name} />
        )}

        {/* Already checked in */}
        {state === 'already' && (
          <div className="text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <div className="text-lg font-bold text-black mb-1">Already Checked In</div>
            <div className="text-sm text-slate-400">You checked in at {alreadyTime}</div>
          </div>
        )}

        {/* New member short form */}
        {state === 'newmember' && (
          <div>
            <div className="text-base font-semibold text-black mb-1">Welcome! 👋</div>
            <div className="text-xs text-slate-400 mb-4">First time here? Let us get your name.</div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-black mb-1">Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={newForm.name}
                onChange={e => { setNewForm(p => ({...p, name: e.target.value})); setNewErrors(p => ({...p, name: ''})) }}
                placeholder="Your full name"
                className="w-full border border-slate-200 rounded-lg px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
              {newErrors.name && <div className="text-red-500 text-xs mt-1">{newErrors.name}</div>}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-1">Email <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
              <input type="email" value={newForm.email}
                onChange={e => setNewForm(p => ({...p, email: e.target.value}))}
                placeholder="your@email.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button onClick={recordType === 'session' ? submitNewMember : submitLateEvent}
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 text-base font-semibold transition-colors flex items-center justify-center gap-2 mb-2 disabled:opacity-60">
              {submitting ? <><Spinner />Saving...</> : 'Check In →'}
            </button>
            <button onClick={resetToPhone}
              className="w-full border border-slate-200 rounded-lg py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
              ← Back
            </button>
          </div>
        )}
      </div>

      <div className="text-white/20 text-xs mt-6">Powered by GatherHQ</div>
      <style>{`@keyframes pulse-once{0%{opacity:0;transform:scale(.9)}50%{opacity:1;transform:scale(1.02)}100%{transform:scale(1)}}.animate-pulse-once{animation:pulse-once .4s ease}`}</style>
    </div>
  )
}
