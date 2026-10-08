import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { query, where, getDocs, addDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore'
import { normalizePhone } from '../utils'
import { findSessionById, submissionsCol, membersCol, memberDocRef } from '../publicDb'
import { Spinner } from '../components/UI'

function FieldInput({ field, value, onChange }) {
  const base = 'w-full border border-slate-200 rounded-lg px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all'
  if (field.type === 'textarea') return <textarea className={base + ' resize-y min-h-[80px]'} value={value} onChange={e => onChange(e.target.value)} placeholder={field.label} />
  if (field.type === 'dropdown') {
    const opts = (field.options || '').split(',').map(o => o.trim()).filter(Boolean)
    return <select className={base + ' cursor-pointer bg-white'} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select...</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  }
  if (field.type === 'checkbox') return (
    <div className="flex items-center gap-2 mt-1">
      <input type="checkbox" id={field.id} checked={value === 'Yes'} onChange={e => onChange(e.target.checked ? 'Yes' : 'No')} className="w-5 h-5 cursor-pointer" />
      <label htmlFor={field.id} className="text-sm cursor-pointer">{field.label}</label>
    </div>
  )
  const inputType = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text'
  return <input type={inputType} className={base} value={value} onChange={e => onChange(e.target.value)} placeholder={field.type === 'phone' ? 'e.g. 08012345678' : field.label} />
}

export default function PublicForm() {
  const { id } = useParams()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState('phone') // phone | welcome | already | newmember | done
  const [phone, setPhone] = useState('')
  const [looking, setLooking] = useState(false)
  const [member, setMember] = useState(null)
  const [alreadyTime, setAlreadyTime] = useState('')
  // New member form
  const [newForm, setNewForm] = useState({})
  const [newErrors, setNewErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const phoneRef = useRef()

  useEffect(() => {
    findSessionById(id)
      .then(data => { if (data) setSession(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (phase === 'phone') setTimeout(() => phoneRef.current?.focus(), 100)
  }, [phase])

  async function lookupPhone() {
    const p = normalizePhone(phone)
    if (!p) return
    setLooking(true)
    try {
      // Already checked in today?
      const existingSub = await getDocs(query(
        submissionsCol(session.churchId, id),
        where('phone', '==', p)
      ))
      if (!existingSub.empty) {
        const time = existingSub.docs[0].data().createdAt?.toDate?.()
          ?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || 'earlier'
        setAlreadyTime(time)
        setPhase('already')
        return
      }

      // Look up in member directory
      const memberSnap = await getDocs(query(membersCol(session.churchId), where('phone', '==', p)))
      if (!memberSnap.empty) {
        const m = { id: memberSnap.docs[0].id, ...memberSnap.docs[0].data() }
        setMember(m)
        // AUTO-CONFIRM: record attendance immediately, no form needed
        await recordAttendance(p, m.name, m.id)
        setPhase('welcome')
        setTimeout(() => resetToPhone(), 3500)
      } else {
        // New person — short form
        setMember(null)
        setPhase('newmember')
      }
    } catch(e) { alert('Network error. Please try again.') }
    finally { setLooking(false) }
  }

  async function recordAttendance(p, name, memberId) {
    const data = {}
    // Fill session fields from member data
    const fields = session?.fields || []
    fields.forEach(f => {
      const fl = f.label.toLowerCase()
      if (fl.includes('name')) data[f.label] = name || ''
      else if (fl.includes('phone')) data[f.label] = p
      else data[f.label] = ''
    })
    await addDoc(submissionsCol(session.churchId, id), {
      data, phone: p, createdAt: serverTimestamp()
    })
    if (memberId) {
      await updateDoc(memberDocRef(session.churchId, memberId), {
        lastSeenAt: serverTimestamp(),
        totalAttendance: increment(1)
      })
    }
  }

  async function submitNewMember() {
    const fields = session?.fields || []
    const errs = {}
    fields.forEach(f => {
      if (f.required && f.type !== 'phone' && !f.label.toLowerCase().includes('phone') && !newForm[f.id]) {
        errs[f.id] = 'This field is required'
      }
    })
    if (Object.keys(errs).length) { setNewErrors(errs); return }
    const p = normalizePhone(phone)
    setSubmitting(true)
    try {
      // Build data object from session fields
      const data = {}
      let firstName = '', lastName = '', fullName = '', email = ''
      fields.forEach(f => {
        const fl = f.label.toLowerCase()
        if (f.type === 'phone' || fl.includes('phone')) { data[f.label] = p; return }
        const val = (newForm[f.id] || '').trim()
        data[f.label] = val
        // Only extract name from text-type fields — never dropdown/checkbox values
        if (f.type !== 'text' && f.type !== 'email' && f.type !== 'textarea') return
        if (fl.includes('first name') || fl === 'first') firstName = val
        else if (fl.includes('last name') || fl.includes('surname') || fl === 'last') lastName = val
        else if (fl.includes('full name') || fl === 'name') fullName = val
        if (fl.includes('email')) email = val
      })
      // Combine: prefer first+last, fallback to full name
      let name = ''
      if (firstName || lastName) name = [firstName, lastName].filter(Boolean).join(' ')
      else if (fullName) name = fullName
      // Final fallback: find first non-empty text field that isn't Yes/No
      if (!name) {
        name = Object.entries(data).find(([k, v]) => {
          return v && typeof v === 'string' && v.length > 1 &&
            !['yes','no','male','female'].includes(v.toLowerCase()) &&
            !k.toLowerCase().includes('email') &&
            !k.toLowerCase().includes('phone')
        })?.[1] || 'Member'
      }

      // Add to member directory
      const memberRef = await addDoc(membersCol(session.churchId), {
        name: name.trim(),
        phone: p,
        email: email.trim(),
        totalAttendance: 1,
        lastSeenAt: serverTimestamp(),
        createdAt: serverTimestamp()
      })
      await recordAttendance(p, name.trim(), memberRef.id)
      setMember({ name: name.trim() })
      setPhase('welcome')
      setTimeout(() => resetToPhone(), 3500)
    } catch(e) { alert('Failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  function resetToPhone() {
    setPhase('phone')
    setPhone('')
    setMember(null)
    setNewForm({})
    setNewErrors({})
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spinner dark /></div>

  if (!session) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center"><div className="text-4xl mb-3">🔍</div><div className="text-lg font-semibold">Form not found</div></div>
    </div>
  )

  if (session.status === 'closed') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center"><div className="text-4xl mb-3">🔒</div><div className="text-lg font-semibold">Session has ended.</div><div className="text-sm text-slate-400 mt-1">Please speak with an usher.</div></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-5 py-3 sticky top-0 z-10">
        <div className="text-xs text-slate-400">{session.churchName || 'GatherHQ'} — Attendance</div>
        <div className="text-base font-semibold text-black">{session.name}</div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-10 mt-6">

        {/* PHONE LOOKUP */}
        {phase === 'phone' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="text-base font-semibold text-black mb-1 text-center">Check In</div>
            <div className="text-sm text-slate-400 mb-5 text-center">Enter your phone number</div>
            <input
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !looking && phone.trim() && lookupPhone()}
              placeholder="e.g. 08012345678"
              className="w-full border border-slate-200 rounded-xl px-4 py-4 text-xl text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 mb-4 font-mono"
              autoFocus
            />
            <button onClick={lookupPhone} disabled={looking || !phone.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 text-base font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {looking ? <><Spinner />Checking...</> : 'Continue →'}
            </button>
          </div>
        )}

        {/* WELCOME BACK — auto-confirmed, no tap needed */}
        {phase === 'welcome' && member && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="text-5xl mb-3">👋</div>
            <div className="text-xl font-bold text-black mb-1">
              Welcome back, {member.name.split(' ')[0]}!
            </div>
            <div className="text-sm text-slate-400 mb-4">Attendance recorded ✅</div>
            <div className="text-xs text-slate-300">Returning to check-in...</div>
          </div>
        )}

        {/* ALREADY CHECKED IN */}
        {phase === 'already' && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="text-5xl mb-3">✅</div>
            <div className="text-xl font-bold text-black mb-2">Already Checked In</div>
            <div className="text-sm text-slate-400 mb-5">You checked in at {alreadyTime} today.</div>
            <button onClick={resetToPhone} className="text-sm text-blue-600 underline">Not you? Try a different number</button>
          </div>
        )}

        {/* NEW MEMBER — show actual session fields */}
        {phase === 'newmember' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="text-base font-semibold text-black mb-1">Welcome! 👋</div>
            <div className="text-sm text-slate-400 mb-5">First time here? Fill in your details below.</div>
            {(session.fields || []).map(f => {
              // Skip phone field — we already have it
              if (f.type === 'phone' || f.label.toLowerCase().includes('phone')) return null
              return (
                <div key={f.id} className="mb-4">
                  <label className="block text-sm font-medium text-black mb-1.5">
                    {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <FieldInput field={f} value={newForm[f.id] || ''} onChange={v => setNewForm(p => ({...p, [f.id]: v}))} />
                  {newErrors[f.id] && <div className="text-red-500 text-xs mt-1">{newErrors[f.id]}</div>}
                </div>
              )
            })}
            <button onClick={submitNewMember} disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3.5 text-base font-semibold transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-60">
              {submitting ? <><Spinner />Saving...</> : 'Check In →'}
            </button>
            <button onClick={resetToPhone} className="w-full text-center text-sm text-slate-400 hover:text-slate-600">
              ← Try a different number
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
