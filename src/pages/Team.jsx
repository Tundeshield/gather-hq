import { useEffect, useState } from 'react'
import { getTeamMembers, addTeamMember, updateTeamMember, deactivateTeamMember, ROLES, currentUser, currentChurchId, currentChurchName } from '../auth'
import { Btn, IconBtn, Input, Select, EmptyState, Spinner } from '../components/UI'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { Plus, Pencil, UserX, Eye, EyeOff } from 'lucide-react'

function RoleBadge({ role }) {
  const r = ROLES.find(r => r.value === role)
  const colors = {
    super_admin: 'bg-purple-100 text-purple-700 border-purple-200',
    admin: 'bg-blue-100 text-blue-700 border-blue-200',
    attendance_lead: 'bg-green-100 text-green-700 border-green-200',
    usher: 'bg-amber-100 text-amber-700 border-amber-200',
    viewer: 'bg-slate-100 text-slate-600 border-slate-200',
  }
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-sm border ${colors[role] || colors.viewer}`}>{r?.label || role}</span>
}

function InitialAvatar({ name }) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-pink-500']
  const color = colors[initials.charCodeAt(0) % colors.length]
  return <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>{initials}</div>
}

function MemberModal({ show, onClose, member, onSaved, churchId }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'attendance_lead' })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (member) setForm({ name: member.name || '', email: member.email || '', password: '', role: member.role || 'attendance_lead' })
    else setForm({ name: '', email: '', password: '', role: 'attendance_lead' })
  }, [member, show])

  function set(k, v) { setForm(p => ({...p, [k]: v})) }

  async function save() {
    if (!form.name.trim()) { toast('Name is required', 'error'); return }
    if (!form.email.trim()) { toast('Email is required', 'error'); return }
    if (!member && !form.password.trim()) { toast('Password is required', 'error'); return }
    setSaving(true)
    try {
      if (member) {
        const updates = { name: form.name.trim(), email: form.email.toLowerCase().trim(), role: form.role, originalEmail: member.email, originalName: member.name }
        if (form.password.trim()) updates.password = form.password.trim()
        await updateTeamMember(churchId, member.id, updates)
        toast('Team member updated.')
      } else {
        await addTeamMember(churchId, { name: form.name.trim(), email: form.email.toLowerCase().trim(), password: form.password.trim(), role: form.role })
        toast('Team member added.')
      }
      onSaved(); onClose()
    } catch(e) { toast(e.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  const selectedRole = ROLES.find(r => r.value === form.role)

  return (
    <Modal show={show} onClose={onClose}
      title={member ? 'Edit Team Member' : 'Add Team Member'}
      subtitle={member ? 'Update their details or reset their password.' : 'Add a new person to your team.'}
      actions={[
        <Btn key="c" variant="secondary" onClick={onClose}>Cancel</Btn>,
        <Btn key="s" onClick={save} disabled={saving}>{saving ? 'Saving...' : member ? 'Save Changes' : 'Add Member'}</Btn>
      ]}>
      <Input label="Full Name" required placeholder="e.g. Biodun Adewale" value={form.name} onChange={e => set('name', e.target.value)} />
      <Input label="Email" required type="email" placeholder="biodun@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
      <div className="mb-3.5">
        <label className="block text-sm font-medium text-black mb-1.5">
          Password {member && <span className="text-slate-400 font-normal text-xs">(leave blank to keep current)</span>}
          {!member && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="relative">
          <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
            placeholder={member ? 'New password...' : 'Set a password'}
            className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 pr-10" />
          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div className="mb-3.5">
        <label className="block text-sm font-medium text-black mb-1.5">Role</label>
        <select value={form.role} onChange={e => set('role', e.target.value)}
          className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white cursor-pointer">
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {selectedRole && <div className="mt-2 text-xs text-slate-400 bg-slate-50 rounded p-2">{selectedRole.description}</div>}
      </div>
    </Modal>
  )
}

export default function Team() {
  const toast = useToast()
  const me = currentUser()
  const churchId = currentChurchId()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [showDeactivate, setShowDeactivate] = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const team = await getTeamMembers(churchId)
      setMembers(team.sort((a, b) => a.name.localeCompare(b.name)))
    } catch(e) { toast('Failed to load team', 'error') }
    finally { setLoading(false) }
  }

  async function doDeactivate() {
    if (!showDeactivate) return
    setDeactivating(true)
    try {
      await deactivateTeamMember(churchId, showDeactivate.id, showDeactivate.email)
      setMembers(prev => prev.filter(m => m.id !== showDeactivate.id))
      setShowDeactivate(null)
      toast('Team member deactivated.')
    } catch(e) { toast('Failed', 'error') }
    finally { setDeactivating(false) }
  }

  return (
    <div className="p-7 max-w-4xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">{currentChurchName()} · {members.length} active member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <Btn onClick={() => setShowAdd(true)}><Plus size={13} />Add Team Member</Btn>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Role Permissions</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-start gap-2">
              <RoleBadge role={r.value} />
              <span className="text-xs text-slate-400 leading-tight">{r.description}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner dark /></div>
        : members.length === 0 ? <EmptyState icon="👥" title="No team members yet" subtitle="Add your first team member." />
        : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Team Member','Role','Last Login',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={m.name} />
                        <div>
                          <div className="font-medium text-black text-sm flex items-center gap-1.5">
                            {m.name}
                            {m.email === me?.email && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">You</span>}
                          </div>
                          <div className="text-xs text-slate-400">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {m.lastLoginAt?.toDate?.()?.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) || 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <IconBtn onClick={() => setEditMember(m)}><Pencil size={13} /></IconBtn>
                        {m.email !== me?.email && (
                          <IconBtn danger onClick={() => setShowDeactivate(m)}><UserX size={13} /></IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <MemberModal show={showAdd || !!editMember} onClose={() => { setShowAdd(false); setEditMember(null) }}
        member={editMember} onSaved={load} churchId={churchId} />
      <Modal show={!!showDeactivate} onClose={() => setShowDeactivate(null)} title="Deactivate Team Member?"
        subtitle={`${showDeactivate?.name} will no longer be able to log in.`}
        actions={[
          <Btn key="c" variant="secondary" onClick={() => setShowDeactivate(null)}>Cancel</Btn>,
          <Btn key="d" variant="danger" onClick={doDeactivate} disabled={deactivating}>
            {deactivating ? 'Deactivating...' : 'Deactivate'}
          </Btn>
        ]} />
    </div>
  )
}
