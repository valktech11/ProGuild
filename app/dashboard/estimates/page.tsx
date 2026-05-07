'use client'
import { capName } from '@/lib/utils'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, FileText, Search, Trash2, X, User } from 'lucide-react'
import { Session } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'
import { estimateStatusStyle } from '@/lib/design'
import { theme, T } from '@/lib/tokens'

// Separated out because useSearchParams() requires Suspense boundary in App Router
function VoidedToast({ onToast }: { onToast: (msg: string) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const voided = searchParams.get('voided')
    if (voided) {
      onToast(`${voided} has been voided`)
      window.history.replaceState({}, '', '/dashboard/estimates')
    }
  }, [searchParams, onToast])
  return null
}

type EstimateSummary = {
  id: string
  lead_id: string | null
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'invoiced' | 'paid' | 'void'
  lead_name: string
  trade: string
  total: number
  created_at: string
  valid_until: string
}

const STATUS_STYLES: Record<EstimateSummary['status'], { bg: string; text: string; label: string }> = {
  draft:    { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Draft' },
  sent:     { bg: 'bg-blue-50',    text: 'text-blue-600',   label: 'Sent' },
  viewed:   { bg: 'bg-purple-50',  text: 'text-purple-600', label: 'Viewed' },
  approved: { bg: 'bg-teal-50',    text: 'text-teal-700',   label: 'Approved' },
  declined: { bg: 'bg-red-50',     text: 'text-red-600',    label: 'Declined' },
  invoiced: { bg: 'bg-orange-50',  text: 'text-orange-700', label: 'Invoiced' },
  paid:     { bg: 'bg-green-50',   text: 'text-green-700',  label: 'Paid' },
  void:     { bg: 'bg-gray-100',   text: 'text-gray-400',   label: 'Void' },
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
  // E1: column header sort
  const [sortCol, setSortCol] = useState<'date' | 'total' | 'name' | 'status'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'name' || col === 'status' ? 'asc' : 'desc') }
  }
  // E2: status filter
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // E3: show archived (void/declined)
  const [showArchived, setShowArchived] = useState(false)

  const [voidedToast, setVoidedToast] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    if (voidedToast) {
      const t = setTimeout(() => setVoidedToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [voidedToast])

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

  const deleteEstimate = (e: React.MouseEvent, estId: string) => {
    e.stopPropagation()
    setConfirmDelete(estId)
  }

  const doDelete = async (estId: string) => {
    try {
      await fetch(`/api/estimates/${estId}`, { method: 'DELETE' })
      setEstimates(prev => prev.filter(est => est.id !== estId))
    } catch { /* silent */ }
    setConfirmDelete(null)
  }

  if (!session) return null

  const t       = theme(dk)
  const muted   = dk ? 'text-slate-400' : 'text-[#6B7280]'

  // E1+E2+E3: filter, sort, archive
  const archivedStatuses = ['void', 'declined']
  const filtered = estimates
    .filter(e => {
      // E3: hide archived by default
      if (!showArchived && archivedStatuses.includes(e.status)) return false
      // E2: status filter
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      // search
      return e.lead_name.toLowerCase().includes(search.toLowerCase()) ||
             e.estimate_number.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortCol === 'date')   return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      if (sortCol === 'total')  return dir * (a.total - b.total)
      if (sortCol === 'name')   return dir * a.lead_name.localeCompare(b.lead_name)
      if (sortCol === 'status') {
        const order = ['draft','sent','viewed','approved','invoiced','paid','declined','void']
        return dir * (order.indexOf(a.status) - order.indexOf(b.status))
      }
      return 0
    })

  const archivedCount = estimates.filter(e => archivedStatuses.includes(e.status)).length

  // Stats
  // Best-per-lead: one lead can never contribute more than once to Active Estimates Value
  // Priority: invoiced > approved > viewed > sent (highest commitment wins)
  const STATUS_PRIORITY: Record<string, number> = { invoiced: 1, approved: 2, viewed: 3, sent: 4 }
  const activeStatuses = ['sent', 'viewed', 'approved', 'invoiced']
  const bestPerLead = Object.values(
    estimates
      .filter(e => activeStatuses.includes(e.status))
      .reduce((acc, e) => {
        const key = e.lead_id || e.id // fallback to id if no lead_id (standalone estimates)
        const existing = acc[key]
        if (!existing || (STATUS_PRIORITY[e.status] || 99) < (STATUS_PRIORITY[existing.status] || 99)) {
          acc[key] = e
        }
        return acc
      }, {} as Record<string, typeof estimates[0]>)
  )
  const totalValue = (bestPerLead as typeof estimates).reduce((s, e) => s + e.total, 0)
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
      <div className={`min-h-screen pb-12 `}>
        <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">

          {/* Reads ?voided= param — must be in Suspense per Next.js App Router rules */}
          <Suspense fallback={null}>
            <VoidedToast onToast={msg => setVoidedToast(msg)} />
          </Suspense>

          {/* Voided confirmation toast */}
          {voidedToast && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: dk ? 'rgba(100,116,139,0.15)' : '#F1F5F9', border: '1px solid #CBD5E1' }}>
              <span style={{ fontSize: 14 }}>🗂</span>
              <span style={{ fontSize: 13, color: dk ? '#94A3B8' : '#475569' }}>{voidedToast}</span>
              <button onClick={() => setVoidedToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: dk ? '#64748B' : '#94A3B8', fontSize: 16 }}>×</button>
            </div>
          )}

          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold tracking-tight `}>Estimates</h1>
              <p className={`text-sm mt-0.5 hidden md:block `}>Create and send professional estimates to your leads</p>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap"
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
              { label: 'Active Estimates Value', value: fmt(totalValue) },
            ].map(stat => (
              <div key={stat.label} className={`rounded-xl border p-3 md:p-4 `}>
                <p className={`text-[12px] font-bold uppercase tracking-wide `}>{stat.label}</p>
                <p className={`text-xl md:text-2xl font-bold mt-1 `}>{stat.value}</p>
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

          {/* ── Search + Sort ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 flex-1 `}>
              <Search size={16} className={muted} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by client name or estimate number..."
                className={`flex-1 bg-transparent text-sm focus:outline-none  placeholder:text-[#9CA3AF]`}
              />
              {search && (
                <button onClick={() => setSearch('')} className={`text-xs  hover:text-red-400`}>✕</button>
              )}
            </div>
            </div>

          {/* E2: Status filter pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {(['all','draft','sent','viewed','approved','invoiced','paid'] as const).map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors shrink-0 ${
                  statusFilter === s
                    ? 'bg-[#0F766E] border-[#0F766E] text-white'
                    : dk ? 'border-[#334155] text-slate-400 hover:border-teal-600' : 'border-[#E8E2D9] text-[#6B7280] hover:border-teal-600'
                }`}>
                {s === 'all' ? 'All Active' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Estimates table ── */}
          <div className={`rounded-xl border overflow-hidden `}>
            {/* Table header */}
            <div className={`hidden md:grid grid-cols-[1fr_140px_100px_120px_100px_40px] gap-4 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wide  ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              {/* Client — sortable by name */}
              <button onClick={() => toggleSort('name')} className={`flex items-center gap-1 text-left hover:text-[#0F766E] transition-colors ${sortCol === 'name' ? 'text-[#0F766E]' : ''}`}>
                Client / Estimate {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <span>Trade</span>
              {/* Status — sortable */}
              <button onClick={() => toggleSort('status')} className={`flex items-center gap-1 hover:text-[#0F766E] transition-colors ${sortCol === 'status' ? 'text-[#0F766E]' : ''}`}>
                Status {sortCol === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              {/* Total — sortable */}
              <button onClick={() => toggleSort('total')} className={`flex items-center gap-1 justify-end w-full hover:text-[#0F766E] transition-colors ${sortCol === 'total' ? 'text-[#0F766E]' : ''}`}>
                {sortCol === 'total' ? (sortDir === 'asc' ? '↑' : '↓') : ''} Total
              </button>
              {/* Date — sortable */}
              <button onClick={() => toggleSort('date')} className={`flex items-center gap-1 justify-end w-full hover:text-[#0F766E] transition-colors ${sortCol === 'date' ? 'text-[#0F766E]' : ''}`}>
                {sortCol === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''} Date
              </button>
              <span />
            </div>

            {loading ? (
              <div className="space-y-0">
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ height: 64, borderBottom: `1px solid ${t.cardBorder}`, background: t.cardBgAlt }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              estimates.length === 0
                ? <EmptyState dk={dk} onCreate={handleCreate} creating={creating} />
                : (
                  <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                    <p className={`font-semibold text-sm ${dk ? 'text-white' : 'text-gray-700'}`}>
                      No {statusFilter !== 'all' ? statusFilter : ''} estimates match your search
                    </p>
                    <button onClick={() => { setSearch(''); setStatusFilter('all') }}
                      className="mt-3 text-xs text-[#0F766E] hover:underline">
                      Clear filters
                    </button>
                  </div>
                )
            ) : (
              <div>
                {filtered.map((est, i) => (
                  <button
                    key={est.id}
                    onClick={() => router.push(`/dashboard/estimates/${est.id}`)}
                    className={`w-full text-left transition-colors border-b last:border-b-0 ${
                      dk ? 'border-[#334155]' : 'border-[#E8E2D9]'
                    }`}
                    style={{ background: i % 2 === 1 ? (t.tableRowOdd) : 'transparent' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = t.cardBgHover)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? (t.tableRowOdd) : 'transparent')}
                  >
                    {/* Mobile layout */}
                    <div className="flex items-center gap-3 px-4 py-3.5 md:hidden">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate `}>{est.lead_name}</p>
                        <p className={`text-xs mt-0.5 `}>#{est.estimate_number}</p>
                      </div>
                      <span style={{ background: estimateStatusStyle(est.status, dk).bg, color: estimateStatusStyle(est.status, dk).text, padding: '2px 10px', borderRadius: 20, fontSize: T.fontBadge, fontWeight: 600, display: 'inline-flex', flexShrink: 0 }}>
                        {estimateStatusStyle(est.status, dk).label}
                      </span>
                      <div className={`text-sm font-bold shrink-0 `}>
                        {fmt(est.total)}
                      </div>
                      <button
                        onClick={e => deleteEstimate(e, est.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title="Delete estimate"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-[1fr_140px_100px_120px_100px_40px] gap-4 px-5 py-4">
                      <div>
                        <p className={`text-sm font-semibold `}>{est.lead_name}</p>
                        <p className={`text-xs mt-0.5 `}>#{est.estimate_number}</p>
                      </div>
                      <div className={`text-sm self-center truncate `}>{est.trade}</div>
                      <div className="self-center">
                        <span style={{ background: estimateStatusStyle(est.status, dk).bg, color: estimateStatusStyle(est.status, dk).text, padding: '2px 10px', borderRadius: 20, fontSize: T.fontBadge, fontWeight: 600, display: 'inline-flex' }}>
                          {estimateStatusStyle(est.status, dk).label}
                        </span>
                      </div>
                      <div className={`text-sm font-semibold self-center text-right `}>
                        {fmt(est.total)}
                      </div>
                      <div className={`text-xs self-center text-right `}>
                        {new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <button
                        onClick={e => deleteEstimate(e, est.id)}
                        className="self-center p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete estimate"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* E3: archive toggle */}
          {archivedCount > 0 && (
            <div className="text-center py-2">
              <button onClick={() => setShowArchived(v => !v)}
                className={`text-xs font-medium transition-colors  hover:text-[#0F766E]`}>
                {showArchived ? `Hide archived (${archivedCount})` : `Show archived — void & declined (${archivedCount})`}
              </button>
            </div>
          )}

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
                          <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>{capName(lead.contact_name)}</p>
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
      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDelete(null)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#FEE2E2' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-base ${dk ? 'text-white' : 'text-gray-900'}`}>Delete estimate?</h3>
                <p className={`text-sm mt-0.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${dk ? 'border-[#334155] text-slate-300' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                Cancel
              </button>
              <button onClick={() => doDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: '#DC2626' }}>
                Delete
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
      <p className={`text-sm mt-1 mb-5 `}>Create your first estimate and send it to a client in minutes.</p>
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
