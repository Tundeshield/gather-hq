import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../firebase'
import { churchCol, churchDoc } from '../db'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp, writeBatch
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { normalizePhone, cleanOptional, combineName } from '../utils'
import { Btn, IconBtn, Input, Select, EmptyState, Spinner } from '../components/UI'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { isSuperAdmin } from '../auth'
import { Plus, Upload, Pencil, Trash2, Search, X, Download, AlertTriangle } from 'lucide-react'

const UNITS = ['EPOP','Ushering','Assimilation','Hospitality','Creative Arts','Multimedia','Sound','Prayer','Missions','Junior Church','Teens Nation','Surge','Maturity Purpose','Greatness Community','Social Media','Sanitation','Protocol','Pastoral Care','Family Life','Ministry Purpose II','Other']

// ── ATTENDANCE HELPERS ─────────────────────────────────────────
function daysAgo(ts) {
  if (!ts) return null
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  return days < 0 ? 0 : days  // ignore future-dated records
}

function getAttendanceStatus(member) {
  if (!member.lastSeenAt) return 'never'
  const days = daysAgo(member.lastSeenAt)
  if (days === null) return 'never'
  if (days < 14) return 'recent'
  if (days < 21) return 'absent_2w'
  if (days < 30) return 'absent_3w'
  if (days < 60) return 'absent_1m'
  if (days < 90) return 'absent_2m'
  return 'absent_3m'
}

