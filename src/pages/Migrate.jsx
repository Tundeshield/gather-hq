import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import {
  collection, getDocs, query, orderBy, deleteDoc, doc, writeBatch
} from 'firebase/firestore'
import { migrateToChurch, currentChurchId, isPlatformAdmin } from '../auth'
import { Spinner } from '../components/UI'

export default function Migrate() {
  const navigate = useNavigate()
  const isAdmin = isPlatformAdmin()
  const churchId = currentChurchId()

  const [churches, setChurches] = useState([])
  const [selectedChurchId, setSelectedChurchId] = useState(churchId || '')

  // migrate
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  // clear
  const [clearTarget, setClearTarget] = useState('')
  const [clearing, setClearing] = useState(false)
  const [clearResults, setClearResults] = useState(null)
  const [clearError, setClearError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      getDocs(query(collection(db, 'churches'), orderBy('createdAt', 'desc')))
        .then(snap => setChurches(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(console.error)
    }
  }, [isAdmin])

  async function runMigration() {
    if (!selectedChurchId) { setError('Please select a church to migrate data into.'); return }
    setRunning(true)
    setError('')
    try {
      const res = await migrateToChurch(selectedChurchId)
      setResults(res)
    } catch(e) { setError(e.message) }
    finally { setRunning(false) }
  }

  async function clearMigratedData() {
    if (!clearTarget) { setClearError('Please select a church.'); return }
    setClearing(true)
    setClearError('')
    const counts = { members: 0, sessions: 0, events: 0 }
    try {
      const COLS = ['members', 'sessions', 'events']
      for (const col of COLS) {
        const snap = await getDocs(collection(db, 'churches', clearTarget, col))
        // Only delete docs that were migrated (have migratedAt field)
        const toDelete = snap.docs.filter(d => d.data().migratedAt)
        // Delete in batches of 450
        let batch = writeBatch(db)
        let batchCount = 0
        for (const d of toDelete) {
          // For sessions and events, delete subcollections first
          if (col === 'sessions') {
            const subSnap = await getDocs(collection(db, 'churches', clearTarget, 'sessions', d.id, 'submissions'))
            for (const sub of subSnap.docs) {
              batch.delete(sub.ref)
              batchCount++
              if (batchCount >= 450) { await batch.commit(); batch = writeBatch(db); batchCount = 0 }
            }
          }
          if (col === 'events') {
            const subSnap = await getDocs(collection(db, 'churches', clearTarget, 'events', d.id, 'registrations'))
            for (const sub of subSnap.docs) {
              batch.delete(sub.ref)
              batchCount++
              if (batchCount >= 450) { await batch.commit(); batch = writeBatch(db); batchCount = 0 }
            }
          }
          batch.delete(d.ref)
          batchCount++
          if (batchCount >= 450) { await batch.commit(); batch = writeBatch(db); batchCount = 0 }
          counts[col]++
        }
        if (batchCount > 0) await batch.commit()
      }
      setClearResults(counts)
      setConfirmClear(false)
    } catch(e) { setClearError(e.message) }
    finally { setClearing(false) }
  }

  const churchLabel = (c) => `${c.name}${c.branch ? ` — ${c.branch}` : ''}`

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* ── MIGRATE ── */}
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm">
          <div className="text-xl font-bold text-black mb-1">Data Migration</div>
          <div className="text-sm text-slate-500 mb-6">
            Move legacy flat data into a church branch. Run once only per branch.
          </div>

          {!results ? (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-700">
                ⚠️ Only migrates flat (legacy) data. Existing church-scoped records are not touched.
              </div>

              {isAdmin && (
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Target Church Branch</label>
                  <select
                    value={selectedChurchId}
                    onChange={e => setSelectedChurchId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-black focus:outline-none focus:border-blue-400"
                  >
                    <option value="">— Select a church —</option>
                    {churches.map(c => (
                      <option key={c.id} value={c.id}>{churchLabel(c)}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
              <button onClick={runMigration} disabled={running || !selectedChurchId}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {running ? <><Spinner />Migrating data...</> : 'Run Migration'}
              </button>
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="text-sm font-semibold text-green-700 mb-3">✅ Migration Complete</div>
                {Object.entries(results).map(([col, count]) => (
                  <div key={col} className="flex justify-between text-sm text-green-600 mb-1">
                    <span className="capitalize">{col}</span>
                    <span className="font-medium">{typeof count === 'number' ? `${count} migrated` : count}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setResults(null)}
                className="w-full mb-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors">
                Run Another Migration
              </button>
            </>
          )}

          {isAdmin && (
            <button onClick={() => navigate('/platform')}
              className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 transition-colors">
              ← Back to Platform
            </button>
          )}
        </div>

        {/* ── CLEAR MIGRATED DATA ── */}
        {isAdmin && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm">
            <div className="text-xl font-bold text-black mb-1">Clear Migrated Data</div>
            <div className="text-sm text-slate-500 mb-6">
              Remove records that were brought in by migration from a specific branch. Only deletes docs tagged with <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">migratedAt</code> — manually added records are safe.
            </div>

            {!clearResults ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
                  ⚠️ This permanently deletes members, sessions and events that were migrated into the selected branch. This cannot be undone.
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Church Branch to Clear</label>
                  <select
                    value={clearTarget}
                    onChange={e => { setClearTarget(e.target.value); setConfirmClear(false); setClearError('') }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-black focus:outline-none focus:border-red-400"
                  >
                    <option value="">— Select a church —</option>
                    {churches.map(c => (
                      <option key={c.id} value={c.id}>{churchLabel(c)}</option>
                    ))}
                  </select>
                </div>

                {clearTarget && !confirmClear && (
                  <button onClick={() => setConfirmClear(true)}
                    className="w-full bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-md py-3 text-sm font-semibold transition-colors">
                    Clear Migrated Data from {churchLabel(churches.find(c => c.id === clearTarget) || {})}
                  </button>
                )}

                {confirmClear && (
                  <div className="border border-red-300 rounded-lg p-4 bg-red-50">
                    <p className="text-sm text-red-700 font-semibold mb-3">
                      Are you sure? This will permanently delete all migrated records from this branch.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={clearMigratedData} disabled={clearing}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-md py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                        {clearing ? <><Spinner />Clearing...</> : 'Yes, delete migrated records'}
                      </button>
                      <button onClick={() => setConfirmClear(false)} disabled={clearing}
                        className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-md py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {clearError && <div className="text-red-500 text-sm mt-3">{clearError}</div>}
              </>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-green-700 mb-3">✅ Cleared</div>
                {Object.entries(clearResults).map(([col, count]) => (
                  <div key={col} className="flex justify-between text-sm text-green-600 mb-1">
                    <span className="capitalize">{col}</span>
                    <span className="font-medium">{count} deleted</span>
                  </div>
                ))}
                <button onClick={() => { setClearResults(null); setClearTarget(''); setConfirmClear(false) }}
                  className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 underline">
                  Clear another branch
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
