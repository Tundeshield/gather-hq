import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import { Spinner } from '../components/UI'

function FieldInput({ field, value, onChange }) {
  const base = 'w-full border border-slate-200 rounded-lg px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-all'
  if (field.type === 'dropdown') {
    const opts = (field.options || '').split(',').map(o => o.trim()).filter(Boolean)
    return <select className={base + ' cursor-pointer'} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select...</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  }
  const inputType = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text'
  return <input type={inputType} className={base} value={value} onChange={e => onChange(e.target.value)} placeholder={field.type === 'phone' ? 'e.g. 08012345678' : field.label} />
}

export default function CheckIn() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState('lookup') // lookup | found | already | success | late
  const [phone, setPhone] = useState('')
  const [looking, setLooking] = useState(false)
  const [reg, setReg] = useState(null)
  const [checkinIn, setCheckingIn] = useState(false)
  const [lateValues, setLateValues] = useState({})
  const [lateErrors, setLateErrors] = useState({})
  const [submittingLate, setSubmittingLate] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'events', id)).then(snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
  }, [id])

  async function lookup() {
    const p = phone.trim().replace(/[\s\-]/g, '')
    if (!p) return
    setLooking(true)
    try {
      const snap = await getDocs(query(collection(db, 'events', id, 'registrations'), where('phone', '==', p)))
      if (!snap.empty) {
        const r = { id: snap.docs[0].id, ...snap.docs[0].data() }
        setReg(r)
        setState(r.checkedIn ? 'already' : 'found')
      } else {
        setState('late')
      }
    } catch(e) { alert('Network error. Please try again.') }
    finally { setLooking(false) }
  }

  async function doCheckin() {
    if (!reg) return
    setCheckingIn(true)
    try {
      await updateDoc(doc(db, 'events', id, 'registrations', reg.id), { checkedIn: true, checkedInAt: serverTimestamp() })
      setState('success')
      setTimeout(() => { setState('lookup'); setPhone(''); setReg(null) }, 3000)
    } catch(e) { alert('Check-in failed. Please try again.') }
    finally { setCheckingIn(false) }
  }

  async function submitLate() {
    const p = phone.trim().replace(/[\s\-]/g, '')
    const fields = event?.fields || []
    const errs = {}
    fields.forEach(f => { if (f.required && f.type !== 'phone' && !lateValues[f.id]) errs[f.id] = 'Required' })
    if (Object.keys(errs).length) { setLateErrors(errs); return }
    setSubmittingLate(true)
    try {
      const data = {}
      const nameField = fields.find(f => f.label.toLowerCase().includes('name'))
      fields.forEach(f => {
        if (f.type === 'phone' || f.label.toLowerCase().includes('phone')) data[f.label] = p
        else data[f.label] = lateValues[f.id] || ''
      })
      const name = nameField ? lateValues[nameField.id] || '' : ''
      await addDoc(collection(db, 'events', id, 'registrations'), {
        phone: p, name, data, checkedIn: true, checkedInAt: serverTimestamp(), isLateRegistrant: true, createdAt: serverTimestamp()
      })
      setState('success')
      setTimeout(() => { setState('lookup'); setPhone(''); setLateValues({}) }, 3000)
    } catch(e) { alert('Failed. Please try again.') }
    finally { setSubmittingLate(false) }
  }

  function reset() { setState('lookup'); setPhone(''); setReg(null); setLateValues({}); setLateErrors({}) }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Spinner /></div>

  if (!event) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center text-white"><div className="text-4xl mb-3">🔍</div><div className="text-lg font-semibold">Event not found</div></div>
    </div>
  )

  if (event.mode !== 'checkin') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center text-white"><div className="text-4xl mb-3">🕐</div><div className="text-lg font-semibold">Check-in not open yet</div><div className="text-sm text-white/60 mt-2">Please wait for the organiser to open check-in.</div></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="text-white text-2xl font-bold text-center mb-2">{event.name}</div>
      <div className="text-white/60 text-sm text-center mb-8">{event.date}{event.venue ? ' · ' + event.venue : ''}</div>

      <div className="bg-white rounded-xl p-7 w-full max-w-sm text-center shadow-2xl">
        {state === 'lookup' && (
          <>
            <div className="text-base font-semibold text-black mb-1">Check In</div>
            <div className="text-sm text-slate-400 mb-4">Enter your phone number</div>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="e.g. 08012345678"
              className="w-full border border-slate-200 rounded-lg px-3 py-3 text-lg text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 mb-3" autoFocus />
            <button onClick={lookup} disabled={looking || !phone.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {looking ? <><Spinner />Checking...</> : 'Continue →'}
            </button>
          </>
        )}

        {state === 'found' && reg && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <div className="text-lg font-bold text-black mb-1">Welcome, {reg.name || 'there'}!</div>
            <div className="text-sm text-slate-400 mb-5">You're registered. Tap below to check in.</div>
            <button onClick={doCheckin} disabled={checkinIn}
              className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 font-semibold mb-2 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {checkinIn ? <><Spinner />Checking in...</> : 'Check In →'}
            </button>
            <button onClick={reset} className="w-full border border-slate-200 rounded-lg py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">Try a different number</button>
          </>
        )}

        {state === 'already' && reg && (
          <>
            <div className="text-4xl mb-3">⚠️</div>
            <div className="text-lg font-bold text-black mb-1">Already Checked In</div>
            <div className="text-sm text-slate-400 mb-5">
              {reg.checkedInAt?.toDate?.()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) || 'Earlier today'}
            </div>
            <button onClick={reset} className="w-full border border-slate-200 rounded-lg py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">Try another number</button>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-lg font-bold text-black mb-1">Checked In!</div>
            <div className="text-sm text-slate-400">Welcome! Enjoy the event. 🙏</div>
            <div className="text-xs text-slate-300 mt-4">Returning to lookup in 3 seconds...</div>
          </>
        )}

        {state === 'late' && (
          <>
            <div className="text-left mb-4">
              <div className="text-base font-semibold text-black mb-1">📋 Complete Registration</div>
              <div className="text-xs text-slate-400">No prior registration found. Fill in your details to check in.</div>
            </div>
            {(event.fields || []).filter(f => f.type !== 'phone' && !f.label.toLowerCase().includes('phone')).map(f => (
              <div key={f.id} className="mb-3 text-left">
                <label className="block text-sm font-medium text-black mb-1">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                <FieldInput field={f} value={lateValues[f.id] || ''} onChange={v => { setLateValues(p => ({...p, [f.id]: v})); setLateErrors(p => ({...p, [f.id]: ''})) }} />
                {lateErrors[f.id] && <div className="text-red-500 text-xs mt-0.5">{lateErrors[f.id]}</div>}
              </div>
            ))}
            <button onClick={submitLate} disabled={submittingLate}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-semibold mb-2 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {submittingLate ? <><Spinner />Checking in...</> : 'Check In →'}
            </button>
            <button onClick={reset} className="w-full border border-slate-200 rounded-lg py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">← Back</button>
          </>
        )}
      </div>
      <div className="text-white/20 text-xs mt-6">Powered by GatherHQ</div>
    </div>
  )
}
