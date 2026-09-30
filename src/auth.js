const PASSCODE = 'TEC2024'
const AUTH_KEY = 'ghq_auth'
const ATTEMPTS_KEY = 'ghq_attempts'
const LOCKOUT_KEY = 'ghq_lockout'
const MAX_ATTEMPTS = 4
const LOCKOUT_MS = 15 * 60 * 1000

export function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === 'true'
}

export function login(passcode) {
  const lockUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0')
  if (Date.now() < lockUntil) {
    return { success: false, locked: true, remaining: lockUntil - Date.now() }
  }
  const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0')
  if (passcode === PASSCODE) {
    localStorage.setItem(AUTH_KEY, 'true')
    localStorage.removeItem(ATTEMPTS_KEY)
    localStorage.removeItem(LOCKOUT_KEY)
    return { success: true }
  }
  const newAttempts = attempts + 1
  localStorage.setItem(ATTEMPTS_KEY, newAttempts)
  if (newAttempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_MS
    localStorage.setItem(LOCKOUT_KEY, lockUntil)
    localStorage.setItem(ATTEMPTS_KEY, '0')
    return { success: false, locked: true, remaining: LOCKOUT_MS }
  }
  return { success: false, locked: false, attemptsLeft: MAX_ATTEMPTS - newAttempts }
}

export function logout() {
  localStorage.removeItem(AUTH_KEY)
}

export function getLockoutRemaining() {
  const lockUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0')
  const remaining = lockUntil - Date.now()
  return remaining > 0 ? remaining : 0
}
