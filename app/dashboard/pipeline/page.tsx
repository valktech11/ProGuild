'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Lead } from '@/types'
import { useProSession } from '@/lib/hooks/useProSession'
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

  const { session, loading: _authLoading } = useProSession()

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
  const [summary,     setSummary]     = useState<any>(null)

  // Derive which action card (if any) is the source of the current filter.
  // Used to show selected state on the card and to toggle it off on re-click.
  const activeFilter = (() => {
    const anchors = getStageAnchors(session?.trade_slug)
    if (filters.needsAttention && !filters.stages.length) return 'stalledLeads'
    const s = filters.stages
    if (s.length === 1 && s[0] === anchors.entry) return 'needsContact'
    if (s.length === 1 && s[0] === 'insurance_approved') return 'insuranceFollowUp'
    if (s.length === 2 && s.includes('proposal_sent') && s.includes('proposal_signed')) return 'awaitingSignature'
    return null
  })()

  // Action card click → apply a board filter that matches the card's definition
  const handleActionFilter = useCallback((key: string) => {
    const anchors = getStageAnchors(session?.trade_slug)
    if (key === 'needsContact') {
      setFilters(f => ({ ...f, stages: [anchors.entry] }))
    } else if (key === 'awaitingSignature') {
      setFilters(f => ({ ...f, stages: ['proposal_sent', 'proposal_signed'] }))
    } else if (key === 'insuranceFollowUp') {
      setFilters(f => ({ ...f, stages: ['insurance_approved'] }))
    } else if (key === 'stalledLeads') {
      setFilters(f => ({ ...f, needsAttention: true }))
    }
    setShowFilter(false)
  }, [session?.trade_slug])

  // Single fetch function — reused on mount, after add, after save
  const fetchLeads = useCallback(async () => {
    if (!session) return
    const [r, sr] = await Promise.all([
      fetch(`/api/leads?pro_id=${session.id}`),
      fetch(`/api/pipeline/summary?pro_id=${session.id}`),
    ])
    if (r.ok)  setLeads(((await r.json()).leads) || [])
    if (sr.ok) setSummary(await sr.json())
  }, [session])

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    fetchLeads().finally(() => setDataLoading(false))
    // Refresh when a lead is added from the sidebar "+ Add New Lead" button
    const handler = () => fetchLeads()
    window.addEventListener('pg:lead-added', handler)
    return () => window.removeEventListener('pg:lead-added', handler)
  }, [session, router, fetchLeads])

  const anchors  = getStageAnchors(session?.trade_slug)
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

  // Stage change — routes through the enforced /stage endpoint so corruption-risky
  // moves (Job Won without a paid invoice, Install Sched. without a signed proposal)
  // are rejected here exactly as they are on the lead detail page. On rejection we
  // re-fetch so any optimistic card move on the board snaps back to DB truth.
  async function handleStatusChange(leadId: string, status: string) {
    if (!session) return
    setSaveError(null)
    const r = await fetch(`/api/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: status, pro_id: session.id }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      setSaveError(err.error || 'Failed to save — please try again')
      await fetchLeads()   // revert any optimistic move to the real stage
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

  // Command-bar metrics — from /api/pipeline/summary (single source). The board
  // grouping/filters and the `overdue` list (for the alert) stay client-side.
  const sm            = summary ?? {}
  const newCount      = sm.newCount ?? 0
  const activeCount   = sm.activeCount ?? 0
  const pipelineValue = sm.pipelineValue ?? 0   // estimated (quoted) value of open leads
  const approvedValue = sm.approvedValue ?? 0   // carrier-approved value on open insurance leads
  const overdueCount  = sm.overdueCount ?? 0
  const wonThisMonth  = sm.wonThisMonth ?? 0

  return (
    <DashboardShell session={session} newLeads={newCount} onAddLead={() => setShowAddLead(true)} darkMode={dk} onToggleDark={toggleDark}>
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
            {/* Status line — new leads · $X estimated · $X approved · N won */}
            {leads.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {newCount > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>
                    {newCount} new lead{newCount !== 1 ? 's' : ''}
                  </span>
                )}
                {overdueCount > 0 && (
                  <>
                    {newCount > 0 && <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                      {overdueCount} overdue
                    </span>
                  </>
                )}
                {pipelineValue > 0 && (
                  <>
                    <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0F766E' }}>
                      ${pipelineValue.toLocaleString()} estimated
                    </span>
                  </>
                )}
                {approvedValue > 0 && (
                  <>
                    <span style={{ color: t.cardBorder, fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0891B2' }}>
                      ${approvedValue.toLocaleString()} approved
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

          </div>
        </div>

        {/* Active filter chips — inline below command bar, only when active.
            Card-driven filters (activeFilter set) show as the card's selected state;
            no chip rendered for those — one affordance per filter. */}
        {activeFilterCount > 0 && !activeFilter && (
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
            summary={summary}
            onActionFilter={handleActionFilter}
            activeFilter={activeFilter}
            onClearFilter={() => setFilters(DEFAULT_FILTERS)}
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
        tradeSlug={session?.trade_slug}
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
