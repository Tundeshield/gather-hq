import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { migrateToChurch, currentChurchId, isPlatformAdmin } from '../auth'
import { Spinner } from '../components/UI'

export default function Migrate() {
  const navigate = useNavigate()
  const isAdmin = isPlatformAdmin()
  const churchId = currentChurchId()

  const [churches, setChurches] = useState([])
  const [selectedChurchId, setSelectedChurchId] = useState(churchId || '')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-lg p-8 w-full max-w-md shadow-sm">
        <div className="text-xl font-bold text-black mb-1">Data Migration</div>
        <div className="text-sm text-slate-500 mb-6">
          This will move your existing sessions, events, members and team into the new multi-branch structure. Run this once only.
        </div>

        {!results ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-700">
              ⚠️ This migrates flat (legacy) data into a church branch. Run once only — existing church-scoped data is not touched.
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
                    <option key={c.id} value={c.id}>
                      {c.name}{c.branch ? ` — ${c.branch}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
            <button onClick={runMigration} disabled={running || !selectedChurchId}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {running ? <><Spinner />Migrating data...</> : 'Run Migration'}
            </button>

            {isAdmin && (
              <button onClick={() => navigate('/platform')}
                className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 transition-colors">
                ← Back to Platform
              </button>
            )}
          </>
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="text-sm font-semibold text-green-700 mb-3">✅ Migration Complete</div>
              {Object.entries(results).map(([col, count]) => (
                <div key={col} className="flex justify-between text-sm text-green-600 mb-1">
                  <span className="capitalize">{col}</span>
                  <span className="font-medium">{count} migrated</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate(isAdmin ? '/platform' : '/dashboard')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors">
              {isAdmin ? '← Back to Platform' : 'Go to Dashboard →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
