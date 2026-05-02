'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Search, Filter } from 'lucide-react'
import { Session } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'

type EstimateSummary = {
  id: string
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'paid'
  lead_name: string
  trade: string
  total: number
  created_at: string
  valid_until: string
}

const STATUS_STYLES: Record<EstimateSummary['status'], { bg: string; text: string; label: string }> = {
  draft:    { bg: 'bg-gray-100',  text: 'text-gray-600',   label: 'Draft' },
  sent:     { bg: 'bg-blue-50',   text: 'text-blue-600',   label: 'Sent' },
  viewed:   { bg: 'bg-purple-50', text: 'text-purple-600', label: 'Viewed' },
  approved: { bg: 'bg-teal-50',   text: 'text-teal-700',   label: 'Approved' },
  paid:     { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Paid' },
}

export default function EstimatesPage() {
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })

  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  const [estimates, setEstimates] = useState<EstimateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/estimates?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => setEstimates(d.estimates || []))
      .catch(() => setEstimates([]))
      .finally(() => setLoading(false))
  }, [session, router])

  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  const handleCreate = async () => {
    if (!session || creating) return
    setCreating(true)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id }),
      })
      const d = await r.json()
      if (d.estimate?.id) {
        router.push(`/dashboard/estimates/${d.estimate.id}`)
      }
    } catch {
      setCreating(false)
    }
  }

  if (!session) return null

  const card    = dk ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E8E2D9]'
  const textMain = dk ? 'text-white' : 'text-gray-900'
  const muted   = dk ? 'text-slate-400' : 'text-[#6B7280]'
  const pageBg  = dk ? 'bg-[#0A1628]' : 'bg-[#F5F4F0]'

  const filtered = estimates.filter(e =>
    e.lead_name.toLowerCase().includes(search.toLowerCase()) ||
    e.estimate_number.toLowerCase().includes(search.toLowerCase())
  )

  // Stats
  const totalValue    = estimates.reduce((s, e) => s + e.total, 0)
  const approvedCount = estimates.filter(e => e.status === 'approved' || e.status === 'paid').length
  const sentCount     = estimates.filter(e => e.status === 'sent' || e.status === 'viewed').length

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })

  return (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={toggleDark}
    >
      <div className={`min-h-screen pb-12 ${pageBg}`}>
        <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${textMain}`}>Estimates</h1>
              <p className={`text-sm mt-0.5 ${muted}`}>Create and send professional estimates to your leads</p>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Plus size={16} />
              {creating ? 'Creating...' : 'New Estimate'}
            </button>
          </div>

          {/* ── Stats bar ── */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Estimates', value: estimates.length.toString() },
              { label: 'Sent / In Review', value: sentCount.toString() },
              { label: 'Pipeline Value', value: fmt(totalValue) },
            ].map(stat => (
              <div key={stat.label} className={`rounded-xl border p-4 ${card}`}>
                <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>{stat.label}</p>
                <p className={`text-2xl font-bold mt-1 ${textMain}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* ── Search ── */}
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${card}`}>
            <Search size={16} className={muted} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by client name or estimate number..."
              className={`flex-1 bg-transparent text-sm focus:outline-none ${textMain} placeholder:text-[#9CA3AF]`}
            />
          </div>

          {/* ── Estimates table ── */}
          <div className={`rounded-xl border overflow-hidden ${card}`}>
            {/* Table header */}
            <div className={`grid grid-cols-[1fr_140px_100px_120px_100px] gap-4 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wide ${muted} ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <span>Client / Estimate</span>
              <span>Trade</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span className="text-right">Date</span>
            </div>

            {loading ? (
              <div className="space-y-0">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-16 border-b animate-pulse ${dk ? 'bg-[#1E293B] border-[#334155]' : 'bg-gray-50 border-[#E8E2D9]'}`} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState dk={dk} onCreate={handleCreate} creating={creating} />
            ) : (
              <div>
                {filtered.map((est, i) => (
                  <button
                    key={est.id}
                    onClick={() => router.push(`/dashboard/estimates/${est.id}`)}
                    className={`w-full grid grid-cols-[1fr_140px_100px_120px_100px] gap-4 px-5 py-4 text-left transition-colors border-b last:border-b-0 ${
                      dk
                        ? 'border-[#334155] hover:bg-[#0F172A]'
                        : 'border-[#E8E2D9] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-semibold ${textMain}`}>{est.lead_name}</p>
                      <p className={`text-xs mt-0.5 ${muted}`}>#{est.estimate_number}</p>
                    </div>
                    <div className={`text-sm self-center truncate ${muted}`}>{est.trade}</div>
                    <div className="self-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[est.status].bg} ${STATUS_STYLES[est.status].text}`}>
                        {STATUS_STYLES[est.status].label}
                      </span>
                    </div>
                    <div className={`text-sm font-semibold self-center text-right ${textMain}`}>
                      {fmt(est.total)}
                    </div>
                    <div className={`text-xs self-center text-right ${muted}`}>
                      {new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </DashboardShell>
  )
}

function EmptyState({ dk, onCreate, creating }: { dk: boolean; onCreate: () => void; creating: boolean }) {
  const muted = dk ? 'text-slate-400' : 'text-[#6B7280]'
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${dk ? 'bg-[#0F172A]' : 'bg-teal-50'}`}>
        <FileText size={24} className="text-[#0F766E]" />
      </div>
      <p className={`font-semibold text-base ${dk ? 'text-white' : 'text-gray-900'}`}>No estimates yet</p>
      <p className={`text-sm mt-1 mb-5 ${muted}`}>Create your first estimate and send it to a client in minutes.</p>
      <button
        onClick={onCreate}
        disabled={creating}
        className="flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        <Plus size={15} />
        {creating ? 'Creating...' : 'Create First Estimate'}
      </button>
    </div>
  )
}
