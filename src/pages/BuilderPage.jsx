import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import FormBuilder, { SESSION_PRESETS, EVENT_PRESETS } from '../components/FormBuilder'
import { Btn, Spinner } from '../components/UI'
import { useToast } from '../components/Toast'
import { ArrowLeft, Save } from 'lucide-react'

export default function BuilderPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const mode = params.get('mode') || 'session'
  const navigate = useNavigate()
  const toast = useToast()
  const [record, setRecord] = useState(null)
  const [fields, setFields] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const colName = mode === 'event' ? 'events' : 'sessions'

  useEffect(() => {
    getDoc(doc(db, colName, id)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        setRecord(data)
        setFields(data.fields || [])
      }
      setLoading(false)
    })
  }, [id])

  async function save() {
    if (fields.length === 0) { toast('Add at least one field', 'error'); return }
    if (mode === 'event') {
      const hasPhone = fields.some(f => f.type === 'phone' || f.label.toLowerCase().includes('phone'))
      if (!hasPhone) { toast('Add a Phone Number field — required for event check-in', 'error'); return }
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, colName, id), { fields })
      toast('Form saved!')
      navigate(mode === 'event' ? '/events/' + id : '/attendance/' + id)
    } catch(e) { toast('Save failed: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  function handleBack() {
    navigate(mode === 'event' ? '/events/' + id : '/attendance/' + id)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner dark /></div>

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-1.5 border border-slate-200 rounded-md text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all">
            <ArrowLeft size={14} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Form Builder</h1>
            <p className="text-sm text-slate-500 mt-0.5">Configuring "{record?.name}"</p>
          </div>
        </div>
        <Btn onClick={save} disabled={saving}>
          <Save size={13} />{saving ? 'Saving...' : 'Save & Activate'}
        </Btn>
      </div>
      <FormBuilder
        fields={fields}
        onChange={setFields}
        presets={mode === 'event' ? EVENT_PRESETS : SESSION_PRESETS}
        sessionName={record?.name}
      />
    </div>
  )
}
