'use client'
import Navbar from '@/components/layout/Navbar'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session } from '@/types'

export default function ApprenticeshipPage() {
  const router  = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [logs, setLogs]       = useState<any[]>([])
  const [totalHours, setTotalHours]  = useState(0)
  const [targetHours, setTargetHours] = useState(8000)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)

  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [hours, setHours]   = useState('')
  const [desc, setDesc]     = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [error, setError]   = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    loadData(s.id)
  }, [])

  async function loadData(proId: string) {
    setLoading(true)
    const r = await fetch(`/api/apprenticeship?pro_id=${proId}`)
    const d = await r.json()
    setLogs(d.logs || [])
    setTotalHours(d.total_hours || 0)
    setTargetHours(d.target_hours || 8000)
    setLoading(false)
  }

  async function addLog() {
    if (!hours || parseFloat(hours) <= 0 || !session) { setError('Please enter valid hours'); return }
    setAdding(true); setError('')
    const r = await fetch('/api/apprenticeship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, date, hours: parseFloat(hours), description: desc.trim() || null, supervisor: supervisor.trim() || null }),
    })
    setAdding(false)
    if (r.ok) {
      setHours(''); setDesc(''); setSupervisor('')
      loadData(session.id)
    } else {
      const d = await r.json()
      setError(d.error || 'Could not add log')
    }
  }

  async function deleteLog(id: string) {
    if (!session || !confirm('Delete this entry?')) return
    await fetch('/api/apprenticeship', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, id }),
    })
    loadData(session.id)
  }

  const pct     = Math.min(Math.round((totalHours / targetHours) * 100), 100)
  const remaining = Math.max(targetHours - totalHours, 0)

  const inp = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors'

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-gray-900 mb-1">Apprenticeship tracker</h1>
          <p className="text-gray-400 text-sm">Log your hours toward licensure. Your progress shows on your profile.</p>
        </div>

        {/* Progress card */}
        <div className="bg-white border border-gray-100 rounded-2xl p-7 mb-6">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="font-serif text-4xl text-teal-600 font-bold">{totalHours.toLocaleString()}</div>
              <div className="text-sm text-gray-400">hours logged</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-gray-900">{targetHours.toLocaleString()} hrs goal</div>
              <div className="text-sm text-gray-400">{remaining.toLocaleString()} remaining</div>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4 mb-2">
            <div className="bg-teal-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
              style={{ width: `${Math.max(pct, 2)}%` }}>
              {pct >= 15 && <span className="text-white text-xs font-bold">{pct}%</span>}
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>0</span>
            <span>{pct < 15 && `${pct}%`}</span>
            <span>{targetHours.toLocaleString()} hrs</span>
          </div>
          {pct >= 100 && (
            <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-xl text-center">
              <div className="text-teal-700 font-semibold text-sm">🎉 Goal reached! You've completed your apprenticeship hours.</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Log entry form */}
          <div className="bg-white border border-gray-100 rounded-2xl p-7">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Log hours</div>
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{error}</div>}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Hours worked *</label>
              <input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 8" min="0.5" max="24" step="0.5" className={inp} />
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Work description <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Electrical panel installation" className={inp} />
            </div>
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Supervisor <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input value={supervisor} onChange={e => setSupervisor(e.target.value)} placeholder="Supervisor name" className={inp} />
            </div>
            <button onClick={addLog} disabled={adding}
              className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {adding ? 'Adding...' : '+ Log hours'}
            </button>
          </div>

          {/* Recent logs */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-7 py-4 border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recent logs</div>
            </div>
            {loading ? (
              <div className="p-6 text-gray-400 text-sm text-center">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <div className="text-3xl mb-2 opacity-20">📋</div>
                <div className="text-sm">No hours logged yet. Add your first entry.</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {logs.map(log => (
                  <div key={log.id} className="px-6 py-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-teal-600">{log.hours}h</span>
                        <span className="text-sm text-gray-400">{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      {log.description && <div className="text-xs text-gray-600 mt-0.5">{log.description}</div>}
                      {log.supervisor && <div className="text-sm text-gray-400">Supervisor: {log.supervisor}</div>}
                    </div>
                    <button onClick={() => deleteLog(log.id)} className="text-gray-300 hover:text-red-500 text-sm transition-colors flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
