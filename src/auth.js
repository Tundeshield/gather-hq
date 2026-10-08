import { db } from './firebase'
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, serverTimestamp, writeBatch
} from 'firebase/firestore'

// ── CONSTANTS ──────────────────────────────────────────────────
const SESSION_KEY = 'ghq_session'
const ATTEMPTS_KEY = 'ghq_attempts'
const LOCKOUT_KEY = 'ghq_lockout'
const MAX_ATTEMPTS = 4
const LOCKOUT_MS = 15 * 60 * 1000

export const PLATFORM_ADMIN_EMAIL = 'admin@tec.church'
export const INVITE_TOKEN = 'VxkiqXgOOVKr-oX-J-yBO0OsnmTC0Pez'

// ── SESSION ────────────────────────────────────────────────────
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
  catch { return null }
}
export function setSession(user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)) }
export function clearSession() { localStorage.removeItem(SESSION_KEY) }
export function isLoggedIn() { return !!getSession() }
export function currentUser() { return getSession() }
export function isPlatformAdmin() { return getSession()?.role === 'platform_admin' }
export function isSuperAdmin() { const r = getSession()?.role; return r === 'super_admin' || r === 'platform_admin' }
export function hasRole(...roles) { const r = getSession()?.role; return roles.includes(r) }
export function currentChurchId() { return getSession()?.churchId || null }
export function currentChurchName() {
  const s = getSession()
  if (!s) return 'The Elevation Church'
  if (s.role === 'platform_admin') return 'GatherHQ Platform'
  return s.churchName + (s.churchBranch ? ` — ${s.churchBranch}` : '')
}

// ── LOCKOUT ────────────────────────────────────────────────────
export function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0')
  return Math.max(0, until - Date.now())
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

// ── LOGIN ──────────────────────────────────────────────────────
export async function login(email, password) {
  const lockUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0')
  if (Date.now() < lockUntil) {
    return { success: false, locked: true, remaining: lockUntil - Date.now() }
  }

  const normalizedEmail = email.toLowerCase().trim()

  try {
    // Check if platform admin
    if (normalizedEmail === PLATFORM_ADMIN_EMAIL.toLowerCase()) {
      const snap = await getDocs(query(
        collection(db, 'platform_admins'),
        where('email', '==', normalizedEmail)
      ))
      if (!snap.empty && snap.docs[0].data().password === password) {
        localStorage.removeItem(ATTEMPTS_KEY)
        localStorage.removeItem(LOCKOUT_KEY)
        const session = {
          id: snap.docs[0].id,
          name: snap.docs[0].data().name || 'Platform Admin',
          email: normalizedEmail,
          role: 'platform_admin',
          churchId: null,
          churchName: 'GatherHQ',
          churchBranch: null
        }
        setSession(session)
        await updateDoc(doc(db, 'platform_admins', snap.docs[0].id), { lastLoginAt: serverTimestamp() })
        return { success: true, user: session }
      }
      return trackFailedAttempt()
    }

    // Regular church team member — search across all churches
    const snap = await getDocs(query(
      collection(db, 'team_index'),
      where('email', '==', normalizedEmail),
      where('active', '==', true)
    ))

    if (snap.empty) return trackFailedAttempt()

    const teamIndex = snap.docs[0].data()
    if (teamIndex.password !== password) return trackFailedAttempt()

    // Load church details
    const churchSnap = await getDoc(doc(db, 'churches', teamIndex.churchId))
    if (!churchSnap.exists()) return { success: false, error: 'Church not found.' }
    const church = churchSnap.data()

    localStorage.removeItem(ATTEMPTS_KEY)
    localStorage.removeItem(LOCKOUT_KEY)

    const session = {
      id: snap.docs[0].id,
      name: teamIndex.name,
      email: normalizedEmail,
      role: teamIndex.role,
      churchId: teamIndex.churchId,
      churchName: church.name || 'The Elevation Church',
      churchBranch: church.branch || ''
    }
    setSession(session)
    await updateDoc(doc(db, 'team_index', snap.docs[0].id), { lastLoginAt: serverTimestamp() })
    return { success: true, user: session }

  } catch(e) {
    console.error('Login error:', e)
    return { success: false, error: 'Login failed. Please try again.' }
  }
}

export function logout() { clearSession() }

// ── CHURCH REGISTRATION ────────────────────────────────────────
export async function registerChurch({ churchName, branch, adminName, adminEmail, adminPassword }) {
  const email = adminEmail.toLowerCase().trim()

  // Check email not already used
  const existing = await getDocs(query(collection(db, 'team_index'), where('email', '==', email)))
  if (!existing.empty) throw new Error('An account with this email already exists.')

  const batch = writeBatch(db)

  // Create church document
  const churchRef = doc(collection(db, 'churches'))
  batch.set(churchRef, {
    name: churchName || 'The Elevation Church',
    branch: branch.trim(),
    createdAt: serverTimestamp(),
    active: true
  })

  // Create super admin in church's team subcollection
  const teamRef = doc(collection(db, 'churches', churchRef.id, 'team'))
  batch.set(teamRef, {
    name: adminName.trim(),
    email,
    password: adminPassword,
    role: 'super_admin',
    active: true,
    churchId: churchRef.id,
    createdAt: serverTimestamp()
  })

  // Create index entry for fast login lookup
  const indexRef = doc(collection(db, 'team_index'))
  batch.set(indexRef, {
    name: adminName.trim(),
    email,
    password: adminPassword,
    role: 'super_admin',
    active: true,
    churchId: churchRef.id,
    createdAt: serverTimestamp()
  })

  await batch.commit()
  return churchRef.id
}

