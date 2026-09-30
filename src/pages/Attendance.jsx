import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { StatCard, Badge, Btn, Input, Textarea, EmptyState, Spinner, IconBtn } from '../components/UI'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { Plus, Pencil, Eye, Trash2 } from 'lucide-react'

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

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc')))
      const sess = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSessions(sess)
      const c = {}
      await Promise.all(sess.map(async s => {
        const sub = await getDocs(collection(db, 'sessions', s.id, 'submissions'))
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
      const ref = await addDoc(collection(db, 'sessions'), {
        name: form.name.trim(),
        date: form.date,
        description: form.description.trim(),
        status: 'active',
        fields: [],
        createdAt: serverTimestamp()
      })
      setShowCreate(false)
      setForm({ name: '', date: new Date().toISOString().split('T')[0], description: '' })
      toast('Session created!')
      navigate('/attendance/' + ref.id + '/builder')
    } catch(e) { toast('Failed to create session: ' + e.message, 'error') }
    finally { setCreating(false) }
  }

  async function deleteSession(id) {
    try {
      await deleteDoc(doc(db, 'sessions', id))
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
      <Modal show={showCreate} onClose={() => setShowCreate(false)} title="Create New Session" subtitle="Start a new attendance collection for a service."
        actions={[
          <Btn key="cancel" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>,
          <Btn key="create" onClick={createSession} disabled={creating}>{creating ? 'Creating...' : 'Create & Build Form'}</Btn>
        ]}>
        <Input label="Session Name" required placeholder="e.g. Sunday First Service" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
        <Input label="Date" required type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} />
        <Textarea label="Description (Optional)" placeholder="Service theme or notes..." value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
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
