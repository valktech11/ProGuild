'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Session, Lead } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'
import LeadPipeline from '@/components/ui/LeadPipeline'
import ActionAlert from '@/components/ui/ActionAlert'
import AddLeadModal from '@/components/ui/AddLeadModal'
// RoofingAddLeadModal now accessed via plugin.components.AddLeadModal
import FilterPanel, { FilterState, DEFAULT_FILTERS, isFilterActive, applyFilters } from '@/components/ui/FilterPanel'
import { theme, T } from '@/lib/tokens'
import { getTradeConfig, getStageAnchors, isRoofing } from '@/lib/trades/_registry'

export default function PipelinePage() {
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem('pg_pro')
    return stored ? JSON.parse(stored) : null
  })

  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  const tc   = getTradeConfig(session?.trade_slug)
  const noun = tc.labels.pipeline ?? 'Pipeline'

  function toggleDark() {
    setDk(prev => {
      const next = !prev
      localStorage.setItem('pg_darkmode', next ? '1' : '0')
      return next
    })
  }

  const [leads,       setLeads]       = useState<Lead[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [showFilter,  setShowFilter]  = useState(false)
  const [filters,     setFilters]     = useState<FilterState>(DEFAULT_FILTERS)

  // Single fetch function — reused on mount, after add, after save
  const fetchLeads = useCallback(async () => {
    if (!session) return
    const r = await fetch(`/api/leads?pro_id=${session.id}`)
    if (!r.ok) return
    const data = await r.json()
    setLeads(data.leads || [])
  }, [session])

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetchLeads().finally(() => setDataLoading(false))
  }, [session, router, fetchLeads])

  const anchors  = getStageAnchors(session?.trade_slug)
  const newLeads = leads.filter(l => l.lead_status === anchors.entry)
  const overdue  = leads.filter(l => {
    const days = (Date.now() - new Date(l.created_at).getTime()) / 86400000
    return days >= 3 && l.lead_status === anchors.entry
  })

  const filteredLeads = applyFilters(leads, filters)
  const activeFilterCount = isFilterActive(filters)
    ? [filters.stages.length > 0, filters.sources.length > 0, filters.needsAttention,
       filters.minValue !== '' || filters.maxValue !== '', filters.dateReceived !== '', filters.followUpDue !== ''].filter(Boolean).length
    : 0

  const TEAL     = '#0F766E'
  const textMain = dk ? '#F1F5F9' : '#0A1628'
  const t        = theme(dk)

  // Status change — PATCH [id] route with pro_id ownership param, then re-fetch from DB
  async function handleStatusChange(leadId: string, status: string) {
    if (!session) return
    setSaveError(null)
    const r = await fetch(`/api/leads/${leadId}?pro_id=${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_status: status }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      setSaveError(err.error || 'Failed to save — please try again')
      return
    }
    // Re-fetch from Supabase so mobile + desktop see identical DB state
    await fetchLeads()
  }

  // Field update (notes, amount, dates) — same pattern
  async function handleUpdate(leadId: string, fields: Partial<Lead>) {
    if (!session) return
    setSaveError(null)
    const r = await fetch(`/api/leads/${leadId}?pro_id=${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      setSaveError(err.error || 'Failed to save — please try again')
      return
    }
    await fetchLeads()
  }

  if (!session || dataLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: t.pageBg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium" style={{ color: '#9CA3AF' }}>Loading...</span>
        </div>
      </div>
    )
  }

  // Derived metrics for command bar
  const tc2           = getTradeConfig(session?.trade_slug)
  const terminalKeys2 = tc2.stages.filter(s => s.terminal).map(s => s.key)
  const activeLeads   = leads.filter(l => !terminalKeys2.some(k => k === l.lead_status))
  const pipelineValue = activeLeads.filter(l => l.quoted_amount).reduce((s, l) => s + (l.quoted_amount || 0), 0)
  const overdueCount  = overdue.length
  const wonThisMonth  = leads.filter(l => l.lead_status === anchors.won && new Date(l.created_at) > new Date(Date.now() - 30 * 86400000)).length

  return (
    <DashboardShell session={session} newLeads={newLeads.length} onAddLead={() => setShowAddLead(true)} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ padding: '16px 20px 0', color: textMain }}>

        {/* ── Command bar — full width, always visible ─────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14, gap: 12, flexWrap: 'wrap',
        }}>
          {/* Left: page title + metrics inline */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: textMain, margin: 0 }}>
              {noun}
            </h1>
            {/* Metric pills — only show when there's data */}
            {leads.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>
                  {activeLeads.length} active
                </span>
                {pipelineValue > 0 && (
                  <>
                    <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0F766E' }}>
                      ${pipelineValue.toLocaleString()} pipeline
                    </span>
                  </>
                )}
                {overdueCount > 0 && (
                  <>
                    <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                      {overdueCount} overdue
                    </span>
                  </>
                )}
                {wonThisMonth > 0 && (
                  <>
                    <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>
                      {wonThisMonth} won this month
                    </span>
                  </>
                )}
                {activeFilterCount > 0 && (
                  <>
                    <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>
                    <button onClick={() => setFilters(DEFAULT_FILTERS)}
                      style={{ fontSize: 12, fontWeight: 600, color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: filter + add lead */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Overdue badge — tight, urgent */}
            {overdueCount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                background: dk ? 'rgba(220,38,38,0.12)' : '#FEF2F2',
                border: '1px solid rgba(220,38,38,0.2)',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>{overdueCount} overdue</span>
              </div>
            )}
            {/* Filter */}
            <button onClick={() => setShowFilter(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: `1.5px solid ${activeFilterCount > 0 ? '#0F766E' : t.inputBorder}`,
              color: activeFilterCount > 0 ? '#0F766E' : t.textBody,
              background: activeFilterCount > 0 ? (dk ? 'rgba(15,118,110,0.12)' : '#F0FDFA') : (dk ? t.cardBg : 'white'),
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Filter
              {activeFilterCount > 0 && (
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#0F766E', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {/* Add lead — premium CTA */}
            <button onClick={() => setShowAddLead(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', border: 'none', color: 'white',
              background: 'linear-gradient(135deg, #0F766E 0%, #0C5F57 100%)',
              boxShadow: '0 2px 8px rgba(15,118,110,0.25)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Lead
            </button>
          </div>
        </div>

        {/* Active filter chips — inline below command bar, only when active */}
        {activeFilterCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {filters.stages.map(s => (
              <span key={s}><Chip label={s} onRemove={() => setFilters(f => ({ ...f, stages: f.stages.filter(x => x !== s) }))} /></span>
            ))}
            {filters.sources.map(s => (
              <span key={s}><Chip label={s.replace('_', ' ')} onRemove={() => setFilters(f => ({ ...f, sources: f.sources.filter(x => x !== s) }))} /></span>
            ))}
            {filters.needsAttention && (
              <Chip label="Needs attention" onRemove={() => setFilters(f => ({ ...f, needsAttention: false }))} />
            )}
            {(filters.minValue || filters.maxValue) && (
              <Chip label={`$${filters.minValue || '0'} – $${filters.maxValue || '∞'}`} onRemove={() => setFilters(f => ({ ...f, minValue: '', maxValue: '' }))} />
            )}
            {filters.dateReceived && (
              <Chip label={{ today: 'Today', week: 'This week', month: 'This month' }[filters.dateReceived] || ''} onRemove={() => setFilters(f => ({ ...f, dateReceived: '' }))} />
            )}
            {filters.followUpDue && (
              <Chip label={`Follow-up: ${{ overdue: 'Overdue', today: 'Today', week: 'This week' }[filters.followUpDue] || ''}`} onRemove={() => setFilters(f => ({ ...f, followUpDue: '' }))} />
            )}
          </div>
        )}

        {/* Save error toast */}
        {saveError && (
          <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
            {saveError}
          </div>
        )}

        {/* Overdue alerts — compact, below command bar */}
        {overdue.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <ActionAlert
              leads={overdue.slice(0, 3)}
              onRespond={(leadId) => {
                const el = document.getElementById(`lead-${leadId}`)
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          </div>
        )}

        {/* ── Empty state — minimal, no illustration ───────────────────────── */}
        {session && leads.length === 0 && !dataLoading && (
          <div style={{ marginBottom: 8, padding: '8px 4px' }}>
            <span style={{ fontSize: 13, color: t.textMuted, fontStyle: 'italic' }}>
              No {noun.toLowerCase()} yet — add your first lead above
            </span>
          </div>
        )}

        {session && (
          <LeadPipeline
            leads={filteredLeads}
            onStatusChange={handleStatusChange}
            onUpdate={handleUpdate}
            isPaid={['Pro','Elite','Pro_Founding','Elite_Founding','Pro_Annual','Elite_Annual','Pro_Founding_Annual','Elite_Founding_Annual'].includes(session.plan)}
            tradeSlug={session.trade_slug}
            dk={dk}
          />
        )}
      </div>

      {/* Filter panel */}
      <FilterPanel
        open={showFilter}
        filters={filters}
        onChange={setFilters}
        onClose={() => setShowFilter(false)}
        onClear={() => setFilters(DEFAULT_FILTERS)}
        dk={dk}
      />

      {showAddLead && session && (() => {
        // Shell delegates to trade plugin — no direct trade component imports
        const plugin = getTradeConfig(session.trade_slug)
        const TradeAddLeadModal = (plugin as any).components?.AddLeadModal ?? AddLeadModal
        return (
          <TradeAddLeadModal
            proId={session.id}
            tradeSlug={session.trade_slug}
            onClose={() => setShowAddLead(false)}
            onAdded={async (lead: any) => { setShowAddLead(false); await fetchLeads() }}
            dk={dk}
          />
        )
      })()}
    </DashboardShell>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: '#F0FDFA', color: '#0F766E', border: '1px solid #99F6E4' }}>
      {label}
      <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100 text-[13px] leading-none">×</button>
    </span>
  )
}
