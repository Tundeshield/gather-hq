import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { churchCol, churchDoc, subCol } from '../db'
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { StatCard, Badge, Btn, Input, Textarea, EmptyState, Spinner, IconBtn } from '../components/UI'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { Plus, Pencil, Eye, Trash2 } from 'lucide-react'

export default function Events() {
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [counts, setCounts] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', date: new Date().toISOString().split('T')[0], venue: '', startTime: '', endTime: '', description: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const snap = await getDocs(query(churchCol('events'), orderBy('createdAt', 'desc')))
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setEvents(evts)
      const c = {}
      await Promise.all(evts.map(async e => {
        const sub = await getDocs(subCol('events', e.id, 'registrations'))
        c[e.id] = sub.size
      }))
      setCounts(c)
    } catch(e) { toast('Failed to load events', 'error') }
    finally { setLoading(false) }
  }

  async function createEvent() {
    if (!form.name.trim()) { toast('Enter an event name', 'error'); return }
    if (!form.date) { toast('Select a date', 'error'); return }
    setCreating(true)
    try {
      const payload = { name: form.name.trim(), date: form.date, mode: 'registration', fields: [], createdAt: serverTimestamp() }
      if (form.venue) payload.venue = form.venue
      if (form.startTime) payload.startTime = form.startTime
      if (form.endTime) payload.endTime = form.endTime
      if (form.description) payload.description = form.description
      const ref = await addDoc(churchCol('events'), payload)
      setShowCreate(false)
      setForm({ name: '', date: new Date().toISOString().split('T')[0], venue: '', startTime: '', endTime: '', description: '' })
      toast('Event created!')
      navigate('/events/' + ref.id + '/builder?mode=event')
    } catch(e) { toast('Failed to create event: ' + e.message, 'error') }
    finally { setCreating(false) }
  }

  async function deleteEvent(id) {
    try {
      await deleteDoc(churchDoc('events', id))
      setEvents(prev => prev.filter(e => e.id !== id))
      setShowDelete(null)
      toast('Event deleted.')
    } catch(e) { toast('Delete failed', 'error') }
  }

  const regOpen = events.filter(e => e.mode === 'registration').length
  const ciOpen = events.filter(e => e.mode === 'checkin').length
  const totalReg = Object.values(counts).reduce((a, b) => a + b, 0)

  function modeBadge(mode) {
    if (mode === 'registration') return <Badge variant="registration">Registration Open</Badge>
    if (mode === 'checkin') return <Badge variant="checkin">Check-in Open</Badge>
    return <Badge variant="closed">Closed</Badge>
  }

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">Events</h1>
          <p className="text-sm text-slate-500 mt-0.5">Registration and check-in for special programs</p>
        </div>
        <Btn onClick={() => setShowCreate(true)}><Plus size={14} />New Event</Btn>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Events" value={events.length} hero />
        <StatCard label="Registration Open" value={regOpen} />
        <StatCard label="Check-in Open" value={ciOpen} />
        <StatCard label="Total Registered" value={totalReg} />
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner dark /></div> : events.length === 0 ? (
        <EmptyState icon="🗓️" title="No events yet" subtitle="Create your first event to get started." />
      ) : (
        <div className="space-y-2.5">
          {events.map(e => (
            <div key={e.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3.5 flex items-center gap-3 hover:border-blue-300 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-black">{e.name}</span>
                  {modeBadge(e.mode)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{e.date}{e.venue ? ' · ' + e.venue : ''} · {counts[e.id] || 0} registered</div>
              </div>
              <div className="flex items-center gap-1.5">
                <IconBtn title="Edit Form" onClick={() => navigate('/events/' + e.id + '/builder?mode=event')}><Pencil size={13} /></IconBtn>
                <IconBtn title="View" onClick={() => navigate('/events/' + e.id)}><Eye size={13} /></IconBtn>
                <IconBtn danger title="Delete" onClick={() => setShowDelete(e)}><Trash2 size={13} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal show={showCreate} onClose={() => setShowCreate(false)} title="Create New Event" subtitle="Set up registration and check-in for a special program."
        actions={[
          <Btn key="c" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>,
          <Btn key="s" onClick={createEvent} disabled={creating}>{creating ? 'Creating...' : 'Create & Build Form'}</Btn>
        ]}>
        <Input label="Event Name" required placeholder="e.g. August 8 Meeting" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" required type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} />
          <Input label="Venue" placeholder="e.g. TEC Abeokuta" value={form.venue} onChange={e => setForm(p => ({...p, venue: e.target.value}))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Time" type="time" value={form.startTime} onChange={e => setForm(p => ({...p, startTime: e.target.value}))} />
          <Input label="End Time" type="time" value={form.endTime} onChange={e => setForm(p => ({...p, endTime: e.target.value}))} />
        </div>
        <Textarea label="Description (Optional)" placeholder="What is this event about?" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
      </Modal>

      {/* Delete Modal */}
      <Modal show={!!showDelete} onClose={() => setShowDelete(null)} title="⚠️ Confirm Delete"
        subtitle={(counts[showDelete?.id] || 0) > 0 ? `This event has ${counts[showDelete?.id]} registration${counts[showDelete?.id] > 1 ? 's' : ''}. Deleting is permanent.` : `Delete "${showDelete?.name}"? This cannot be undone.`}
        actions={[
          <Btn key="c" variant="secondary" onClick={() => setShowDelete(null)}>Cancel</Btn>,
          <Btn key="d" variant="danger" onClick={() => deleteEvent(showDelete.id)}>{(counts[showDelete?.id] || 0) > 0 ? 'Yes, Delete Everything' : 'Delete'}</Btn>
        ]} />
    </div>
  )
}
