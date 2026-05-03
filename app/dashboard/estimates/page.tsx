'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Search, Trash2, X, User } from 'lucide-react'
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

  const [estimates,    setEstimates]    = useState<EstimateSummary[]>([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [search,       setSearch]       = useState('')
  const [showPicker,   setShowPicker]   = useState(false)
  const [createError,  setCreateError]  = useState<string | null>(null)
  const [leads,        setLeads]        = useState<any[]>([])
  const [leadSearch,   setLeadSearch]   = useState('')
  const [loadingLeads, setLoadingLeads] = useState(false)

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
    setShowPicker(true)
    setLoadingLeads(true)
    setLeadSearch('')
    try {
      const r = await fetch(`/api/leads?pro_id=${session.id}`)
      const d = await r.json()
      setLeads(d.leads || [])
    } catch { setLeads([]) }
    finally { setLoadingLeads(false) }
  }

  const [existingEst, setExistingEst] = useState<{ id: string; estimate_number: string; total: number; lead_name: string } | null>(null)
  const [pendingLead,  setPendingLead]  = useState<any>(null)

  const createFromLead = async (lead?: any) => {
    if (!session || creating) return
    setCreating(true)
    setShowPicker(false)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          state:         session.state || '',
          lead_id:       lead?.id || null,
          lead_name:     lead?.contact_name || 'New Client',
          lead_source:   lead?.lead_source || '',
          trade:         session.trade || '',
          contact_phone: lead?.contact_phone || '',
          contact_email: lead?.contact_email || '',
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create estimate — check DB tables')
        setCreating(false)
        return
      }
      const d = await r.json()
      if (d.existed) {
        setExistingEst({ ...d.estimate, lead_name: lead?.contact_name || 'this lead' })
        setPendingLead(lead)
        setCreating(false)
      } else if (d.estimate?.id) {
        router.push(`/dashboard/estimates/${d.estimate.id}`)
      } else {
        setCreating(false)
      }
    } catch (err: any) {
      setCreateError(err.message || 'Network error')
      setCreating(false)
    }
  }

  const createFresh = async () => {
    if (!session || creating) return
    setCreating(true)
    setExistingEst(null)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          state:         session.state || '',
          lead_id:       pendingLead?.id || null,
          lead_name:     pendingLead?.contact_name || 'New Client',
          lead_source:   pendingLead?.lead_source || '',
          trade:         session.trade || '',
          contact_phone: pendingLead?.contact_phone || '',
          contact_email: pendingLead?.contact_email || '',
          force_new:     true,
        }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}`)
      else setCreating(false)
    } catch { setCreating(false) }
  }

  const deleteEstimate = async (e: React.MouseEvent, estId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this estimate? This cannot be undone.')) return
    try {
      await fetch(`/api/estimates/${estId}`, { method: 'DELETE' })
      setEstimates(prev => prev.filter(est => est.id !== estId))
    } catch { /* silent */ }
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

          {/* ── Error toast ── */}
          {createError && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 font-medium">{createError}</p>
              <button onClick={() => setCreateError(null)} className="text-red-400 hover:text-red-600 ml-4 text-lg leading-none">×</button>
            </div>
          )}

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
            <div className={`grid grid-cols-[1fr_140px_100px_120px_100px_40px] gap-4 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wide ${muted} ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
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
                    className={`w-full grid grid-cols-[1fr_140px_100px_120px_100px_40px] gap-4 px-5 py-4 text-left transition-colors border-b last:border-b-0 ${
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
                    <button
                      onClick={e => deleteEstimate(e, est.id)}
                      className="self-center p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete estimate"
                    >
                      <Trash2 size={14} />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      {/* ── Existing estimate modal ── */}
      {existingEst && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setExistingEst(null)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <h3 className={`font-bold text-base mb-1 ${dk ? 'text-white' : 'text-gray-900'}`}>Estimate already exists</h3>
            <p className={`text-sm mb-4 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>
              A draft estimate was found for <span className={`font-semibold ${dk ? 'text-white' : 'text-gray-800'}`}>{existingEst.lead_name}</span>.
            </p>
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 mb-5 ${dk ? 'border-[#334155] bg-[#0F172A]' : 'border-[#E8E2D9] bg-gray-50'}`}>
              <div>
                <p className={`text-sm font-bold ${dk ? 'text-white' : 'text-gray-900'}`}>#{existingEst.estimate_number}</p>
                <p className={`text-xs mt-0.5 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>Draft</p>
              </div>
              <span className="text-sm font-bold text-[#0F766E]">
                ${existingEst.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => router.push(`/dashboard/estimates/${existingEst.id}`)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white hover:opacity-90 transition-opacity">
                Open Existing
              </button>
              <button onClick={createFresh} disabled={creating}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors disabled:opacity-50 ${dk ? 'border-[#334155] text-slate-300 hover:border-[#0F766E]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                {creating ? 'Creating...' : 'New Version'}
              </button>
            </div>
            <button onClick={() => setExistingEst(null)}
              className={`w-full mt-3 text-xs transition-colors ${dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Lead picker modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowPicker(false)}>
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <div>
                <h3 className={`font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>New Estimate</h3>
                <p className={`text-xs mt-0.5 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>Select a lead or create a blank estimate</p>
              </div>
              <button onClick={() => setShowPicker(false)} className={dk ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}>
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <Search size={15} className={dk ? 'text-slate-400' : 'text-[#9CA3AF]'} />
              <input
                autoFocus
                value={leadSearch}
                onChange={e => setLeadSearch(e.target.value)}
                placeholder="Search leads by name..."
                className={`flex-1 bg-transparent text-sm focus:outline-none ${dk ? 'text-white placeholder:text-slate-500' : 'text-gray-900 placeholder:text-gray-400'}`}
              />
            </div>

            {/* Lead list */}
            <div className="max-h-80 overflow-y-auto">
              {loadingLeads ? (
                <div className={`p-8 text-center text-sm ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>Loading leads...</div>
              ) : (
                <>
                  {leads
                    .filter(l => l.contact_name?.toLowerCase().includes(leadSearch.toLowerCase()))
                    .slice(0, 15)
                    .map(lead => (
                      <button key={lead.id} onClick={() => createFromLead(lead)}
                        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left border-b transition-colors ${
                          dk ? 'border-[#334155] hover:bg-[#0F172A]' : 'border-[#E8E2D9] hover:bg-[#F9FAFB]'}`}>
                        <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {lead.contact_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>{lead.contact_name}</p>
                          <p className={`text-xs mt-0.5 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>
                            {(lead.lead_source || '').replace(/_/g, ' ')}
                            {lead.contact_phone ? ` · ${lead.contact_phone}` : ''}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          lead.lead_status === 'Contacted' ? 'bg-blue-50 text-blue-600' :
                          lead.lead_status === 'Quoted'    ? 'bg-purple-50 text-purple-600' :
                          'bg-amber-50 text-amber-600'}`}>
                          {lead.lead_status}
                        </span>
                      </button>
                    ))}
                </>
              )}
            </div>

            {/* Skip — blank estimate */}
            <div className={`px-5 py-3 border-t ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <button onClick={() => createFromLead(undefined)}
                className={`w-full flex items-center gap-2 py-2 text-sm transition-colors ${dk ? 'text-slate-400 hover:text-white' : 'text-[#6B7280] hover:text-[#0F766E]'}`}>
                <User size={14} />
                Skip — create blank estimate without a lead
              </button>
            </div>
          </div>
        </div>
      )}
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
