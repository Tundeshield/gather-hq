import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isLoggedIn, getLockoutRemaining } from '../auth'
import { Btn, Spinner } from '../components/UI'

export default function Login() {
  const navigate = useNavigate()
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lockRemaining, setLockRemaining] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (isLoggedIn()) navigate('/dashboard')
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

  function doShake() {
    setShake(true)
    setTimeout(() => setShake(false), 400)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (lockRemaining > 0) return
    setLoading(true)
    setTimeout(() => {
      const result = login(passcode)
      setLoading(false)
      setPasscode('')
      if (result.success) {
        navigate('/dashboard')
      } else if (result.locked) {
        startLockCountdown(result.remaining)
        doShake()
      } else {
        doShake()
        setError(result.attemptsLeft === 3 ? 'Incorrect passcode.' : `Incorrect — ${result.attemptsLeft} attempt${result.attemptsLeft > 1 ? 's' : ''} remaining.`)
      }
    }, 200)
  }

  const lockMins = Math.floor(lockRemaining / 60000)
  const lockSecs = Math.floor((lockRemaining % 60000) / 1000)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className={`bg-white border border-slate-200 rounded-lg p-9 w-full max-w-sm shadow-sm transition-transform ${shake ? 'animate-shake' : ''}`}>
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
            <div className="text-sm text-slate-500 mb-7">The Elevation Church — Attendance Portal</div>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-black mb-1.5">Passcode</label>
                <input
                  type="password"
                  value={passcode}
                  onChange={e => { setPasscode(e.target.value); setError('') }}
                  placeholder="Enter admin passcode"
                  className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                />
                {error && <div className="text-red-500 text-xs mt-1.5">{error}</div>}
              </div>
              <button type="submit" disabled={loading || !passcode}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <><Spinner />Signing in...</> : 'Sign In'}
              </button>
            </form>
          </>
        )}
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}.animate-shake{animation:shake .4s}`}</style>
    </div>
  )
}
