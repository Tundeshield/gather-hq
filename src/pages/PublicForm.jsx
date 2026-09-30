import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, addDoc, collection, query, where, getDocs, updateDoc, serverTimestamp, increment } from 'firebase/firestore'
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
  // Smart check-in states
  const [phase, setPhase] = useState('phone') // phone | form | done | already
  const [phone, setPhone] = useState('')
  const [looking, setLooking] = useState(false)
  const [member, setMember] = useState(null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [alreadyTime, setAlreadyTime] = useState('')
  const phoneRef = useRef()

  useEffect(() => {
    getDoc(doc(db, 'sessions', id)).then(snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
  }, [id])

  useEffect(() => { if (phase === 'phone') setTimeout(() => phoneRef.current?.focus(), 100) }, [phase])

  function normalizePhone(p) { return p.trim().replace(/[\s\-\+]/g, '') }

  async function lookupPhone() {
    const p = normalizePhone(phone)
    if (!p) return
    setLooking(true)
    try {
      // Check already submitted today
      const existingSub = await getDocs(query(
        collection(db, 'sessions', id, 'submissions'),
        where('phone', '==', p)
      ))
      if (!existingSub.empty) {
        const sub = existingSub.docs[0].data()
        const time = sub.createdAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || 'earlier'
        setAlreadyTime(time)
        setPhase('already')
        return
      }
      // Look up in directory
      const memberSnap = await getDocs(query(collection(db, 'members'), where('phone', '==', p)))
      if (!memberSnap.empty) {
        const m = { id: memberSnap.docs[0].id, ...memberSnap.docs[0].data() }
        setMember(m)
        // Pre-fill form values from member profile
        const preValues = {}
        const fields = session?.fields || []
        fields.forEach(f => {
          const fl = f.label.toLowerCase()
          if (fl.includes('name')) preValues[f.id] = m.name || ''
          else if (fl.includes('phone')) preValues[f.id] = p
          else if (fl.includes('email')) preValues[f.id] = m.email || ''
          else if (fl.includes('unit')) preValues[f.id] = m.unit || ''
        })
        setValues(preValues)
        setPhase('form')
      } else {
        // Unknown — show form, pre-fill phone
        setMember(null)
        const preValues = {}
        const fields = session?.fields || []
        fields.forEach(f => {
          if (f.type === 'phone' || f.label.toLowerCase().includes('phone')) preValues[f.id] = p
        })
        setValues(preValues)
        setPhase('form')
      }
    } catch(e) { alert('Network error. Please try again.') }
    finally { setLooking(false) }
  }

  function setValue(fieldId, val) { setValues(p => ({ ...p, [fieldId]: val })); setErrors(p => ({ ...p, [fieldId]: '' })) }

  async function submit() {
    if (!session) return
    const errs = {}
    session.fields.forEach(f => { if (f.required && !values[f.id]) errs[f.id] = 'This field is required' })
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    try {
      const data = {}
      const p = normalizePhone(phone)
      session.fields.forEach(f => { data[f.label] = values[f.id] || '' })
      await addDoc(collection(db, 'sessions', id, 'submissions'), { data, phone: p, createdAt: serverTimestamp() })
      // Update member stats if known
      if (member) {
        await updateDoc(doc(db, 'members', member.id), {
          lastSeenAt: serverTimestamp(),
          totalAttendance: increment(1)
        })
      } else {
        // Try to add to directory
        const nameField = session.fields.find(f => f.label.toLowerCase().includes('name'))
        const emailField = session.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'))
        const unitField = session.fields.find(f => f.label.toLowerCase().includes('unit'))
        const name = nameField ? values[nameField.id] || '' : ''
        if (name && p) {
          const existing = await getDocs(query(collection(db, 'members'), where('phone', '==', p)))
          if (existing.empty) {
            await addDoc(collection(db, 'members'), {
              name, phone: p,
              email: emailField ? values[emailField.id] || '' : '',
              unit: unitField ? values[unitField.id] || '' : '',
              totalAttendance: 1,
              lastSeenAt: serverTimestamp(),
              createdAt: serverTimestamp()
            })
          }
        }
      }
      setPhase('done')
    } catch(e) { alert('Submission failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  // ── RENDER ──────────────────────────────────────────────────
  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spinner dark /></div>

  if (!session) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center"><div className="text-4xl mb-3">🔍</div><div className="text-lg font-semibold text-black">Form not found</div></div>
    </div>
  )

  if (session.status === 'closed') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center"><div className="text-4xl mb-3">🔒</div><div className="text-lg font-semibold text-black">This session has ended.</div><div className="text-sm text-slate-400 mt-1">Please speak with an usher.</div></div>
    </div>
  )

  // Already checked in
  if (phase === 'already') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-3">✅</div>
        <div className="text-xl font-bold text-black mb-2">Already Checked In</div>
        <div className="text-sm text-slate-400">You checked in at {alreadyTime} today.</div>
        <button onClick={() => { setPhase('phone'); setPhone('') }} className="mt-6 text-sm text-blue-600 underline">Not you? Try a different number</button>
      </div>
    </div>
  )

  // Done
  if (phase === 'done') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
        <div className="text-xl font-bold text-black mb-2">
          {member ? `Welcome back, ${member.name.split(' ')[0]}! 👋` : 'Attendance Recorded'}
        </div>
        <div className="text-sm text-slate-500">Thank you for worshipping with us.<br />Have a blessed week. 🙏</div>
        <div className="text-xs text-slate-300 mt-6">The Elevation Church</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-5 py-3 sticky top-0 z-10">
        <div className="text-xs text-slate-400">The Elevation Church — Attendance</div>
        <div className="text-base font-semibold text-black">{session.name}</div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-10 mt-4">
        {/* Step 1: Phone lookup */}
        {phase === 'phone' && (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="text-base font-semibold text-black mb-1 text-center">Check In</div>
            <div className="text-sm text-slate-400 mb-5 text-center">Enter your phone number to check in quickly</div>
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3.5 text-base font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {looking ? <><Spinner />Checking...</> : 'Continue →'}
            </button>
          </div>
        )}

        {/* Step 2: Form */}
        {phase === 'form' && (
          <div>
            {member && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-3">
                <div className="text-2xl">👋</div>
                <div>
                  <div className="text-sm font-semibold text-blue-700">Welcome back, {member.name.split(' ')[0]}!</div>
                  <div className="text-xs text-blue-500">Your details are pre-filled. Just confirm below.</div>
                </div>
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {(session.fields || []).map(f => (
                <div key={f.id} className="mb-5">
                  <label className="block text-sm font-medium text-black mb-1.5">
                    {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <FieldInput field={f} value={values[f.id] || ''} onChange={v => setValue(f.id, v)} />
                  {errors[f.id] && <div className="text-red-500 text-xs mt-1">{errors[f.id]}</div>}
                </div>
              ))}
              <button onClick={submit} disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3.5 text-base font-semibold transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-60">
                {submitting ? <><Spinner />Submitting...</> : member ? 'Confirm Attendance ✓' : 'Submit Attendance'}
              </button>
              <button onClick={() => { setPhase('phone'); setPhone('') }} className="w-full text-center text-xs text-slate-400 mt-3 hover:text-slate-600">
                ← Try a different number
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
