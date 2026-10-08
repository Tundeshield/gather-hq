import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { churchCol, churchDoc, subCol } from '../db'
import { getSession } from '../auth'
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { StatCard, Badge, Btn, Input, Textarea, EmptyState, Spinner, IconBtn } from '../components/UI'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { Plus, Pencil, Eye, Trash2, BookMarked } from 'lucide-react'

export default function Attendance() {
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [counts, setCounts] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', date: new Date().toISOString().split('T')[0], description: '' })
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')

  useEffect(() => { load(); loadTemplates() }, [])

  async function loadTemplates() {
    try {
      const snap = await getDocs(query(churchCol('templates'), orderBy('createdAt', 'desc')))
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { /* templates are optional */ }
  }

  async function load() {
    setLoading(true)
    try {
      const snap = await getDocs(query(churchCol('sessions'), orderBy('createdAt', 'desc')))
      const sess = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSessions(sess)
      const c = {}
      await Promise.all(sess.map(async s => {
        const sub = await getDocs(subCol('sessions', s.id, 'submissions'))
        c[s.id] = sub.size
      }))
      setCounts(c)
    } catch(e) { toast('Failed to load sessions', 'error') }
    finally { setLoading(false) }
  }

  async function createSession() {
    if (!form.name.trim()) { toast('Enter a session name', 'error'); return }
    if (!form.date) { toast('Select a date', 'error'); return }
    setCreating(true)
    try {
      // Apply template fields if one was selected (give new IDs to avoid conflicts)
      const tmpl = templates.find(t => t.id === selectedTemplate)
      const templateFields = tmpl
        ? tmpl.fields.map(f => ({ ...f, id: 'f_' + Date.now() + Math.random().toString(36).slice(2, 5) }))
        : []
      const ref = await addDoc(churchCol('sessions'), {
        name: form.name.trim(),
        date: form.date,
        description: form.description.trim(),
        status: 'active',
        fields: templateFields,
        churchName: getSession()?.churchName || '',
        createdAt: serverTimestamp()
      })
      setShowCreate(false)
      setForm({ name: '', date: new Date().toISOString().split('T')[0], description: '' })
      setSelectedTemplate('')
      toast(tmpl ? `Session created from "${tmpl.name}" template!` : 'Session created!')
      navigate('/attendance/' + ref.id + '/builder')
    } catch(e) { toast('Failed to create session: ' + e.message, 'error') }
    finally { setCreating(false) }
  }

  async function deleteSession(id) {
    try {
      await deleteDoc(churchDoc('sessions', id))
      setSessions(prev => prev.filter(s => s.id !== id))
      setShowDelete(null)
      toast('Session deleted.')
    } catch(e) { toast('Delete failed', 'error') }
  }

  const today = new Date().toISOString().split('T')[0]
  const todayCount = sessions.filter(s => s.date === today).reduce((a, s) => a + (counts[s.id] || 0), 0)
  const active = sessions.filter(s => s.status === 'active').length

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage sessions and collect check-ins</p>
        </div>
        <Btn onClick={() => setShowCreate(true)}><Plus size={14} />New Session</Btn>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Today's Attendance" value={todayCount} hero />
        <StatCard label="Active Sessions" value={active} />
        <StatCard label="Total Sessions" value={sessions.length} />
        <StatCard label="Closed Sessions" value={sessions.length - active} />
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner dark /></div> : sessions.length === 0 ? (
        <EmptyState icon="📋" title="No sessions yet" subtitle="Create your first session to get started." />
      ) : (
        <div className="space-y-2.5">
          {sessions.map(s => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3.5 flex items-center gap-3 hover:border-blue-300 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-black">{s.name}</span>
                  <Badge variant={s.status === 'active' ? 'active' : 'closed'}>{s.status === 'active' ? 'Active' : 'Closed'}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{s.date} · {counts[s.id] || 0} response{(counts[s.id] || 0) !== 1 ? 's' : ''}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <IconBtn title="Edit Form" onClick={() => navigate('/attendance/' + s.id + '/builder')}><Pencil size={13} /></IconBtn>
                <IconBtn title="View" onClick={() => navigate('/attendance/' + s.id)}><Eye size={13} /></IconBtn>
                <IconBtn danger title="Delete" onClick={() => setShowDelete(s)}><Trash2 size={13} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal show={showCreate} onClose={() => { setShowCreate(false); setSelectedTemplate('') }} title="Create New Session" subtitle="Start a new attendance collection for a service."
        actions={[
          <Btn key="cancel" variant="secondary" onClick={() => { setShowCreate(false); setSelectedTemplate('') }}>Cancel</Btn>,
          <Btn key="create" onClick={createSession} disabled={creating}>{creating ? 'Creating...' : 'Create & Build Form'}</Btn>
        ]}>
        <Input label="Session Name" required placeholder="e.g. Sunday First Service" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
        <Input label="Date" required type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} />
        <Textarea label="Description (Optional)" placeholder="Service theme or notes..." value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />

        {templates.length > 0 && (
          <div className="mt-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <BookMarked size={13} className="inline mr-1.5 text-slate-400" />
              Start from a Template <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <select
              value={selectedTemplate}
              onChange={e => {
                setSelectedTemplate(e.target.value)
                // Auto-fill session name from template if name is empty
                if (e.target.value && !form.name.trim()) {
                  const t = templates.find(t => t.id === e.target.value)
                  if (t) setForm(p => ({ ...p, name: t.name }))
                }
              }}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-black outline-none focus:border-blue-400 bg-white">
              <option value="">— No template, start blank —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.fields?.length || 0} fields)</option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="mt-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-3 py-2">
                ✓ Form will be pre-filled with {templates.find(t => t.id === selectedTemplate)?.fields?.length} field{templates.find(t => t.id === selectedTemplate)?.fields?.length !== 1 ? 's' : ''} — you can still edit them in the builder.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal show={!!showDelete} onClose={() => setShowDelete(null)} title="⚠️ Confirm Delete"
        subtitle={(counts[showDelete?.id] || 0) > 0 ? `This session has ${counts[showDelete?.id]} submission${counts[showDelete?.id] > 1 ? 's' : ''}. Deleting is permanent.` : `Delete "${showDelete?.name}"? This cannot be undone.`}
        actions={[
          <Btn key="cancel" variant="secondary" onClick={() => setShowDelete(null)}>Cancel</Btn>,
          <Btn key="del" variant="danger" onClick={() => deleteSession(showDelete.id)}>{(counts[showDelete?.id] || 0) > 0 ? 'Yes, Delete Everything' : 'Delete'}</Btn>
        ]} />
    </div>
  )
}
