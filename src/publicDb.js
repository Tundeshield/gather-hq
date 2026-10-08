/**
 * Public-facing DB helpers — for forms/checkin pages where no user is logged in.
 * These do a collection group query to find the session/event across all churches.
 */
import { db } from './firebase'
import { collection, collectionGroup, doc, query, where, getDocs, getDoc } from 'firebase/firestore'

export async function findSessionById(sessionId) {
  const results = await getDocs(collectionGroup(db, 'sessions'))
  const match = results.docs.find(d => d.id === sessionId)
  if (!match) return null
  const churchId = match.ref.parent.parent.id
  return { id: match.id, churchId, ...match.data() }
}

export async function findEventById(eventId) {
  const results = await getDocs(collectionGroup(db, 'events'))
  const match = results.docs.find(d => d.id === eventId)
  if (!match) return null
  const churchId = match.ref.parent.parent.id
  return { id: match.id, churchId, ...match.data() }
}

export function sessionRef(churchId, sessionId) {
  return doc(db, 'churches', churchId, 'sessions', sessionId)
}

export function eventRef(churchId, eventId) {
  return doc(db, 'churches', churchId, 'events', eventId)
}

export function submissionsCol(churchId, sessionId) {
  return collection(db, 'churches', churchId, 'sessions', sessionId, 'submissions')
}

export function registrationsCol(churchId, eventId) {
  return collection(db, 'churches', churchId, 'events', eventId, 'registrations')
}

export function membersCol(churchId) {
  return collection(db, 'churches', churchId, 'members')
}

export function memberDocRef(churchId, memberId) {
  return doc(db, 'churches', churchId, 'members', memberId)
}
