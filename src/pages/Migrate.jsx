import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { migrateToChurch, currentChurchId } from '../auth'
import { Spinner } from '../components/UI'

export default function Migrate() {
  const navigate = useNavigate()
  const churchId = currentChurchId()
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  async function runMigration() {
    if (!churchId) { setError('No church found in session. Please log in again.'); return }
    setRunning(true)
    try {
      const res = await migrateToChurch(churchId)
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
              ⚠️ Make sure you are logged in as the TEC Abeokuta admin before running this. Your data will be linked to your church branch.
            </div>
            {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
            <button onClick={runMigration} disabled={running}
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
                  <span className="font-medium">{count} migrated</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/dashboard')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors">
              Go to Dashboard →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
