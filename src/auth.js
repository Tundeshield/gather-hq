import { db } from './firebase'
import {
  collection, doc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp
} from 'firebase/firestore'

const SESSION_KEY = 'ghq_session'

// ── SESSION ────────────────────────────────────────────────────
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
  catch { return null }
}

export function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function isLoggedIn() {
  return !!getSession()
}

export function currentUser() {
  return getSession()
}

export function hasRole(...roles) {
  const session = getSession()
  if (!session) return false
  return roles.includes(session.role)
}

export function isSuperAdmin() {
  return hasRole('super_admin')
}

// ── LOGIN ──────────────────────────────────────────────────────
const LOCKOUT_KEY = 'ghq_lockout'
const ATTEMPTS_KEY = 'ghq_attempts'
const MAX_ATTEMPTS = 4
const LOCKOUT_MS = 15 * 60 * 1000

export function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0')
  return Math.max(0, until - Date.now())
}

export async function login(email, password) {
  // Check lockout
  const lockUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0')
  if (Date.now() < lockUntil) {
    return { success: false, locked: true, remaining: lockUntil - Date.now() }
  }

  try {
    const snap = await getDocs(query(
      collection(db, 'team'),
      where('email', '==', email.toLowerCase().trim()),
      where('active', '==', true)
    ))

    if (snap.empty) {
      return trackFailedAttempt()
    }

    const user = { id: snap.docs[0].id, ...snap.docs[0].data() }

    // Simple password check (plain text — upgrade to hashed in production)
    if (user.password !== password) {
      return trackFailedAttempt()
    }

    // Success
    localStorage.removeItem(ATTEMPTS_KEY)
    localStorage.removeItem(LOCKOUT_KEY)

    const session = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
    setSession(session)

    // Update last login
    await updateDoc(doc(db, 'team', user.id), {
      lastLoginAt: serverTimestamp()
    })

    return { success: true, user: session }
  } catch(e) {
    console.error('Login error:', e)
    return { success: false, error: 'Login failed. Please try again.' }
  }
}

function trackFailedAttempt() {
  const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0') + 1
  localStorage.setItem(ATTEMPTS_KEY, attempts)
  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_MS
    localStorage.setItem(LOCKOUT_KEY, lockUntil)
    localStorage.setItem(ATTEMPTS_KEY, '0')
    return { success: false, locked: true, remaining: LOCKOUT_MS }
  }
  return { success: false, locked: false, attemptsLeft: MAX_ATTEMPTS - attempts }
}

export function logout() {
  clearSession()
}

// ── TEAM MANAGEMENT ────────────────────────────────────────────
export const ROLES = [
  { value: 'super_admin', label: 'Super Admin', description: 'Full access — can manage team, members and all data' },
  { value: 'admin', label: 'Admin', description: 'Can create sessions, events and view all submissions' },
  { value: 'attendance_lead', label: 'Attendance Lead', description: 'Can manage attendance sessions and export data' },
  { value: 'usher', label: 'Usher', description: 'Can open check-in screens only' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to submissions and reports' },
]

export const ROLE_PERMISSIONS = {
  super_admin: ['all'],
  admin: ['dashboard', 'attendance', 'events', 'people', 'checkin'],
  attendance_lead: ['dashboard', 'attendance', 'events', 'checkin'],
  usher: ['checkin'],
  viewer: ['dashboard', 'attendance_view', 'events_view'],
}

export function canAccess(permission) {
  const session = getSession()
  if (!session) return false
  const perms = ROLE_PERMISSIONS[session.role] || []
  return perms.includes('all') || perms.includes(permission)
}

export async function getTeamMembers() {
  const snap = await getDocs(query(collection(db, 'team'), where('active', '==', true)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addTeamMember({ name, email, password, role }) {
  // Check email not already used
  const existing = await getDocs(query(collection(db, 'team'), where('email', '==', email.toLowerCase().trim())))
  if (!existing.empty) throw new Error('A team member with this email already exists.')

  return addDoc(collection(db, 'team'), {
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password, // Plain text for now — hash in production
    role,
    active: true,
    createdAt: serverTimestamp(),
  })
}

export async function updateTeamMember(id, data) {
  return updateDoc(doc(db, 'team', id), data)
}

export async function deactivateTeamMember(id) {
  return updateDoc(doc(db, 'team', id), { active: false })
}

// ── BOOTSTRAP SUPER ADMIN ─────────────────────────────────────
// Run once to create the first super admin if none exists
export async function bootstrapSuperAdmin() {
  const snap = await getDocs(query(collection(db, 'team'), where('role', '==', 'super_admin')))
  if (!snap.empty) return { exists: true }

  await addDoc(collection(db, 'team'), {
    name: 'Admin',
    email: 'admin@tec.church',
    password: 'TEC2024',
    role: 'super_admin',
    active: true,
    createdAt: serverTimestamp(),
  })
  return { created: true }
}
