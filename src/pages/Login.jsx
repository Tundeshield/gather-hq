import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isLoggedIn, getLockoutRemaining, bootstrapPlatformAdmin, isPlatformAdmin } from '../auth'
import { Spinner } from '../components/UI'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [lockRemaining, setLockRemaining] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (isLoggedIn()) {
      navigate(isPlatformAdmin() ? '/platform' : '/dashboard')
      return
    }
    bootstrapPlatformAdmin().finally(() => setBootstrapping(false))
    const rem = getLockoutRemaining()
    if (rem > 0) startLockCountdown(rem)
    return () => clearInterval(timerRef.current)
  }, [])

  function startLockCountdown(ms) {
    setLockRemaining(ms)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setLockRemaining(prev => {
        if (prev <= 1000) { clearInterval(timerRef.current); return 0 }
        return prev - 1000
      })
    }, 1000)
  }

  function doShake() { setShake(true); setTimeout(() => setShake(false), 400) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (lockRemaining > 0 || loading) return
    setLoading(true); setError('')
    const result = await login(email, password)
    setLoading(false)

    if (result.success) {
      if (result.user.role === 'platform_admin') navigate('/platform')
      else if (result.user.role === 'usher') navigate('/checkin-select')
      else navigate('/dashboard')
    } else if (result.locked) {
      startLockCountdown(result.remaining)
      doShake(); setPassword('')
    } else if (result.error) {
      setError(result.error); doShake(); setPassword('')
    } else {
      const r = result.attemptsLeft
      setError(r !== undefined
        ? (r === 3 ? 'Incorrect email or password.' : `Incorrect — ${r} attempt${r > 1 ? 's' : ''} remaining.`)
        : 'Incorrect email or password.')
      doShake(); setPassword('')
    }
  }

  const lockMins = Math.floor(lockRemaining / 60000)
  const lockSecs = Math.floor((lockRemaining % 60000) / 1000)

  if (bootstrapping) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spinner dark /></div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className={`bg-white border border-slate-200 rounded-lg p-9 w-full max-w-sm shadow-sm ${shake ? 'animate-shake' : ''}`}>
        {lockRemaining > 0 ? (
          <div className="text-center">
            <div className="text-5xl mb-4">🔒</div>
            <div className="text-lg font-bold text-black mb-1">Access Locked</div>
            <div className="text-sm text-slate-500 mb-4">Too many incorrect attempts.</div>
            <div className="text-4xl font-bold font-mono text-black mb-2">
              {String(lockMins).padStart(2,'0')}:{String(lockSecs).padStart(2,'0')}
            </div>
            <div className="text-xs text-slate-400">Try again when timer reaches 0</div>
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold text-black mb-1">GatherHQ</div>
            <div className="text-sm text-slate-500 mb-7">Sign in to your branch</div>
            <form onSubmit={handleSubmit}>
              <div className="mb-3.5">
                <label className="block text-sm font-medium text-black mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder="your@email.com" autoFocus required
                  className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-black mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="Enter your password" required
                  className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                {error && <div className="text-red-500 text-xs mt-1.5">{error}</div>}
              </div>
              <button type="submit" disabled={loading || !email || !password}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <><Spinner />Signing in...</> : 'Sign In'}
              </button>
            </form>
            <div className="mt-5 p-3 bg-slate-50 rounded-lg text-xs text-slate-400 text-center">
              Each branch has its own login. Use the credentials your admin set up for you.
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}.animate-shake{animation:shake .4s}`}</style>
    </div>
  )
}
