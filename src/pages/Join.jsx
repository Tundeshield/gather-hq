import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { registerChurch, INVITE_TOKEN, login } from '../auth'
import { Spinner } from '../components/UI'

export default function Join() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [validToken, setValidToken] = useState(false)
  const [form, setForm] = useState({ branch: '', adminName: '', adminEmail: '', adminPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    const token = params.get('token')
    if (token === INVITE_TOKEN) setValidToken(true)
  }, [params])

  function set(k, v) { setForm(p => ({...p, [k]: v})); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.branch.trim()) { setError('Branch/city name is required'); return }
    if (!form.adminName.trim()) { setError('Your name is required'); return }
    if (!form.adminEmail.trim()) { setError('Email is required'); return }
    if (form.adminPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (form.adminPassword !== form.confirmPassword) { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      await registerChurch({
        churchName: 'The Elevation Church',
        branch: form.branch.trim(),
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword
      })
      // Auto-login after registration
      const result = await login(form.adminEmail.trim(), form.adminPassword)
      if (result.success) navigate('/dashboard')
      else navigate('/login')
    } catch(e) {
      setError(e.message || 'Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  if (!validToken) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-lg p-9 w-full max-w-sm text-center shadow-sm">
        <div className="text-4xl mb-4">🔒</div>
        <div className="text-lg font-bold text-black mb-2">Invalid Invite Link</div>
        <div className="text-sm text-slate-500">This link is invalid or has expired. Please contact your platform administrator.</div>
        <button onClick={() => navigate('/login')} className="mt-6 text-sm text-blue-600 underline">Go to login</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-lg p-9 w-full max-w-md shadow-sm">
        <div className="text-2xl font-bold text-black mb-1">GatherHQ</div>
        <div className="text-sm text-slate-500 mb-1">Register your branch</div>
        <div className="text-xs text-blue-600 font-medium mb-7">The Elevation Church</div>

        <form onSubmit={handleSubmit}>
          <div className="mb-5 pb-5 border-b border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Branch Details</div>
            <div className="mb-3.5">
              <label className="block text-sm font-medium text-black mb-1.5">
                Branch / City <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.branch} onChange={e => set('branch', e.target.value)}
                placeholder="e.g. Abeokuta, Ijebu-Ode, Ikoyi"
                className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                autoFocus />
              <div className="text-xs text-slate-400 mt-1">This will appear as "The Elevation Church — Abeokuta"</div>
            </div>
          </div>

          <div className="mb-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Admin Account</div>
            <div className="mb-3.5">
              <label className="block text-sm font-medium text-black mb-1.5">Your Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.adminName} onChange={e => set('adminName', e.target.value)}
                placeholder="e.g. Biodun Adewale"
                className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="mb-3.5">
              <label className="block text-sm font-medium text-black mb-1.5">Email Address <span className="text-red-500">*</span></label>
              <input type="email" value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)}
                placeholder="you@email.com"
                className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="mb-3.5">
              <label className="block text-sm font-medium text-black mb-1.5">Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.adminPassword} onChange={e => set('adminPassword', e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 pr-16" />
                <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700">
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="mb-3.5">
              <label className="block text-sm font-medium text-black mb-1.5">Confirm Password <span className="text-red-500">*</span></label>
              <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                placeholder="Repeat your password"
                className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm mb-4 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <><Spinner />Setting up your branch...</> : 'Create Branch & Sign In'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button onClick={() => navigate('/login')} className="text-sm text-slate-400 hover:text-slate-700">
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