const STATUS_CONFIG = {
  recent:    { label: 'Recent',        color: 'bg-green-100 text-green-700 border-green-200' },
  absent_2w: { label: '2 Weeks Absent', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  absent_3w: { label: '3 Weeks Absent', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  absent_1m: { label: '1 Month Absent', color: 'bg-red-100 text-red-600 border-red-200' },
  absent_2m: { label: '2 Months Absent','color': 'bg-red-200 text-red-700 border-red-300' },
  absent_3m: { label: '3+ Months Absent', color: 'bg-red-300 text-red-800 border-red-400' },
  never:     { label: 'Never Attended', color: 'bg-slate-100 text-slate-500 border-slate-200' },
}

function StatusBadge({ member }) {
  const s = getAttendanceStatus(member)
  const cfg = STATUS_CONFIG[s]
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-sm border whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
}

function formatDaysSince(member) {
  if (!member.lastSeenAt) return <span className="text-slate-400 text-xs">No attendance recorded</span>
  const days = daysAgo(member.lastSeenAt)
  if (days === 0) return <span className="text-green-600 text-xs font-medium">Today</span>
  if (days === 1) return <span className="text-green-600 text-xs">Yesterday</span>
  return <span className="text-xs text-slate-500">{days} days ago</span>
}

function formatLastSeen(member) {
  if (!member.lastSeenAt) return <span className="text-slate-400 text-xs">Never</span>
  const d = member.lastSeenAt.toDate ? member.lastSeenAt.toDate() : new Date(member.lastSeenAt)
  return <span className="text-xs text-slate-600">{d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
}

function InitialAvatar({ name }) {
  const initials = (name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()
  const colors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-pink-500','bg-teal-500']
  const color = colors[initials.charCodeAt(0) % colors.length]
  return <div className={`w-8 h-8 ${color} rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>{initials}</div>
}

// ── SUMMARY CARDS ──────────────────────────────────────────────
function SummaryCards({ members, activeFilter, onFilter }) {
  const now = Date.now()
  const stats = {
    total: members.length,
    recent: members.filter(m => m.lastSeenAt && daysAgo(m.lastSeenAt) < 14).length,
    absent_3w: members.filter(m => m.lastSeenAt && daysAgo(m.lastSeenAt) >= 21).length,
    absent_1m: members.filter(m => m.lastSeenAt && daysAgo(m.lastSeenAt) >= 30).length,
    absent_3m: members.filter(m => m.lastSeenAt && daysAgo(m.lastSeenAt) >= 90).length,
    never: members.filter(m => !m.lastSeenAt).length,
    no_unit: members.filter(m => !m.unit).length,
  }

  const cards = [
    { key: 'all', label: 'Total Members', value: stats.total, color: 'border-blue-600 bg-blue-600', text: 'text-white', sub: 'text-blue-200' },
    { key: 'recent', label: 'Active (14 Days)', value: stats.recent, color: 'border-green-200 bg-green-50', text: 'text-green-700', sub: 'text-green-500' },
    { key: 'absent_3w', label: 'Absent 3+ Weeks', value: stats.absent_3w, color: 'border-orange-200 bg-orange-50', text: 'text-orange-700', sub: 'text-orange-400' },
    { key: 'absent_1m', label: 'Absent 1+ Month', value: stats.absent_1m, color: 'border-red-200 bg-red-50', text: 'text-red-700', sub: 'text-red-400' },
    { key: 'absent_3m', label: 'Absent 3+ Months', value: stats.absent_3m, color: 'border-red-300 bg-red-100', text: 'text-red-800', sub: 'text-red-500' },
    { key: 'never', label: 'Never Attended', value: stats.never, color: 'border-slate-200 bg-slate-50', text: 'text-slate-700', sub: 'text-slate-400' },
    { key: 'no_unit', label: 'No Unit Assigned', value: stats.no_unit, color: 'border-slate-200 bg-white', text: 'text-slate-700', sub: 'text-slate-400' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-6">
      {cards.map(c => (
        <button key={c.key} onClick={() => onFilter(c.key === activeFilter ? 'all' : c.key)}
          className={`rounded-lg p-3 border text-left transition-all hover:shadow-md ${c.color} ${activeFilter === c.key ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}>
          <div className={`text-2xl font-bold leading-none mb-1 ${c.text}`}>{c.value}</div>
          <div className={`text-[11px] font-medium leading-tight ${c.sub}`}>{c.label}</div>
        </button>
      ))}
    </div>
  )
}

// ── IMPORT MODAL ───────────────────────────────────────────────
function ImportModal({ show, onClose, onImported }) {
  const toast = useToast()
  const fileRef = useRef()
  const [step, setStep] = useState('upload')
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({ name:'', name2:'', phone:'', email:'', sex:'', unit:'' })
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)

  function reset() { setStep('upload'); setRows([]); setHeaders([]); setMapping({name:'',name2:'',phone:'',email:'',sex:'',unit:''}); setPreview([]); setProgress(0) }

  function getIdx(col) { return col ? headers.indexOf(col) : -1 }

  function handleFile(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type:'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' })
      if (data.length < 2) { toast('File appears empty','error'); return }
      const hdrs = data[0].map(h=>String(h).trim()).filter(Boolean)
      setHeaders(hdrs); setRows(data.slice(1).filter(r=>r.some(c=>c)))
      const m = {name:'',name2:'',phone:'',email:'',sex:'',unit:''}
      hdrs.forEach(h => {
        const hl = h.toLowerCase()
        if (!m.name && (hl.includes('surname') || hl.includes('last'))) m.name = h
        else if (!m.name && hl.includes('name')) m.name = h
        if (!m.name2 && (hl==='name'||hl.includes('first')||hl.includes('other')||hl.includes('given'))) m.name2 = h
        if (!m.phone && (hl.includes('phone')||hl.includes('mobile')||hl.includes('tel'))) m.phone = h
        if (!m.email && hl.includes('email')) m.email = h
        if (!m.sex && (hl.includes('sex')||hl.includes('gender'))) m.sex = h
        if (!m.unit && (hl.includes('unit')||hl.includes('department')||hl.includes('dept'))) m.unit = h
      })
      setMapping(m); setStep('map')
    }
    reader.readAsBinaryString(file); e.target.value=''
  }

  function buildPreview() {
    if (!mapping.name||!mapping.phone) { toast('Name and Phone columns required','error'); return }
    const ni=getIdx(mapping.name), n2i=getIdx(mapping.name2), pi=getIdx(mapping.phone)
    const ei=getIdx(mapping.email), si=getIdx(mapping.sex), ui=getIdx(mapping.unit)
    const prev = rows.slice(0,5).map(r=>({
      name: combineName(r[ni], n2i>=0?r[n2i]:''),
      phone: normalizePhone(r[pi]),
      email: ei>=0?cleanOptional(r[ei]):'',
      sex: si>=0?cleanOptional(r[si]):'',
      unit: ui>=0?cleanOptional(r[ui]):'',
    })).filter(r=>r.name&&r.phone)
    setPreview(prev); setStep('preview')
  }

  async function doImport() {
    if (!mapping.name||!mapping.phone) return
    setImporting(true); setStep('importing')
    const ni=getIdx(mapping.name), n2i=getIdx(mapping.name2), pi=getIdx(mapping.phone)
    const ei=getIdx(mapping.email), si=getIdx(mapping.sex), ui=getIdx(mapping.unit)
    const members = rows.map(r=>({
      name: combineName(r[ni], n2i>=0?r[n2i]:''),
      phone: normalizePhone(r[pi]),
      email: ei>=0?cleanOptional(r[ei]):'',
      sex: si>=0?cleanOptional(r[si]):'',
      unit: ui>=0?cleanOptional(r[ui]):'',
    })).filter(m=>m.name&&m.phone)
    const existingSnap = await getDocs(churchCol('members'))
    const existingPhones = new Set(existingSnap.docs.map(d=>d.data().phone))
    let imported=0, skipped=0
    for (let i=0;i<members.length;i++) {
      const m=members[i]; setProgress(Math.round((i/members.length)*100))
      if (existingPhones.has(m.phone)) { skipped++; continue }
      try { await addDoc(churchCol('members'),{...m,totalAttendance:0,createdAt:serverTimestamp()}); imported++ }
      catch(e) { skipped++ }
    }
    setImporting(false)
    toast(`✅ Imported ${imported} members${skipped>0?` (${skipped} skipped — duplicates)`:''}`,'success')
    onImported(); reset(); onClose()
  }

  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-white rounded-lg p-7 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="text-lg font-bold text-black mb-1">Import Members from Excel</div>
        <div className="text-sm text-slate-500 mb-6">Upload your church member register.</div>

        {step==='upload' && (
          <div>
            <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <Upload size={32} className="mx-auto text-slate-300 mb-3"/>
              <div className="text-sm font-medium text-slate-600">Click to upload Excel file</div>
              <div className="text-xs text-slate-400 mt-1">.xlsx or .xls or .csv</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile}/>
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
              Columns needed: <strong>Surname/Name</strong> + <strong>Phone Number</strong>. Everything else is optional.
            </div>
          </div>
        )}

        {step==='map' && (
          <div>
            <div className="text-sm font-medium text-black mb-4">{rows.length} rows found — map your columns:</div>
            {[
              {key:'name', label:'First Column (Surname or Full Name)', required:true},
              {key:'name2', label:'Second Name Column (e.g. First Name)', required:false},
              {key:'phone', label:'Phone Number', required:true},
              {key:'email', label:'Email', required:false},
              {key:'sex', label:'Sex / Gender', required:false},
              {key:'unit', label:'Service Unit', required:false},
            ].map(({key,label,required})=>(
              <div key={key} className="mb-3">
                <label className="block text-sm font-medium text-black mb-1.5">{label}{required&&<span className="text-red-500 ml-0.5">*</span>}</label>
                <select value={mapping[key]} onChange={e=>setMapping(p=>({...p,[key]:e.target.value}))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white cursor-pointer">
                  <option value="">{required?'Select column...':'Skip this field'}</option>
                  {headers.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2 justify-end mt-5">
              <Btn variant="secondary" onClick={reset}>Back</Btn>
              <Btn onClick={buildPreview}>Preview Import</Btn>
            </div>
          </div>
        )}

        {step==='preview' && (
          <div>
            <div className="text-sm font-medium text-black mb-4">Preview — first 5 rows:</div>
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  {['Name','Phone','Email','Sex','Unit'].map(h=><th key={h} className="text-left px-3 py-2 font-semibold text-slate-400 uppercase tracking-wide">{h}</th>)}
                </tr></thead>
                <tbody>{preview.map((r,i)=>(
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
                    <td className="px-3 py-2 text-slate-500">{r.phone}</td>
                    <td className="px-3 py-2 text-slate-500">{r.email||'—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.sex||'—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.unit||'—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-5">
              Will import <strong>{rows.length} members</strong>. Duplicate phone numbers will be skipped.
            </div>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" onClick={()=>setStep('map')}>Back</Btn>
              <Btn onClick={doImport}>Import {rows.length} Members</Btn>
            </div>
          </div>
        )}

        {step==='importing' && (
          <div className="text-center py-8">
            <Spinner dark/>
            <div className="text-sm font-medium text-black mt-4 mb-2">Importing members...</div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{width:progress+'%'}}/>
            </div>
            <div className="text-xs text-slate-400">{progress}% complete</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MEMBER MODAL ───────────────────────────────────────────────
function MemberModal({ show, onClose, member, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({name:'',phone:'',email:'',sex:'',unit:''})
  const [saving, setSaving] = useState(false)
  useEffect(()=>{
    if (member) setForm({name:member.name||'',phone:member.phone||'',email:member.email||'',sex:member.sex||'',unit:member.unit||''})
    else setForm({name:'',phone:'',email:'',sex:'',unit:''})
  },[member,show])
  function set(k,v){setForm(p=>({...p,[k]:v}))}
  async function save(){
    if (!form.name.trim()){toast('Name is required','error');return}
    if (!form.phone.trim()){toast('Phone is required','error');return}
    setSaving(true)
    try {
      const data={name:form.name.trim(),phone:normalizePhone(form.phone),email:form.email.trim(),sex:form.sex,unit:form.unit}
      if (member){await updateDoc(churchDoc('members',member.id),data);toast('Member updated.')}
      else{await addDoc(churchCol('members'),{...data,totalAttendance:0,createdAt:serverTimestamp()});toast('Member added.')}
      onSaved();onClose()
    }catch(e){toast('Save failed: '+e.message,'error')}
    finally{setSaving(false)}
  }
  return (
    <Modal show={show} onClose={onClose} title={member?'Edit Member':'Add Member'} subtitle={member?'Update member details.':'Add a new member to the directory.'}
      actions={[<Btn key="c" variant="secondary" onClick={onClose}>Cancel</Btn>,<Btn key="s" onClick={save} disabled={saving}>{saving?'Saving...':member?'Save Changes':'Add Member'}</Btn>]}>
      <Input label="Full Name" required placeholder="e.g. Tunde Adepoju" value={form.name} onChange={e=>set('name',e.target.value)}/>
      <Input label="Phone Number" required placeholder="e.g. 08012345678" value={form.phone} onChange={e=>set('phone',e.target.value)}/>
      <Input label="Email" placeholder="e.g. tunde@gmail.com" type="email" value={form.email} onChange={e=>set('email',e.target.value)}/>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Sex" value={form.sex} onChange={e=>set('sex',e.target.value)}>
          <option value="">Select...</option>
          <option>Male</option><option>Female</option><option>Prefer not to say</option>
        </Select>
        <Select label="Service Unit" value={form.unit} onChange={e=>set('unit',e.target.value)}>
          <option value="">Select unit...</option>
          {UNITS.map(u=><option key={u}>{u}</option>)}
        </Select>
      </div>
    </Modal>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
const FILTER_OPTIONS = [
  {value:'all', label:'All Members'},
  {value:'recent', label:'Active (Last 14 Days)'},
  {value:'absent_2w', label:'Absent 2–3 Weeks'},
  {value:'absent_3w', label:'Absent 3–4 Weeks'},
  {value:'absent_1m', label:'Absent 1–2 Months'},
  {value:'absent_2m', label:'Absent 2–3 Months'},
  {value:'absent_3m', label:'Absent 3+ Months'},
  {value:'never', label:'Never Attended'},
  {value:'no_unit', label:'No Unit Assigned'},
]

export default function Members() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('filter') || 'all')
  const [filterUnit, setFilterUnit] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [deleteMember, setDeleteMember] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [sortBy, setSortBy] = useState('name') // name | lastSeen | attendance

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    try {
      const snap = await getDocs(query(churchCol('members'),orderBy('name','asc')))
      setMembers(snap.docs.map(d=>({id:d.id,...d.data()})))
    }catch(e){toast('Failed to load members','error')}
    finally{setLoading(false)}
  }

  async function deleteMem(){
    if (!deleteMember) return
    setDeleting(true)
    try {
      await deleteDoc(deleteMember.ref || churchDoc('members', deleteMember.id))
      setMembers(prev=>prev.filter(m=>m.id!==deleteMember.id))
      setDeleteMember(null); toast('Member removed.')
    }catch(e){toast('Delete failed','error')}
    finally{setDeleting(false)}
  }

  async function deleteAllMembers() {
    setDeletingAll(true)
    try {
      const snap = await getDocs(churchCol('members'))
      const batches = []
      let batch = writeBatch(db)
      let count = 0
      snap.docs.forEach(d => {
        batch.delete(d.ref)
        count++
        if (count === 499) { batches.push(batch); batch = writeBatch(db); count = 0 }
      })
      if (count > 0) batches.push(batch)
      await Promise.all(batches.map(b => b.commit()))
      setMembers([])
      setShowDeleteAll(false)
      toast(`Deleted all ${snap.size} members.`)
    } catch(e) { toast('Delete failed: ' + e.message, 'error') }
    finally { setDeletingAll(false) }
  }

  function exportFiltered(membersToExport) {
    const label = FILTER_OPTIONS.find(o => o.value === filterStatus)?.label || 'All Members'
    const headers = ['Full Name', 'Phone', 'Email', 'Sex', 'Unit', 'Attendance Status', 'Last Attended', 'Days Since', 'Total Attendance']
    const rows = membersToExport.map(m => {
      const status = STATUS_CONFIG[getAttendanceStatus(m)]?.label || ''
      const lastSeen = m.lastSeenAt
        ? (m.lastSeenAt.toDate ? m.lastSeenAt.toDate() : new Date(m.lastSeenAt)).toLocaleDateString('en-GB')
        : 'Never'
      const days = m.lastSeenAt ? (daysAgo(m.lastSeenAt) + ' days ago') : 'No attendance recorded'
      return [m.name||'', m.phone||'', m.email||'', m.sex||'', m.unit||'', status, lastSeen, days, m.totalAttendance||0]
    })
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map((h,i) => ({ wch: [25,15,28,8,20,18,15,20,12][i] }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Members')
    const date = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `GatherHQ-Members-${label.replace(/\s+/g,'-')}-${date}.xlsx`)
    toast(`Exported ${membersToExport.length} members`, 'success')
  }

  function resetFilters(){setSearch('');setFilterStatus('all');setFilterUnit('')}
  const hasFilters = search||filterStatus!=='all'||filterUnit

  const filtered = members.filter(m=>{
    if (search) {
      const q=search.toLowerCase()
      if (!m.name?.toLowerCase().includes(q) && !m.phone?.includes(q) && !m.email?.toLowerCase().includes(q)) return false
    }
    if (filterUnit && m.unit!==filterUnit) return false
    if (filterStatus==='all') return true
    if (filterStatus==='no_unit') return !m.unit
    if (filterStatus==='never') return !m.lastSeenAt
    if (filterStatus==='recent') return m.lastSeenAt && daysAgo(m.lastSeenAt)<14
    const status = getAttendanceStatus(m)
    return status===filterStatus
  })

  const sorted = [...filtered].sort((a,b)=>{
    if (sortBy==='lastSeen') {
      if (!a.lastSeenAt && !b.lastSeenAt) return 0
      if (!a.lastSeenAt) return 1
      if (!b.lastSeenAt) return -1
      const da = a.lastSeenAt.toDate?a.lastSeenAt.toDate():new Date(a.lastSeenAt)
      const db2 = b.lastSeenAt.toDate?b.lastSeenAt.toDate():new Date(b.lastSeenAt)
      return db2-da
    }
    if (sortBy==='attendance') return (b.totalAttendance||0)-(a.totalAttendance||0)
    return (a.name||'').localeCompare(b.name||'')
  })

  const units = [...new Set(members.map(m=>m.unit).filter(Boolean))].sort()

  return (
    <div className="p-5 md:p-7 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">People</h1>
          <p className="text-sm text-slate-500 mt-0.5">{members.length} members in directory</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="secondary" onClick={()=>setShowImport(true)}><Upload size={13}/>Import Excel</Btn>
          <Btn variant="secondary" onClick={()=>exportFiltered(sorted)}><Download size={13}/>Export {sorted.length !== members.length ? `(${sorted.length})` : 'All'}</Btn>
          {isSuperAdmin() && (
            <Btn variant="danger" onClick={()=>setShowDeleteAll(true)}><Trash2 size={13}/>Delete All</Btn>
          )}
          <Btn onClick={()=>setShowAdd(true)}><Plus size={13}/>Add Member</Btn>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && <SummaryCards members={members} activeFilter={filterStatus} onFilter={f=>{setFilterStatus(f);setSearch('');setFilterUnit('')}} />}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone or email..."
              className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
          </div>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-md px-3 py-2 text-sm outline-none bg-white cursor-pointer focus:border-blue-400 min-w-[180px]">
            {FILTER_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}
            className="border border-slate-200 rounded-md px-3 py-2 text-sm outline-none bg-white cursor-pointer focus:border-blue-400">
            <option value="">All Units</option>
            {units.map(u=><option key={u}>{u}</option>)}
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            className="border border-slate-200 rounded-md px-3 py-2 text-sm outline-none bg-white cursor-pointer focus:border-blue-400">
            <option value="name">Sort: Name</option>
            <option value="lastSeen">Sort: Last Seen</option>
            <option value="attendance">Sort: Most Attended</option>
          </select>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-md px-3 py-2 transition-colors">
              <X size={12}/>Reset
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {hasFilters ? <><strong className="text-slate-700">{sorted.length}</strong> of {members.length} members</> : <><strong className="text-slate-700">{members.length}</strong> members total</>}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner dark/></div>
      ) : members.length===0 ? (
        <EmptyState icon="👥" title="No members yet" subtitle="Import your church register from Excel or add members one by one."/>
      ) : sorted.length===0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">🔍</div>
          <div className="text-sm font-medium text-slate-600 mb-1">No members match these filters</div>
          <button onClick={resetFilters} className="text-sm text-blue-600 underline">Reset filters</button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Member</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unit</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Last Attended</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Since</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Count</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(m=>(
                  <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={m.name}/>
                        <div>
                          <div className="font-medium text-black text-sm">{m.name}</div>
                          <div className="text-xs text-slate-400">{m.email||''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">{m.phone}</td>
                    <td className="px-4 py-3">
                      {m.unit
                        ? <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded whitespace-nowrap">{m.unit}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge member={m}/></td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatLastSeen(m)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDaysSince(m)}</td>
                    <td className="px-4 py-3 text-center text-slate-600 font-medium text-sm">{m.totalAttendance||0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <IconBtn onClick={()=>setEditMember(m)}><Pencil size={13}/></IconBtn>
                        <IconBtn danger onClick={()=>setDeleteMember(m)}><Trash2 size={13}/></IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
            <span>Showing {sorted.length} of {members.length} members</span>
            {filterStatus!=='all' && (
              <span className="text-blue-600 font-medium">{FILTER_OPTIONS.find(o=>o.value===filterStatus)?.label}</span>
            )}
          </div>
        </div>
      )}

      <ImportModal show={showImport} onClose={()=>setShowImport(false)} onImported={load}/>
      <MemberModal show={showAdd||!!editMember} onClose={()=>{setShowAdd(false);setEditMember(null)}} member={editMember} onSaved={load}/>
      <Modal show={!!deleteMember} onClose={()=>setDeleteMember(null)} title="Remove Member?"
        subtitle={`Remove ${deleteMember?.name} from the directory? This does not delete their attendance history.`}
        actions={[
          <Btn key="c" variant="secondary" onClick={()=>setDeleteMember(null)}>Cancel</Btn>,
          <Btn key="d" variant="danger" onClick={deleteMem} disabled={deleting}>{deleting?'Removing...':'Remove'}</Btn>
        ]}/>
      <Modal show={showDeleteAll} onClose={()=>setShowDeleteAll(false)} title="⚠️ Delete All Members?"
        subtitle={`This will permanently delete all ${members.length} members from the directory. This cannot be undone. Attendance records from past sessions will not be affected.`}
        actions={[
          <Btn key="c" variant="secondary" onClick={()=>setShowDeleteAll(false)}>Cancel</Btn>,
          <Btn key="d" variant="danger" onClick={deleteAllMembers} disabled={deletingAll}>
            {deletingAll ? <><Spinner />Deleting...</> : `Yes, Delete All ${members.length} Members`}
          </Btn>
        ]}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-red-700">This action is irreversible. Only Super Admins can do this. Make sure you have a backup export before proceeding.</div>
        </div>
      </Modal>
    </div>
  )
}
