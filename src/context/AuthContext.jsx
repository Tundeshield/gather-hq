import { createContext, useContext, useEffect, useState } from 'react'
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // Firebase user
  const [profile, setProfile] = useState(null) // Firestore profile with role
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getAuth()
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        // Load role from Firestore
        try {
          const snap = await getDoc(doc(db, 'team', firebaseUser.uid))
          if (snap.exists()) {
            setProfile({ uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() })
          } else {
            setProfile({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'viewer', name: firebaseUser.email })
          }
        } catch(e) {
          setProfile({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'viewer' })
        }
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export async function loginWithEmail(email, password) {
  const auth = getAuth()
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function logoutUser() {
  const auth = getAuth()
  await signOut(auth)
}

export async function changePassword(newPassword) {
  const auth = getAuth()
  if (auth.currentUser) await updatePassword(auth.currentUser, newPassword)
}

// Role helpers
export const ROLES = {
  super_admin: { label: 'Super Admin', level: 4 },
  admin: { label: 'Admin', level: 3 },
  attendance_lead: { label: 'Attendance Lead', level: 2 },
  usher: { label: 'Usher', level: 1 },
  viewer: { label: 'Viewer', level: 0 },
}

export function can(profile, action) {
  if (!profile) return false
  const level = ROLES[profile.role]?.level ?? 0
  const requirements = {
    manage_team: 4,      // super_admin only
    manage_members: 3,   // admin+
    create_sessions: 2,  // attendance_lead+
    view_submissions: 2, // attendance_lead+
    checkin: 1,          // usher+
    view_only: 0,        // everyone
  }
  return level >= (requirements[action] ?? 4)
}
