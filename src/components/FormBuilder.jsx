import { useState } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import { Btn, Toggle, Badge } from './UI'

const FIELD_TYPES = ['text', 'phone', 'email', 'textarea', 'dropdown', 'checkbox']

export const SESSION_PRESETS = [
  { label: 'Full Name', type: 'text', required: true },
  { label: 'Phone Number', type: 'phone', required: true },
  { label: 'Email Address', type: 'email', required: false },
  { label: 'Service Unit', type: 'text', required: false },
  { label: 'First Timer?', type: 'dropdown', options: 'Yes,No', required: false },
  { label: 'Location', type: 'text', required: false },
]

export const EVENT_PRESETS = [
  { label: 'Full Name', type: 'text', required: true },
  { label: 'Phone Number', type: 'phone', required: true },
  { label: 'Email Address', type: 'email', required: false },
  { label: 'Are you a member?', type: 'dropdown', options: "Yes, I'm a member,I attend occasionally,First time visiting,I attend another church", required: false },
  { label: 'How did you hear?', type: 'dropdown', options: 'WhatsApp,A friend invited me,Social media,Church announcement,Other', required: false },
  { label: 'Bringing others?', type: 'dropdown', options: 'Just me,2-3 people,4+ people', required: false },
]

function newField(overrides = {}) {
  return { id: 'f_' + Date.now() + Math.random().toString(36).slice(2, 5), label: '', type: 'text', required: false, options: '', ...overrides }
}

function PhonePreview({ fields, sessionName }) {
  return (
    <div className="bg-slate-800 rounded-[28px] p-3.5">
      <div className="bg-slate-50 rounded-[18px] p-4 min-h-[360px]">
        <div className="border-b border-slate-200 pb-2 mb-3">
          <div className="text-[11px] text-slate-400">The Elevation Church</div>
          <div className="text-sm font-semibold text-black">{sessionName || 'Session'}</div>
        </div>
        {fields.length === 0 ? (
          <div className="text-[12px] text-slate-400 text-center pt-8">Fields appear here as you add them.</div>
        ) : (
          <>
            {fields.map(f => (
              <div key={f.id} className="mb-3">
                <div className="text-[11px] font-medium text-black mb-1">
                  {f.label || 'Field'}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </div>
                {f.type === 'dropdown'
                  ? <div className="text-[12px] border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-400">{f.options?.split(',')[0]?.trim() || 'Select...'} ▾</div>
                  : f.type === 'checkbox'
                  ? <div className="flex items-center gap-1.5"><input type="checkbox" disabled /><span className="text-[11px] text-slate-500">{f.label || 'Option'}</span></div>
                  : <div className="text-[12px] border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-400">{f.type === 'phone' ? 'e.g. 08012345678' : ''}</div>
                }
              </div>
            ))}
            <div className="bg-blue-600 text-white text-center text-[12px] font-medium py-2.5 rounded mt-2">Submit</div>
          </>
        )}
      </div>
    </div>
  )
}

export default function FormBuilder({ fields, onChange, presets, sessionName }) {
  function addPreset(preset) {
    onChange([...fields, newField(preset)])
  }

  function addCustom() {
    onChange([...fields, newField()])
  }

  function removeField(id) {
    onChange(fields.filter(f => f.id !== id))
  }

  function updateField(id, prop, value) {
    onChange(fields.map(f => f.id === id ? { ...f, [prop]: value } : f))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
      <div>
        {/* Presets */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-4">
          <div className="text-sm font-semibold text-black mb-3">Quick Add Presets</div>
          <div className="flex flex-wrap gap-2">
            {(presets || SESSION_PRESETS).map(p => (
              <button key={p.label} onClick={() => addPreset(p)}
                className="border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-all bg-white">
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fields */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-black">Form Fields</div>
            <Btn variant="secondary" className="text-xs py-1.5 px-3" onClick={addCustom}>+ Add Custom</Btn>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              No fields yet. Choose a preset or add a custom field.
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={f.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex items-center gap-2 flex-wrap">
                    <GripVertical size={16} className="text-slate-300 flex-shrink-0" />
                    <input
                      value={f.label}
                      onChange={e => updateField(f.id, 'label', e.target.value)}
                      placeholder="Field label"
                      className="border border-slate-200 rounded px-2.5 py-1.5 text-sm outline-none flex-1 min-w-[120px] focus:border-blue-400"
                    />
                    <select
                      value={f.type}
                      onChange={e => updateField(f.id, 'type', e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1.5 text-xs outline-none bg-white cursor-pointer focus:border-blue-400"
                    >
                      {FIELD_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    <Toggle checked={f.required} onChange={v => updateField(f.id, 'required', v)} label="Req" />
                    <button onClick={() => removeField(f.id)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {f.type === 'dropdown' && (
                    <input
                      value={f.options || ''}
                      onChange={e => updateField(f.id, 'options', e.target.value)}
                      placeholder="Options: Yes,No,Maybe (comma-separated)"
                      className="mt-2 w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-400"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="hidden lg:block">
        <div className="bg-white border border-slate-200 rounded-lg p-4 sticky top-4">
          <div className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
            <span>📱</span> Member Preview
          </div>
          <PhonePreview fields={fields} sessionName={sessionName} />
        </div>
      </div>
    </div>
  )
}
