/**
 * Scoped Firestore helpers — all queries go through the church's subcollection.
 * Import these instead of using `collection(db, 'sessions')` directly.
 */
import { db } from './firebase'
import { collection, doc } from 'firebase/firestore'
import { currentChurchId } from './auth'

export function churchCol(path) {
  const churchId = currentChurchId()
  if (!churchId) throw new Error('No church in session')
  return collection(db, 'churches', churchId, path)
}

export function churchDoc(path, id) {
  const churchId = currentChurchId()
  if (!churchId) throw new Error('No church in session')
  return doc(db, 'churches', churchId, path, id)
}

export function subCol(path, parentId, subPath) {
  const churchId = currentChurchId()
  if (!churchId) throw new Error('No church in session')
  return collection(db, 'churches', churchId, path, parentId, subPath)
}

export function subDoc(path, parentId, subPath, subId) {
  const churchId = currentChurchId()
  if (!churchId) throw new Error('No church in session')
  return doc(db, 'churches', churchId, path, parentId, subPath, subId)
}
