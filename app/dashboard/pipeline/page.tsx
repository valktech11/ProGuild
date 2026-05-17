'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Session, Lead } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'
import LeadPipeline from '@/components/ui/LeadPipeline'
import ActionAlert from '@/components/ui/ActionAlert'
import AddLeadModal from '@/components/ui/AddLeadModal'
import RoofingAddLeadModal from '@/components/roofing/AddLeadModal'
import FilterPanel, { FilterState, DEFAULT_FILTERS, isFilterActive, applyFilters } from '@/components/ui/FilterPanel'
import { theme, T } from '@/lib/tokens'
import { resolveTradeConfig } from '@/lib/trade-resolver'

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

  const tc   = resolveTradeConfig(session?.trade_slug, session?.trade)
  const noun = tc.terms.pipeline ?? 'Pipeline'

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

  const newLeads = leads.filter(l => l.lead_status === 'New')
  const overdue  = leads.filter(l => {
    const days = (Date.now() - new Date(l.created_at).getTime()) / 86400000
    return days >= 3 && l.lead_status === 'New'
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

  return (
    <DashboardShell session={session} newLeads={newLeads.length} onAddLead={() => setShowAddLead(true)} darkMode={dk} onToggleDark={toggleDark}>
      <div className="px-4 py-6" style={{ color: textMain }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold" style={{ color: textMain }}>{noun}</h1>
        </div>

        {/* Stats bar — slim single line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 16px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: dk ? 'none' : '0 1px 3px rgba(0,0,0,0.04)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
            <div style={{ paddingRight: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 1 }}>Total Leads</div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: textMain }}>
                {filteredLeads.length}
                {activeFilterCount > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 8, color: t.textSubtle }}>of {leads.length}</span>
                )}
              </div>
            </div>
            <div style={{ paddingLeft: 24, borderLeft: `1px solid ${t.cardBorder}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 1 }}>{`${noun} Value`}</div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: textMain }}>
                ${filteredLeads.filter(l => l.quoted_amount && !['Lost','Archived','Paid','Completed'].includes(l.lead_status)).reduce((s, l) => s + (l.quoted_amount || 0), 0).toLocaleString()}
              </div>
            </div>
            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 16 }}>
                {filters.stages.map(s => (
                  <span key={s}><Chip label={s} onRemove={() => setFilters(f => ({ ...f, stages: f.stages.filter(x => x !== s) }))} /></span>
                ))}
                {filters.sources.map(s => (
                  <span key={s}><Chip label={s.replace('_', ' ')} onRemove={() => setFilters(f => ({ ...f, sources: f.sources.filter(x => x !== s) }))} /></span>
                ))}
                {filters.needsAttention && (
                  <Chip label="🔥 Needs attention" onRemove={() => setFilters(f => ({ ...f, needsAttention: false }))} />
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
                <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer' }}>
                  Clear all
                </button>
              </div>
            )}
          </div>
          {/* Filter button — prominent on mobile */}
          <button
            onClick={() => setShowFilter(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0,
              border: `1.5px solid ${activeFilterCount > 0 ? '#0F766E' : t.inputBorder}`,
              color: activeFilterCount > 0 ? '#0F766E' : t.textBody,
              background: activeFilterCount > 0
                ? (dk ? 'rgba(15,118,110,0.15)' : '#F0FDFA')
                : (dk ? t.cardBg : '#F9FAFB'),
              boxShadow: activeFilterCount > 0 ? '0 0 0 3px rgba(15,118,110,0.12)' : 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter
            {activeFilterCount > 0 && (
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px rgba(15,118,110,0.4)' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Save error toast */}
        {saveError && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium"
            style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA' }}>
            ⚠️ {saveError}
          </div>
        )}

        {/* Overdue alerts */}
        {overdue.length > 0 && (
          <div className="mb-4">
            <ActionAlert
              leads={overdue.slice(0, 3)}
              onRespond={(leadId) => {
                const el = document.getElementById(`lead-${leadId}`)
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          </div>
        )}

        {session && leads.length === 0 && !dataLoading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#0F766E18,#14B8A618)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 24, marginBottom:12 }}>📋</div>
            <h3 style={{ fontSize: 16, fontWeight:700, color: t.textPri, margin:'0 0 6px' }}>{`No ${noun.toLowerCase()} yet`}</h3>
            <p style={{ fontSize: 13, color: t.textBody, marginBottom:20, maxWidth:300, lineHeight:1.5 }}>
              Add enquiries from calls, texts, social media, or anywhere you get job requests.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', maxWidth:300 }}>
              <button onClick={() => setShowAddLead(true)}
                style={{ padding:'14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize: 15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(15,118,110,0.3)' }}>
                + Add Your First Lead
              </button>
              <div style={{ display:'flex', gap:8 }}>
                {[['📞','Missed call'],['💬','Text enquiry'],['📱','Social DM']].map(([icon, label]) => (
                  <div key={label} style={{ flex:1, padding:'10px 6px', borderRadius:10, background: t.cardBg, border:`1px solid ${t.cardBorder}`, textAlign:'center' }}>
                    <div style={{ fontSize: 18, marginBottom:4 }}>{icon}</div>
                    <div style={{ fontSize: 10, fontWeight:600, color: t.textMuted }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
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

      {showAddLead && session && (
        (['roofing-contractor', 'roofing', 'roofer'].includes(session.trade_slug ?? ''))
          ? <RoofingAddLeadModal
              proId={session.id}
              onClose={() => setShowAddLead(false)}
              onAdded={async () => { setShowAddLead(false); await fetchLeads() }}
            />
          : <AddLeadModal
              proId={session.id}
              onClose={() => setShowAddLead(false)}
              onAdded={async () => { setShowAddLead(false); await fetchLeads() }}
            />
      )}
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
