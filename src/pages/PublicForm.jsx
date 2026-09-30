import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
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
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'sessions', id)).then(snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
  }, [id])

  function setValue(fieldId, val) { setValues(p => ({ ...p, [fieldId]: val })); setErrors(p => ({ ...p, [fieldId]: '' })) }

  async function submit() {
    if (!session) return
    const errs = {}
    session.fields.forEach(f => { if (f.required && !values[f.id]) errs[f.id] = 'This field is required' })
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    try {
      const data = {}
      session.fields.forEach(f => { data[f.label] = values[f.id] || '' })
      await addDoc(collection(db, 'sessions', id, 'submissions'), { data, createdAt: serverTimestamp() })
      setDone(true)
    } catch(e) { alert('Submission failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spinner dark /></div>

  if (!session) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center"><div className="text-4xl mb-3">🔍</div><div className="text-lg font-semibold text-black">Form not found</div><div className="text-sm text-slate-400 mt-1">Please scan the correct QR code.</div></div>
    </div>
  )

  if (session.status === 'closed') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center"><div className="text-4xl mb-3">🔒</div><div className="text-lg font-semibold text-black">This session has ended.</div><div className="text-sm text-slate-400 mt-1">Please speak with an usher.</div></div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
        <div className="text-xl font-bold text-black mb-2">Attendance Recorded</div>
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
      <div className="max-w-md mx-auto p-4 pb-10">
        <div className="bg-white border border-slate-200 rounded-lg p-5 mt-5">
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
            {submitting ? <><Spinner />Submitting...</> : 'Submit Attendance'}
          </button>
        </div>
      </div>
    </div>
  )
}
