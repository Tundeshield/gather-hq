import { useEffect, useState, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp, where
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { Btn, IconBtn, Badge, Input, Select, EmptyState, Spinner } from '../components/UI'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { Plus, Upload, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react'

const UNITS = ['EPOP','Ushering','Assimilation','Hospitality','Creative Arts','Multimedia','Sound','Prayer','Missions','Junior Church','Teens Nation','Surge','Maturity Purpose','Greatness Community','Social Media','Sanitation','Protocol','Pastoral Care','Family Life','Ministry Purpose II','Other']

function daysAgo(ts) {
  if (!ts) return 999
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function AbsenteeBadge({ lastSeen }) {
  const days = daysAgo(lastSeen)
  if (days < 21) return null
  if (days >= 35) return <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-sm font-medium">🚨 {Math.floor(days/7)}w absent</span>
  return <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-sm font-medium">⚠️ {Math.floor(days/7)}w absent</span>
}

function InitialAvatar({ name, size = 'md' }) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-pink-500','bg-teal-500']
  const color = colors[initials.charCodeAt(0) % colors.length]
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>{initials}</div>
}

// ── IMPORT MODAL ──────────────────────────────────────────────
function ImportModal({ show, onClose, onImported }) {
  const toast = useToast()
  const fileRef = useRef()
  const [step, setStep] = useState('upload') // upload | map | preview | importing
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({ name: '', phone: '', email: '', sex: '', unit: '' })
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)

  function reset() { setStep('upload'); setRows([]); setHeaders([]); setMapping({ name:'',phone:'',email:'',sex:'',unit:'' }); setPreview([]); setProgress(0) }

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
      // Auto-map common column names
      const autoMap = { name: '', phone: '', email: '', sex: '', unit: '' }
      hdrs.forEach(h => {
        const hl = h.toLowerCase()
        if (!autoMap.name && (hl.includes('name') || hl === 'fullname')) autoMap.name = h
        if (!autoMap.phone && (hl.includes('phone') || hl.includes('mobile') || hl.includes('tel'))) autoMap.phone = h
        if (!autoMap.email && hl.includes('email')) autoMap.email = h
        if (!autoMap.sex && (hl.includes('sex') || hl.includes('gender'))) autoMap.sex = h
        if (!autoMap.unit && (hl.includes('unit') || hl.includes('department') || hl.includes('dept'))) autoMap.unit = h
      })
      setMapping(autoMap)
      setStep('map')
    }
    reader.readAsBinaryString(file)
  }

  function buildPreview() {
    if (!mapping.name || !mapping.phone) { toast('Name and Phone columns are required', 'error'); return }
    const nameIdx = headers.indexOf(mapping.name)
    const phoneIdx = headers.indexOf(mapping.phone)
    const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1
    const sexIdx = mapping.sex ? headers.indexOf(mapping.sex) : -1
    const unitIdx = mapping.unit ? headers.indexOf(mapping.unit) : -1
    const prev = rows.slice(0, 5).map(r => ({
      name: r[nameIdx] || '',
      phone: String(r[phoneIdx] || '').trim(),
      email: emailIdx >= 0 ? r[emailIdx] || '' : '',
      sex: sexIdx >= 0 ? r[sexIdx] || '' : '',
      unit: unitIdx >= 0 ? r[unitIdx] || '' : '',
    })).filter(r => r.name && r.phone)
    setPreview(prev)
    setStep('preview')
  }

  async function doImport() {
    if (!mapping.name || !mapping.phone) return
    setImporting(true); setStep('importing')
    const nameIdx = headers.indexOf(mapping.name)
    const phoneIdx = headers.indexOf(mapping.phone)
    const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1
    const sexIdx = mapping.sex ? headers.indexOf(mapping.sex) : -1
    const unitIdx = mapping.unit ? headers.indexOf(mapping.unit) : -1

    const members = rows.map(r => ({
      name: String(r[nameIdx] || '').trim(),
      phone: String(r[phoneIdx] || '').trim().replace(/[\s\-]/g, ''),
      email: emailIdx >= 0 ? String(r[emailIdx] || '').trim() : '',
      sex: sexIdx >= 0 ? String(r[sexIdx] || '').trim() : '',
      unit: unitIdx >= 0 ? String(r[unitIdx] || '').trim() : '',
    })).filter(m => m.name && m.phone)

    // Get existing phones to avoid duplicates
    const existingSnap = await getDocs(collection(db, 'members'))
    const existingPhones = new Set(existingSnap.docs.map(d => d.data().phone))

    let imported = 0, skipped = 0
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      setProgress(Math.round((i / members.length) * 100))
      if (existingPhones.has(m.phone)) { skipped++; continue }
      try {
        await addDoc(collection(db, 'members'), { ...m, totalAttendance: 0, createdAt: serverTimestamp() })
        imported++
      } catch(e) { skipped++ }
    }
    setImporting(false)
    toast(`✅ Imported ${imported} members${skipped > 0 ? ` (${skipped} skipped — duplicates)` : ''}`, 'success')
    onImported()
    reset()
    onClose()
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg p-7 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="text-lg font-bold text-black mb-1">Import Members from Excel</div>
        <div className="text-sm text-slate-500 mb-6">Upload your church member register to populate the directory.</div>

        {step === 'upload' && (
          <div>
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <Upload size={32} className="mx-auto text-slate-300 mb-3" />
              <div className="text-sm font-medium text-slate-600">Click to upload Excel file</div>
              <div className="text-xs text-slate-400 mt-1">.xlsx or .xls files</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <div className="mt-5 p-4 bg-slate-50 rounded-lg text-xs text-slate-500">
              <div className="font-medium text-slate-700 mb-1">Your Excel should have columns like:</div>
              Full Name, Phone Number, Email, Sex, Unit
              <div className="mt-1 text-slate-400">Column names don't have to match exactly — you'll map them in the next step.</div>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div>
            <div className="text-sm font-medium text-black mb-1">{rows.length} rows found</div>
            <div className="text-xs text-slate-400 mb-5">Map your columns to the correct fields. Name and Phone are required.</div>
            {[
              { key: 'name', label: 'Full Name', required: true },
              { key: 'phone', label: 'Phone Number', required: true },
              { key: 'email', label: 'Email', required: false },
              { key: 'sex', label: 'Sex / Gender', required: false },
              { key: 'unit', label: 'Service Unit', required: false },
            ].map(({ key, label, required }) => (
              <div key={key} className="mb-3">
                <label className="block text-sm font-medium text-black mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
                <select value={mapping[key]} onChange={e => setMapping(p => ({...p, [key]: e.target.value}))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white cursor-pointer">
                  <option value="">{required ? 'Select column...' : 'Skip this field'}</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2 justify-end mt-5">
              <Btn variant="secondary" onClick={reset}>Back</Btn>
              <Btn onClick={buildPreview}>Preview Import</Btn>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div>
            <div className="text-sm font-medium text-black mb-1">Preview (first 5 rows)</div>
            <div className="text-xs text-slate-400 mb-4">Confirm the data looks correct before importing all {rows.length} members.</div>
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-5">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  {['Name','Phone','Email','Sex','Unit'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-slate-400 uppercase tracking-wide">{h}</th>)}
                </tr></thead>
                <tbody>{preview.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
                    <td className="px-3 py-2 text-slate-500">{r.phone}</td>
                    <td className="px-3 py-2 text-slate-500">{r.email || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.sex || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.unit || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-5">
              Will import <strong>{rows.length} members</strong>. Members already in the directory (same phone number) will be skipped.
            </div>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" onClick={() => setStep('map')}>Back</Btn>
              <Btn onClick={doImport}>Import {rows.length} Members</Btn>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="text-center py-8">
            <Spinner dark />
            <div className="text-sm font-medium text-black mt-4 mb-2">Importing members...</div>
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

// ── ADD/EDIT MEMBER MODAL ─────────────────────────────────────
function MemberModal({ show, onClose, member, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', phone: '', email: '', sex: '', unit: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (member) setForm({ name: member.name || '', phone: member.phone || '', email: member.email || '', sex: member.sex || '', unit: member.unit || '' })
    else setForm({ name: '', phone: '', email: '', sex: '', unit: '' })
  }, [member, show])

  function set(k, v) { setForm(p => ({...p, [k]: v})) }

  async function save() {
    if (!form.name.trim()) { toast('Name is required', 'error'); return }
    if (!form.phone.trim()) { toast('Phone is required', 'error'); return }
    setSaving(true)
    try {
      const data = { name: form.name.trim(), phone: form.phone.trim().replace(/[\s\-]/g,''), email: form.email.trim(), sex: form.sex, unit: form.unit }
      if (member) {
        await updateDoc(doc(db, 'members', member.id), data)
        toast('Member updated.')
      } else {
        await addDoc(collection(db, 'members'), { ...data, totalAttendance: 0, createdAt: serverTimestamp() })
        toast('Member added.')
      }
      onSaved(); onClose()
    } catch(e) { toast('Save failed: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal show={show} onClose={onClose}
      title={member ? 'Edit Member' : 'Add Member'}
      subtitle={member ? 'Update member details.' : 'Add a new member to the directory.'}
      actions={[
        <Btn key="c" variant="secondary" onClick={onClose}>Cancel</Btn>,
        <Btn key="s" onClick={save} disabled={saving}>{saving ? 'Saving...' : member ? 'Save Changes' : 'Add Member'}</Btn>
      ]}>
      <Input label="Full Name" required placeholder="e.g. Tunde Adepoju" value={form.name} onChange={e => set('name', e.target.value)} />
      <Input label="Phone Number" required placeholder="e.g. 08012345678" value={form.phone} onChange={e => set('phone', e.target.value)} />
      <Input label="Email" placeholder="e.g. tunde@gmail.com" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Sex" value={form.sex} onChange={e => set('sex', e.target.value)}>
          <option value="">Select...</option>
          <option>Male</option><option>Female</option><option>Prefer not to say</option>
        </Select>
        <Select label="Service Unit" value={form.unit} onChange={e => set('unit', e.target.value)}>
          <option value="">Select unit...</option>
          {UNITS.map(u => <option key={u}>{u}</option>)}
        </Select>
      </div>
    </Modal>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Members() {
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterUnit, setFilterUnit] = useState('')
  const [filterFlag, setFilterFlag] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [deleteMember, setDeleteMember] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'members'), orderBy('name', 'asc')))
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { toast('Failed to load members', 'error') }
    finally { setLoading(false) }
  }

  async function deleteMem() {
    if (!deleteMember) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'members', deleteMember.id))
      setMembers(prev => prev.filter(m => m.id !== deleteMember.id))
      setDeleteMember(null)
      toast('Member removed.')
    } catch(e) { toast('Delete failed', 'error') }
    finally { setDeleting(false) }
  }

  const filtered = members.filter(m => {
    if (search && !m.name?.toLowerCase().includes(search.toLowerCase()) && !m.phone?.includes(search) && !m.email?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterUnit && m.unit !== filterUnit) return false
    if (filterFlag === 'absent3' && daysAgo(m.lastSeenAt) < 21) return false
    if (filterFlag === 'absent5' && daysAgo(m.lastSeenAt) < 35) return false
    if (filterFlag === 'nounit' && m.unit) return false
    return true
  })

  const absent3 = members.filter(m => daysAgo(m.lastSeenAt) >= 21).length
  const absent5 = members.filter(m => daysAgo(m.lastSeenAt) >= 35).length
  const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort()

  return (
    <div className="p-7 max-w-6xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">People</h1>
          <p className="text-sm text-slate-500 mt-0.5">{members.length} members in directory</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="secondary" onClick={() => setShowImport(true)}><Upload size={13} />Import Excel</Btn>
          <Btn onClick={() => setShowAdd(true)}><Plus size={13} />Add Member</Btn>
        </div>
      </div>

      {/* Alert cards */}
      {(absent3 > 0 || absent5 > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {absent5 > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
              <div><div className="text-sm font-semibold text-red-700">{absent5} members absent 5+ weeks</div><button onClick={() => setFilterFlag('absent5')} className="text-xs text-red-500 underline">View list</button></div>
            </div>
          )}
          {absent3 > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
              <div><div className="text-sm font-semibold text-amber-700">{absent3} members absent 3+ weeks</div><button onClick={() => setFilterFlag('absent3')} className="text-xs text-amber-500 underline">View list</button></div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or email..."
            className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-2 text-sm outline-none bg-white cursor-pointer focus:border-blue-400">
          <option value="">All Units</option>
          {units.map(u => <option key={u}>{u}</option>)}
        </select>
        <select value={filterFlag} onChange={e => setFilterFlag(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-2 text-sm outline-none bg-white cursor-pointer focus:border-blue-400">
          <option value="">All Members</option>
          <option value="absent3">Absent 3+ weeks</option>
          <option value="absent5">Absent 5+ weeks</option>
          <option value="nounit">No unit assigned</option>
        </select>
        {(search || filterUnit || filterFlag) && (
          <button onClick={() => { setSearch(''); setFilterUnit(''); setFilterFlag('') }}
            className="text-xs text-slate-400 hover:text-slate-700 border border-slate-200 rounded-md px-3 py-2 transition-colors">Clear</button>
        )}
      </div>

      {/* Results count */}
      {(search || filterUnit || filterFlag) && (
        <div className="text-xs text-slate-400 mb-3">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>
      )}

      {loading ? <div className="flex justify-center py-16"><Spinner dark /></div>
        : members.length === 0 ? (
          <EmptyState icon="👥" title="No members yet"
            subtitle="Import your church register from Excel or add members one by one." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="No results" subtitle="Try a different search or filter." />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Member','Phone','Unit','Last Seen','Attendance',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <InitialAvatar name={m.name} size="sm" />
                          <div>
                            <div className="font-medium text-black text-sm">{m.name}</div>
                            <div className="text-xs text-slate-400">{m.email || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.phone}</td>
                      <td className="px-4 py-3">
                        {m.unit ? <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{m.unit}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {m.lastSeenAt ? `${daysAgo(m.lastSeenAt)}d ago` : 'Never'}
                          </span>
                          <AbsenteeBadge lastSeen={m.lastSeenAt} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-center">{m.totalAttendance || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <IconBtn onClick={() => setEditMember(m)}><Pencil size={13} /></IconBtn>
                          <IconBtn danger onClick={() => setDeleteMember(m)}><Trash2 size={13} /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <ImportModal show={showImport} onClose={() => setShowImport(false)} onImported={load} />
      <MemberModal show={showAdd || !!editMember} onClose={() => { setShowAdd(false); setEditMember(null) }} member={editMember} onSaved={load} />
      <Modal show={!!deleteMember} onClose={() => setDeleteMember(null)} title="Remove Member?"
        subtitle={`Remove ${deleteMember?.name} from the directory? This does not delete their attendance history.`}
        actions={[
          <Btn key="c" variant="secondary" onClick={() => setDeleteMember(null)}>Cancel</Btn>,
          <Btn key="d" variant="danger" onClick={deleteMem} disabled={deleting}>{deleting ? 'Removing...' : 'Remove'}</Btn>
        ]} />
    </div>
  )
}