// ── TEAM MANAGEMENT ────────────────────────────────────────────
export const ROLES = [
  { value: 'super_admin', label: 'Super Admin', description: 'Full access — can manage team, members and all data' },
  { value: 'admin', label: 'Admin', description: 'Can create sessions, events and view all submissions' },
  { value: 'attendance_lead', label: 'Attendance Lead', description: 'Can manage attendance sessions and export data' },
  { value: 'usher', label: 'Usher', description: 'Can open check-in screens only' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to submissions and reports' },
]

export async function getTeamMembers(churchId) {
  const snap = await getDocs(query(
    collection(db, 'churches', churchId, 'team'),
    where('active', '==', true)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addTeamMember(churchId, { name, email, password, role }) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await getDocs(query(collection(db, 'team_index'), where('email', '==', normalizedEmail)))
  if (!existing.empty) throw new Error('A team member with this email already exists.')

  const batch = writeBatch(db)
  const teamRef = doc(collection(db, 'churches', churchId, 'team'))
  batch.set(teamRef, { name: name.trim(), email: normalizedEmail, password, role, active: true, churchId, createdAt: serverTimestamp() })
  const indexRef = doc(collection(db, 'team_index'))
  batch.set(indexRef, { name: name.trim(), email: normalizedEmail, password, role, active: true, churchId, createdAt: serverTimestamp() })
  await batch.commit()
}

export async function updateTeamMember(churchId, memberId, data) {
  await updateDoc(doc(db, 'churches', churchId, 'team', memberId), data)
  // Update index too if email/password/role changed
  if (data.email || data.password || data.role || data.name) {
    const indexSnap = await getDocs(query(collection(db, 'team_index'), where('churchId', '==', churchId)))
    const member = indexSnap.docs.find(d => d.data().email === (data.email || '').toLowerCase() || d.id)
    // Find by churchId + original data
    const allIndex = await getDocs(query(collection(db, 'team_index'), where('churchId', '==', churchId)))
    const matchingDoc = allIndex.docs.find(d => {
      const d2 = d.data()
      return d2.name === data.originalName || d2.email === data.originalEmail
    })
    if (matchingDoc) await updateDoc(matchingDoc.ref, { ...data, updatedAt: serverTimestamp() })
  }
}

export async function deactivateTeamMember(churchId, memberId, email) {
  await updateDoc(doc(db, 'churches', churchId, 'team', memberId), { active: false })
  // Deactivate in index
  const indexSnap = await getDocs(query(collection(db, 'team_index'), where('email', '==', email.toLowerCase())))
  if (!indexSnap.empty) await updateDoc(indexSnap.docs[0].ref, { active: false })
}

// ── PLATFORM ADMIN BOOTSTRAP ───────────────────────────────────
export async function bootstrapPlatformAdmin() {
  const snap = await getDocs(query(
    collection(db, 'platform_admins'),
    where('email', '==', PLATFORM_ADMIN_EMAIL.toLowerCase())
  ))
  if (!snap.empty) return { exists: true }
  await addDoc(collection(db, 'platform_admins'), {
    name: 'Platform Admin',
    email: PLATFORM_ADMIN_EMAIL.toLowerCase(),
    password: 'TEC2024',
    createdAt: serverTimestamp()
  })
  return { created: true }
}

// ── MIGRATION: flat → church-scoped ───────────────────────────
export async function migrateToChurch(churchId) {
  const collections = ['sessions', 'events', 'members', 'team']
  const results = {}

  for (const col of collections) {
    try {
      const snap = await getDocs(collection(db, col))
      if (snap.empty) { results[col] = 0; continue }

      let migrated = 0
      for (const d of snap.docs) {
        const data = d.data()
        // Skip if already has churchId
        if (data.churchId) continue

        if (col === 'sessions') {
          // Migrate subcollection submissions too
          const subSnap = await getDocs(collection(db, 'sessions', d.id, 'submissions'))
          const newSessionRef = doc(collection(db, 'churches', churchId, 'sessions'))
          const batch = writeBatch(db)
          batch.set(newSessionRef, { ...data, churchId, migratedAt: serverTimestamp() })
          subSnap.docs.forEach(sub => {
            const subRef = doc(collection(db, 'churches', churchId, 'sessions', newSessionRef.id, 'submissions'))
            batch.set(subRef, sub.data())
          })
          await batch.commit()
        } else if (col === 'events') {
          const subSnap = await getDocs(collection(db, 'events', d.id, 'registrations'))
          const newRef = doc(collection(db, 'churches', churchId, 'events'))
          const batch = writeBatch(db)
          batch.set(newRef, { ...data, churchId, migratedAt: serverTimestamp() })
          subSnap.docs.forEach(sub => {
            const subRef = doc(collection(db, 'churches', churchId, 'events', newRef.id, 'registrations'))
            batch.set(subRef, sub.data())
          })
          await batch.commit()
        } else if (col === 'members') {
          await addDoc(collection(db, 'churches', churchId, 'members'), { ...data, churchId, migratedAt: serverTimestamp() })
        } else if (col === 'team') {
          // Create in church team + index
          const email = data.email?.toLowerCase()
          if (!email) continue
          const existing = await getDocs(query(collection(db, 'team_index'), where('email', '==', email)))
          if (existing.empty) {
            const batch = writeBatch(db)
            const teamRef = doc(collection(db, 'churches', churchId, 'team'))
            batch.set(teamRef, { ...data, churchId, migratedAt: serverTimestamp() })
            const indexRef = doc(collection(db, 'team_index'))
            batch.set(indexRef, { name: data.name, email, password: data.password, role: data.role, active: data.active ?? true, churchId, createdAt: data.createdAt || serverTimestamp() })
            await batch.commit()
          }
        }
        migrated++
      }
      results[col] = migrated
    } catch(e) { results[col] = `error: ${e.message}` }
  }
  return results
}
