'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Lead } from '@/types'
import { initials, avatarColor, timeAgo, capName, fmtCurrency } from '@/lib/utils'
import { stageStyle } from '@/lib/design'
import { theme, T } from '@/lib/tokens'
import { getTradeConfig, getActiveStages, getTerminalStages } from '@/lib/trades/_registry'

// ── Stage definitions ──────────────────────────────────────────────────────────
// PipelineStage is the display contract used throughout this file.
// Built from AnyPipelineStage (registry) — color/bg come from trade config directly.

export type PipelineStage = {
  key:       string
  label:     string
  subLabel:  string
  nextLabel: string
  color:     string   // from trade config — used in column header, chips
  bg:        string   // from trade config — column header background
  terminal?: boolean
}

// Sub/next labels for generic stages (default trade)
const GENERIC_SUB: Record<string, string> = {
  New: 'Not yet contacted', Contacted: 'In conversation', Quoted: 'Proposal sent',
  Scheduled: 'Job confirmed', Completed: 'Job completed', Paid: 'Payment received',
}
const GENERIC_NEXT: Record<string, string> = {
  New: 'Call', Contacted: 'Follow Up', Quoted: 'Send Estimate',
  Scheduled: 'Job Day', Completed: 'Generate Invoice', Paid: '✓ Job Won',
}

// Sub/next labels for roofing stages
const ROOFING_SUB: Record<string, string> = {
  lead_in: 'Awaiting inspection', inspection_scheduled: 'Inspection booked',
  proposal_sent: 'Proposal with owner', proposal_signed: 'Owner signed',
  insurance_approved: 'Insurer approved', scheduled: 'Date & materials set',
  in_progress: 'Crew on site', job_won: 'Complete & paid',
  lost: 'Job lost', unqualified: 'Bad lead',
}
const ROOFING_NEXT: Record<string, string> = {
  lead_in: 'Schedule Inspection', inspection_scheduled: 'Run Inspection',
  proposal_sent: 'Get Signature', proposal_signed: 'Submit to Insurance',
  insurance_approved: 'Schedule Install', scheduled: 'Start Job',
  in_progress: 'Mark Complete', job_won: '✓ Job Won',
  lost: 'Reopen', unqualified: '',
}

/** Build PipelineStage[] from the trade registry. Single source of truth. */
export function getPipelineStages(tradeSlug?: string | null): PipelineStage[] {
  const tc = getTradeConfig(tradeSlug)
  const isRoofingTrade = tc.slug === 'roofing' || tc.slug === 'roofing-contractor'
  return getActiveStages(tradeSlug).map(s => ({
    key:       s.key,
    label:     s.label,
    color:     s.color,
    bg:        s.bg,
    terminal:  s.terminal,
    subLabel:  isRoofingTrade
      ? (ROOFING_SUB[s.key]  ?? s.label)
      : (GENERIC_SUB[s.key]  ?? s.label),
    nextLabel: isRoofingTrade
      ? (ROOFING_NEXT[s.key] ?? 'Open')
      : (GENERIC_NEXT[s.key] ?? 'Open'),
  }))
}

// Keep legacy export for components that import it directly
export const PIPELINE_STAGES = getPipelineStages(null)

type StageKey = string

// Stage order is now derived dynamically from the trade config in LeadPipeline
// Kept as a fallback for the BackwardConfirm check on generic trades
const STAGE_ORDER: Record<string, number> = {
  New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5, Lost: 6,
  // Roofing
  lead_in: 0, inspection_scheduled: 1, proposal_sent: 2, proposal_signed: 3,
  insurance_approved: 4, scheduled: 5, in_progress: 6, job_won: 7, lost: 8, unqualified: 9,
}

interface Props {
  leads:          Lead[]
  onStatusChange: (leadId: string, status: string) => Promise<void>
  onUpdate: (leadId: string, fields: Partial<Lead>) => Promise<void>
  isPaid: boolean
  tradeSlug?: string | null
  dk?: boolean
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// ── SVG icon helper ────────────────────────────────────────────────────────────
function Ic({ d, s = 14, sw = 2.0, c = 'currentColor' }: { d: string; s?: number; sw?: number; c?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// ── Backward confirmation ──────────────────────────────────────────────────────
function BackwardConfirm({ fromStage, toStage, isPaidMove, onConfirm, onCancel, dk = false }: {
  fromStage: string; toStage: string; isPaidMove: boolean; onConfirm: () => void; onCancel: () => void; dk?: boolean
}) {
  const t = theme(dk)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div style={{ background: t.cardBg, borderRadius: 16, width: '100%', maxWidth: 384, padding: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: t.warningBg, border: `1px solid ${t.warningBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, margin: '0 auto 16px' }}>
          <Ic d="M12 9v4M12 16.5v1M2 12a10 10 0 1020 0 10 10 0 00-20 0" s={26} sw={2.2} c="#D97706" />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: t.textPri, textAlign: 'center', marginBottom: 8 }}>Move back to {toStage}?</h3>
        <p style={{ fontSize: 14, color: t.textMuted, textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
          This lead is <span style={{ fontWeight: 600, color: t.textBody }}>{fromStage}</span>. Moving it back is allowed but tracked.
        </p>
        {isPaidMove && (
          <p style={{ fontSize: 13, color: '#92400E', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: 12, padding: '10px 16px', textAlign: 'center', marginBottom: 12 }}>
            ⚠️ Moving a <strong>Job Won</strong> lead back will affect your revenue stats.
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: `1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textBody, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer' }}>Yes, move back</button>
        </div>
      </div>
    </div>
  )
}

// ── Lead detail modal ──────────────────────────────────────────────────────────
function LeadModal({ lead, onClose, onStatusChange, onUpdate, stages = getPipelineStages(null), dk = false }: {
  lead: Lead; onClose: () => void
  onStatusChange: (id: string, status: string) => Promise<void>
  onUpdate: (id: string, fields: Partial<Lead>) => Promise<void>
  stages?: PipelineStage[]
  dk?: boolean
}) {
  const [notes, setNotes]         = useState(lead.notes || '')
  const [amount, setAmount]       = useState(lead.quoted_amount?.toString() || '')
  const [schedDate, setSchedDate] = useState(lead.scheduled_date || '')
  const [followUp, setFollowUp]   = useState(lead.follow_up_date || '')
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState<string>(lead.lead_status)
  const [pendingStage, setPendingStage] = useState<string | null>(null)

  function handleStageClick(newStage: string) {
    if (newStage === status) return
    const isBackward = (STAGE_ORDER[newStage] ?? 0) < (STAGE_ORDER[status] ?? 0)
    if (isBackward) setPendingStage(newStage)
    else setStatus(newStage as StageKey)
  }

  async function save() {
    setSaving(true)
    await onUpdate(lead.id, {
      notes: notes || null,
      scheduled_date: schedDate || null,
      follow_up_date: followUp || null,
      lead_status: status as import('@/types').LeadStatus,
    })
    setSaving(false)
    onClose()
  }

  const currentStage = stages.find(s => s.key === status)
  const currentStageSS = stageStyle(status)

  return (
    <>
      {pendingStage && (
        <BackwardConfirm
          fromStage={status} toStage={pendingStage} isPaidMove={status === 'Paid' || status === 'job_won'}
          onConfirm={() => { setStatus(pendingStage as StageKey); setPendingStage(null) }}
          onCancel={() => setPendingStage(null)}
        />
      )}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
        <div style={{ background: theme(dk).cardBg, width: "100%", maxWidth: 512, borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.3)", overflow: "hidden", maxHeight: '92vh' }} className="sm:rounded-3xl"
          onClick={e => e.stopPropagation()}>

          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: `1px solid ${theme(dk).cardBorder}` }}>
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-xl font-bold text-gray-900">{(lead as any).property_address ? (lead as any).property_address.replace(/, USA$/, '') : capName(lead.contact_name)}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{timeAgo(lead.created_at)} · {lead.lead_source?.replace(/_/g, ' ')}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
                style={{ background: currentStageSS.bg, color: currentStageSS.color }}>
                <div className="w-2 h-2 rounded-full" style={{ background: currentStageSS.chipBg }} />
                {currentStage?.label}
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-2xl">×</button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(92vh - 100px)' }}>
            <div className="px-6 py-5 space-y-5">
              {/* Message */}
              <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1.5px solid #E5E7EB' }}>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Request</p>
                <p className="text-base font-medium leading-relaxed text-gray-900">{lead.message}</p>
              </div>

              {/* Stage selector */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Move to stage</p>
                <div className="grid grid-cols-3 gap-2">
                  {stages.map(s => (
                    <button key={s.key} onClick={() => handleStageClick(s.key)}
                      className="py-2.5 rounded-xl text-xs font-bold border-2 transition-all"
                      style={status === s.key
                        ? { background: stageStyle(s.key, dk).bg, color: stageStyle(s.key, dk).color, borderColor: stageStyle(s.key, dk).color }
                        : { background: theme(dk).cardBg, color: theme(dk).textMuted, borderColor: theme(dk).cardBorder }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CRM fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quote Amount</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="$0"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Scheduled Date</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Follow-up Date</label>
                <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes..."
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white resize-none" />
              </div>

              {/* Contact */}
              {lead.contact_phone && (
                <a href={`tel:${lead.contact_phone}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={18} c="#0F766E" />
                  <span className="text-sm font-semibold text-gray-800">{lead.contact_phone}</span>
                </a>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-3.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Lead card ──────────────────────────────────────────────────────────────────
function LeadCard({ lead, stage, onOpen, dk = false, onStatusChange }: {
  lead: Lead
  stage: PipelineStage
  onOpen: () => void
  dk?: boolean
  onStatusChange?: (leadId: string, status: string) => Promise<void>
}) {
  const router = useRouter()
  const [bg, fg] = avatarColor(lead.contact_name)
  const days     = daysSince(lead.created_at)
  const ageLabel = (() => {
    const mins = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000)
    if (mins < 60)   return `${mins}m`
    if (mins < 1440) return `${Math.floor(mins / 60)}h`
    return `${Math.floor(mins / 1440)}d`
  })()
  const [creatingEst, setCreatingEst] = useState(false)
  const [existingEst, setExistingEst] = useState<{ id: string; estimate_number: string; status: string; total: number; created_at: string } | null>(null)

  async function openEstimate(e: React.MouseEvent) {
    e.stopPropagation()
    if (creatingEst) return
    setCreatingEst(true)
    try {
      const session = JSON.parse(sessionStorage.getItem('pg_pro') || '{}')
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:      session.id,
          lead_id:     lead.id,
          lead_name:   lead.contact_name,
          lead_source: lead.lead_source || '',
          trade:       session.trade    || '',
          state:       session.state    || '',
        }),
      })
      const d = await r.json()
      if (d.existed) {
        setExistingEst(d.estimate)
        setCreatingEst(false)
      } else if (d.estimate?.id) {
        router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${lead.id}`)
      }
    } catch {
      setCreatingEst(false)
    }
  }

  async function createFresh(e: React.MouseEvent) {
    e.stopPropagation()
    setExistingEst(null)
    setCreatingEst(true)
    try {
      const session = JSON.parse(sessionStorage.getItem('pg_pro') || '{}')
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:      session.id,
          lead_id:     lead.id,
          lead_name:   lead.contact_name,
          lead_source: lead.lead_source || '',
          trade:       session.trade    || '',
          state:       session.state    || '',
          force_new:   true,
        }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${lead.id}`)
    } catch {
      setCreatingEst(false)
    }
  }

  // Stage-specific primary action
  const primaryAction = () => {
    if (stage.key === 'Quoted') return openEstimate
    return (e: React.MouseEvent) => { e.stopPropagation(); onOpen() }
  }

  // Use stage.nextLabel from trade config (ROOFING_NEXT / GENERIC_NEXT)
  const primaryLabel = creatingEst ? 'Opening…' : (stage.nextLabel || 'Open')

  // Smart primary action handler
  async function handlePrimaryAction(e: React.MouseEvent) {
    e.stopPropagation()
    if (stage.key === 'New') {
      // Mark as Contacted — 1-tap stage advance
      if (onStatusChange) await onStatusChange(lead.id, 'Contacted')
      return
    }
    if (stage.key === 'Contacted') {
      // Open/create estimate directly
      openEstimate(e)
      return
    }
    if (stage.key === 'Quoted') {
      openEstimate(e)
      return
    }
    // All other stages — open lead detail
    e.stopPropagation()
    onOpen()
  }

  const urgency = days > 3 ? 'high' : days >= 2 ? 'mid' : 'low'
  const ageBg   = 'transparent'
  const ageColor= urgency === 'high' ? '#EF4444' : urgency === 'mid' ? '#B45309' : '#6B7280'
  const t       = theme(dk)

  // Derived values used in new card layout
  const minsOld  = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000)
  const priority = minsOld < 30 ? 'hot' : minsOld < 360 ? 'warm' : null
  const isStale  = days >= 7
  const src      = (lead.lead_source || '').replace(/_/g,' ')
  const amt      = lead.quoted_amount
  const schedDate = lead.scheduled_date
    ? new Date(lead.scheduled_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})
    : null
  const isInsuranceStage = ['insurance_approved','proposal_signed','in_progress','job_won'].includes(stage.key)

  const [hovered, setHovered] = useState(false)

  return (
    <>
    {/* ── TILE CARD — click to open, hover reveals call icon ── */}
    <div
      data-card="true"
      onClick={onOpen}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        border: isStale ? '1.5px solid #FCD34D' : `1px solid ${dk ? '#1E293B' : '#E8E4DE'}`,
        borderRadius: 10,
        padding: '12px 12px 10px',
        background: t.cardBg,
        cursor: 'pointer',
        boxShadow: hovered
          ? (dk ? '0 0 0 1px #334155' : '0 4px 16px rgba(0,0,0,0.09)')
          : (isStale ? '0 2px 6px rgba(245,158,11,0.10)' : (dk ? 'none' : '0 1px 3px rgba(0,0,0,0.05)')),
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow 150ms ease, transform 150ms ease',
      }}>

      {/* ── Row 1: avatar + name + age ── */}
      <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:6 }}>
        {/* Avatar */}
        <div style={{
          width:34, height:34, borderRadius:8, flexShrink:0,
          background:bg, color:fg,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:12, fontWeight:700,
        }}>
          {initials(lead.contact_name)}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          {/* Name row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
            <span style={{ fontSize:14, fontWeight:700, color:t.textPri,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              letterSpacing:'-0.01em', lineHeight:1.2 }}>
              {capName(lead.contact_name)}
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
              {priority === 'hot' && (
                <span style={{ fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:20,
                  background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA',
                  letterSpacing:'0.04em' }}>HOT</span>
              )}
              {priority === 'warm' && (
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:20,
                  background:'#FEF3C7', color:'#92400E', border:'1px solid #FDE68A',
                  letterSpacing:'0.04em' }}>WARM</span>
              )}
              <span style={{ fontSize:11, color:ageColor, fontWeight:isStale?700:400 }}>
                {isStale ? `⚠ ${ageLabel}` : ageLabel}
              </span>
            </div>
          </div>
          {/* Address — single truncated line */}
          {(lead.property_address || (lead.contact_city && lead.contact_state)) && (
            <p style={{ fontSize:11, color:t.textSubtle, margin:'2px 0 0',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.3 }}>
              {lead.property_address
                ? lead.property_address.replace(/, USA$/,'')
                : `${lead.contact_city}, ${lead.contact_state}`}
            </p>
          )}
        </div>
      </div>

      {/* ── Row 2: chips ── */}
      {(src || isInsuranceStage || schedDate) && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
          {src && src !== 'undefined' && (
            <span style={{ fontSize:10, fontWeight:500, padding:'2px 7px', borderRadius:20,
              background:dk?'#1E293B':'#F1F5F9', color:dk?'#94A3B8':'#475569' }}>
              {src}
            </span>
          )}
          {isInsuranceStage && (
            <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:20,
              background:'#FEF3C7', color:'#92400E', border:'1px solid #FDE68A' }}>
              🌩 Insurance
            </span>
          )}
          {schedDate && (
            <span style={{ fontSize:10, fontWeight:500, padding:'2px 7px', borderRadius:20,
              background:dk?'#0E2A3A':'#ECFEFF', color:'#2563EB' }}>
              📅 {schedDate}
            </span>
          )}
        </div>
      )}

      {/* ── Row 3: value — prominent, no label clutter ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        {amt && amt > 0 ? (
          <span style={{ fontSize:16, fontWeight:800, color:t.textPri,
            letterSpacing:'-0.02em', lineHeight:1 }}>
            ${amt.toLocaleString()}
          </span>
        ) : (
          <span style={{ fontSize:11, color:dk?'#374151':'#D1D5DB' }}>—</span>
        )}

        {/* Hover-reveal: phone icon only */}
        {lead.contact_phone && (
          <a
            href={`tel:${lead.contact_phone}`}
            onClick={e => e.stopPropagation()}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center',
              width:28, height:28, borderRadius:7,
              background: hovered ? (dk?'#1E293B':'#F1F5F9') : 'transparent',
              border: hovered ? `1px solid ${dk?'#334155':'#E2E8F0'}` : '1px solid transparent',
              color:'#0F766E', textDecoration:'none', flexShrink:0,
              transition:'all 150ms ease',
              opacity: hovered ? 1 : 0,
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/>
            </svg>
          </a>
        )}
      </div>
    </div>

      {/* ── Existing estimate modal — rendered via portal to escape card onClick ── */}
      {existingEst && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={e => { e.stopPropagation(); e.preventDefault(); setExistingEst(null) }}
        >
          <div
            style={{ background: theme(dk).cardBg, borderRadius: 16, width: "100%", maxWidth: 384, padding: 24, boxShadow: "0 24px 48px rgba(0,0,0,0.3)" }}
            onClick={e => { e.stopPropagation(); e.preventDefault() }}
          >
            <h3 className="font-bold text-gray-900 text-base mb-1">Active estimate exists</h3>
            <p className="text-sm text-gray-500 mb-4">
              An estimate already exists for <span className="font-semibold text-gray-700">{capName(lead.contact_name)}</span>. Open it or create a new version.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">#{existingEst.estimate_number}</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {existingEst.status || 'Draft'} · {new Date(existingEst.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span className="text-sm font-bold text-[#0F766E]">
                ${existingEst.total.toLocaleString()}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={e => { e.stopPropagation(); e.preventDefault(); router.push(`/dashboard/estimates/${existingEst.id}?from=pipeline&lead_id=${lead.id}`) }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white hover:opacity-90 transition-opacity"
              >
                Open Existing
              </button>
              <button
                onClick={e => { e.stopPropagation(); e.preventDefault(); createFresh(e) }}
                disabled={creatingEst}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {creatingEst ? 'Creating...' : 'New Version'}
              </button>
            </div>

            <button
              onClick={e => { e.stopPropagation(); e.preventDefault(); setExistingEst(null) }}
              className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── Lead List View — full sortable table for dense triage ──────────────────────
function LeadListView({ leads, onOpen, dk, stages = getPipelineStages(null) }: { leads: Lead[]; onOpen: (l: Lead) => void; dk: boolean; stages?: PipelineStage[] }) {
  const router = useRouter()
  const t = theme(dk)
  const [sort, setSort] = useState<'age' | 'name' | 'stage' | 'value'>('age')
  const [asc,  setAsc]  = useState(true)  // oldest first = most urgent at top
  const [search, setSearch] = useState('')

  const filtered = leads
    .filter(l => !search || l.contact_name.toLowerCase().includes(search.toLowerCase()) || (l.contact_phone||'').includes(search))
    .sort((a, b) => {
      let v = 0
      if (sort === 'age')   v = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'name')  v = a.contact_name.localeCompare(b.contact_name)
      if (sort === 'stage') v = (STAGE_ORDER[a.lead_status]||0) - (STAGE_ORDER[b.lead_status]||0)
      if (sort === 'value') v = (b.quoted_amount||0) - (a.quoted_amount||0)
      return asc ? -v : v
    })

  function toggleSort(col: typeof sort) {
    if (sort === col) setAsc(a => !a)
    else { setSort(col); setAsc(false) }
  }

  const thStyle = (col: typeof sort): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    color: sort === col ? '#0F766E' : (t.textSubtle),
    cursor: 'pointer', padding: '10px 14px', whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  })

  const arrow = (col: typeof sort) => sort === col ? (asc ? ' ↑' : ' ↓') : ''

  return (
    <div style={{ background: t.cardBg, borderRadius: 14, border: `1px solid ${t.cardBorder}`, overflow: 'hidden' }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.cardBorder}` }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textPri, fontSize: 14, boxSizing: 'border-box' as const }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: t.textSubtle, fontSize: 14 }}>No leads match</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                <th style={thStyle('name')}    onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
                <th style={thStyle('stage')}   onClick={() => toggleSort('stage')}>Stage{arrow('stage')}</th>
                <th style={thStyle('age')}     onClick={() => toggleSort('age')}>Age{arrow('age')}</th>
                <th style={thStyle('value')}   onClick={() => toggleSort('value')}>Value{arrow('value')}</th>
                <th style={{ ...thStyle('age'), cursor: 'default' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => {
                const stage = stages.find(s => s.key === lead.lead_status) || stages[0]
                const days  = daysSince(lead.created_at)
                const [avBg, avFg] = avatarColor(lead.contact_name)
                const urgency = days > 3 ? '#DC2626' : days >= 2 ? '#B45309' : '#059669'
                const urgBg   = days > 3 ? '#FEE2E2' : days >= 2 ? '#FEF3C7' : '#D1FAE5'

                return (
                  <tr key={lead.id}
                    style={{ borderBottom: `1px solid ${dk ? '#1E293B' : '#F9F8F6'}`, background: i % 2 === 1 ? (dk ? '#0F172A' : '#FAFAF8') : 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? (dk ? '#0F172A' : '#FAFAF8') : 'transparent')}
                    onClick={() => onOpen(lead)}>

                    {/* Name */}
                    <td style={{ padding: '11px 14px', minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {initials(lead.contact_name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>{(lead as any).property_address ? (lead as any).property_address.replace(/, USA$/, '') : capName(lead.contact_name)}</div>
                          <div style={{ fontSize: 12, color: t.textSubtle }}>{(lead as any).property_address ? capName(lead.contact_name) : (lead.contact_phone || '')}</div>
                        </div>
                      </div>
                    </td>

                    {/* Stage */}
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: stageStyle(stage.key, dk).bg, color: stageStyle(stage.key, dk).color, whiteSpace: 'nowrap' }}>
                        {stage.label}
                      </span>
                    </td>

                    {/* Age */}
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: urgBg, color: urgency }}>{days}d</span>
                    </td>

                    {/* Value */}
                    <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 700, color: lead.quoted_amount ? '#0F766E' : (t.inputBorder) }}>
                      {lead.quoted_amount ? `${fmtCurrency(lead.quoted_amount)}` : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {lead.contact_phone && (
                          <a href={`tel:${lead.contact_phone}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: T.radSm, background: '#F0FDFA', color: '#0F766E', border: '1px solid #CCFBF1', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={11} c="#0F766E" />
                            Call
                          </a>
                        )}
                        <button onClick={() => onOpen(lead)}
                          style={{ padding: '5px 10px', borderRadius: T.radSm, background: t.cardBorder, color: t.textBody, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Open →
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
function LeadQuickView({ leadId, onClose, onFullDetail, stages = getPipelineStages(null), dk = false }: {
  leadId: string
  onClose: () => void
  onFullDetail: () => void
  stages?: PipelineStage[]
  dk?: boolean
}) {
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('pg_pro') : null
    const session = raw ? JSON.parse(raw) : null
    if (!session) return
    fetch(`/api/leads/${leadId}?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => { setLead(d.lead); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leadId])

  async function saveNote() {
    if (!note.trim()) return
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('pg_pro') : null
    const session = raw ? JSON.parse(raw) : null
    if (!session) return
    setSavingNote(true)
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id, notes: (lead?.notes ? lead.notes + '\n' : '') + note }),
      })
      setNote('')
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
    } finally { setSavingNote(false) }
  }

  const stage = lead ? stages.find(s => s.key === lead.lead_status) || stages[0] : stages[0]
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E5E7EB', '#6B7280']
  const days = lead ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000) : 0

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="flex-1" />
      <div
        style={{ display: "flex", flexDirection: "column" as const, height: "100%", background: theme(dk).cardBg, boxShadow: "4px 0 40px rgba(0,0,0,0.2)", overflowY: "auto" as const, width: "100%", maxWidth: 380, borderLeft: `4px solid ${stageStyle(stage.key).color}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${theme(dk).cardBorder}`, background: stageStyle(stage.key, dk).bg, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {lead ? initials(lead.contact_name) : '…'}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{lead ? capName(lead.contact_name) : '…'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: stageStyle(stage.key).color, color: 'white' }}>{stage.label}</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{days}d ago</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
          </div>
          {/* Quick action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {lead?.contact_phone && (
              <a href={`tel:${lead.contact_phone}`} onClick={e => e.stopPropagation()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, background: theme(dk).cardBgAlt, border: `1.5px solid ${theme(dk).cardBorder}`, fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                Call
              </a>
            )}
            <button onClick={onFullDetail}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, background: 'linear-gradient(135deg,#0F766E,#0D9488)', border: 'none', fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
              Open Full Detail
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 48, borderRadius: 10, background: theme(dk).cardBgAlt, animation: 'pulse 1.5s infinite' }} />)}
          </div>
        ) : lead ? (
          <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact info */}
            <div style={{ background: theme(dk).cardBgAlt, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lead.contact_phone && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#6B7280' }}>Phone</span>
                    <a href={`tel:${lead.contact_phone}`} style={{ color: '#0F766E', fontWeight: 600, textDecoration: 'none' }}>{lead.contact_phone}</a>
                  </div>
                )}
                {lead.contact_email && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#6B7280' }}>Email</span>
                    <span style={{ color: '#111827', fontWeight: 500 }}>{lead.contact_email}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: '#6B7280' }}>Source</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{(lead.lead_source || 'Unknown').replace(/_/g,' ')}</span>
                </div>
                {lead.quoted_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#6B7280' }}>Quote</span>
                    <span style={{ color: '#0F766E', fontWeight: 700 }}>${lead.quoted_amount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Message */}
            {lead.message && (
              <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '14px 16px', border: '1px solid #FDE68A' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Message</div>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>{lead.message}</p>
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div style={{ background: '#F0FDFA', borderRadius: 12, padding: '14px 16px', border: '1px solid #CCFBF1' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Notes</div>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{lead.notes}</p>
              </div>
            )}

            {/* Quick note */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Add Note</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Type a quick note…"
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 14, color: '#111827', background: theme(dk).inputBg, outline: 'none', resize: 'none' as const, lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <button
                onClick={saveNote}
                disabled={!note.trim() || savingNote}
                style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: note.trim() ? 'linear-gradient(135deg,#0F766E,#0D9488)' : '#E5E7EB', color: note.trim() ? 'white' : '#9CA3AF', fontSize: 14, fontWeight: 700, cursor: note.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                {noteSaved ? '✓ Saved' : savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>

          </div>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Failed to load lead</div>
        )}
      </div>
    </div>
  )
}


function SlidePanel({ stage, leads, onClose, onOpen, dk = false }: {
  stage: PipelineStage
  leads: Lead[]
  onClose: () => void
  onOpen: (lead: Lead) => void
  dk?: boolean
}) {
  const [search, setSearch] = useState('')
  const filtered = leads.filter(l =>
    l.contact_name.toLowerCase().includes(search.toLowerCase()) ||
    l.message.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '80vh', borderTop: `4px solid ${stageStyle(stage.key).color}` }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ background: stageStyle(stage.key, dk).bg, borderBottom: `1px solid ${stageStyle(stage.key, dk).color}22` }}>
          <div>
            <div className="text-[14px] font-bold" style={{ color: stageStyle(stage.key).color }}>
              {stage.label} · {leads.length} leads
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>Tap a lead to open</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-gray-400 hover:text-gray-700 hover:bg-black/5 text-xl">×</button>
        </div>
        {/* Search */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
            <Ic d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" s={14} c="#9CA3AF" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="flex-1 bg-transparent text-[13px] outline-none text-gray-700"
              autoFocus />
          </div>
        </div>
        {/* Lead list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-center py-6 text-[13px] text-gray-400">No leads match</p>
          ) : filtered.map((lead, i) => {
            const [bg, fg] = avatarColor(lead.contact_name)
            const days = daysSince(lead.created_at)
            const urgBg    = days > 3 ? '#FEE2E2' : '#FEF3C7'
            const urgColor = days > 3 ? '#DC2626' : '#B45309'
            return (
              <div key={lead.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                style={{ background: i % 2 === 1 ? '#F9F8F6' : 'transparent' }}>
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: bg, color: fg }}>
                  {initials(lead.contact_name)}
                </div>
                {/* Name + time */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { onClose(); onOpen(lead) }}>
                  <div className="text-[14px] font-semibold truncate" style={{ color: '#111827' }}>{capName(lead.contact_name)}</div>
                  <div className="text-[12px] text-gray-400">{timeAgo(lead.created_at)}</div>
                </div>
                {/* Age badge */}
                {!lead.quoted_amount && (
                  <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                    style={{ background: urgBg, color: urgColor }}>{days}d</span>
                )}
                {lead.quoted_amount ? (
                  <span className="text-[12px] font-bold flex-shrink-0" style={{ color: stageStyle(stage.key).color }}>
                    ${lead.quoted_amount.toLocaleString()}
                  </span>
                ) : null}
                {/* Inline actions */}
                <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {lead.contact_phone && (
                    <a href={`tel:${lead.contact_phone}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: T.radSm, background: '#F0FDFA', color: '#0F766E', border: '1px solid #CCFBF1', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                      <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={10} c="#0F766E" />
                      Call
                    </a>
                  )}
                  <button onClick={() => { onClose(); onOpen(lead) }}
                    style={{ padding: '4px 9px', borderRadius: T.radSm, background: '#F3F4F6', color: '#374151', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Open →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Pipeline column ────────────────────────────────────────────────────────────
function PipelineColumn({ stage, leads, onOpen, dk = false, onStatusChange }: {
  stage: PipelineStage
  leads: Lead[]
  onOpen: (lead: Lead) => void
  dk?: boolean
  onStatusChange?: (leadId: string, status: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [showSlide, setShowSlide] = useState(false)
  const t = theme(dk)
  const colValue = leads.reduce((s, l) => s + (l.quoted_amount || 0), 0)
  const visibleLeads = expanded ? leads : leads.slice(0, 3)
  const overflow = leads.length - 3
  const emptyBorder = t.cardBorder
  const emptyText   = t.inputBorder

  return (
    <>
      {showSlide && leads.length > 3 && (
        <SlidePanel
          stage={stage}
          leads={leads.slice(3)}
          onClose={() => setShowSlide(false)}
          onOpen={onOpen}
        />
      )}
      <div className="flex flex-col min-w-0" style={{
        minWidth: 280,
        width: 280,
        background: dk ? '#151E2D' : '#FFFFFF',
        borderRadius: 16,
        border: `1px solid ${dk ? '#1E293B' : '#E2E8F0'}`,
        boxShadow: dk ? 'none' : '0 1px 6px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* 2px top accent bar */}
        <div style={{ height: 3, background: stage.color, flexShrink: 0 }} />

        {/* Column header */}
        <div style={{
          background: dk ? '#151E2D' : '#FAFAFA',
          borderBottom: `1px solid ${dk ? '#1E293B' : '#F1F5F9'}`,
          padding: '12px 14px 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            {/* Stage name + bubble */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.textPri, letterSpacing: '-0.01em' }}>
                {stage.label}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: '1px 7px', borderRadius: 20,
                background: leads.length > 0 ? stage.color : (dk ? '#1E293B' : '#E2E8F0'),
                color: leads.length > 0 ? '#fff' : t.textSubtle,
              }}>
                {leads.length}
              </span>
            </div>
            {/* Column total */}
            {colValue > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>
                ${colValue.toLocaleString()}
              </span>
            )}
          </div>
          {/* Meta line */}
          <div style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>
            {leads.length === 0
              ? 'No leads'
              : `${leads.length} lead${leads.length!==1?'s':''} · avg ${(leads.reduce((s,l) => s+(Date.now()-new Date(l.created_at).getTime())/86400000,0)/leads.length).toFixed(1)}d`}
          </div>
        </div>

        {/* Cards area */}
        <div style={{ padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleLeads.map(lead => (
            <div key={lead.id}>
              <LeadCard lead={lead} stage={stage} onOpen={() => onOpen(lead)} dk={dk} onStatusChange={onStatusChange} />
            </div>
          ))}
          {!expanded && overflow > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setExpanded(true)}
                style={{ flex:1, padding:'7px 0', fontSize:12, fontWeight:600, borderRadius:8, cursor:'pointer',
                  borderColor: stageStyle(stage.key,dk).color+'44', color:stageStyle(stage.key,dk).color,
                  background:stageStyle(stage.key,dk).bg, border:`1px solid ${stageStyle(stage.key,dk).color}44` }}>
                + {overflow} more ∨
              </button>
              <button onClick={() => setShowSlide(true)}
                style={{ width:32, height:32, borderRadius:8, cursor:'pointer', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  borderColor:stageStyle(stage.key,dk).color+'44', color:stageStyle(stage.key,dk).color,
                  background:stageStyle(stage.key,dk).bg, border:`1px solid ${stageStyle(stage.key,dk).color}44` }}>
                <Ic d="M9 18l6-6-6-6" s={13} c={stageStyle(stage.key).color} />
              </button>
            </div>
          )}
          {expanded && (
            <button onClick={() => setExpanded(false)}
              style={{ width:'100%', padding:'7px 0', fontSize:12, fontWeight:600, borderRadius:8, cursor:'pointer',
                borderColor:stageStyle(stage.key,dk).color+'44', color:stageStyle(stage.key,dk).color,
                background:stageStyle(stage.key,dk).bg, border:`1px solid ${stageStyle(stage.key,dk).color}44` }}>
              Show less ∧
            </button>
          )}
        </div>

        {/* bottom padding */}
        <div style={{ height: 10 }} />
      </div>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LeadPipeline({ leads, onStatusChange, onUpdate, isPaid, tradeSlug, dk = false }: Props) {
  const router = useRouter()
  const t = theme(dk)
  const stages = getPipelineStages(tradeSlug)
  const [mobileStage, setMobileStage] = useState<StageKey>(() => stages[0]?.key ?? 'New')
  const [showLost, setShowLost] = useState(false)
  const [listView, setListView] = useState(false)
  const kanbanRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{startX:number;scrollLeft:number;isDragging:boolean}>({startX:0,scrollLeft:0,isDragging:false})
  const [scrollPct, setScrollPct] = useState(0)
  const [pillVisible, setPillVisible] = useState(false)
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onKanbanScroll() {
    const el = kanbanRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setScrollPct(max > 0 ? el.scrollLeft / max : 0)
    setPillVisible(true)
    if (pillTimer.current) clearTimeout(pillTimer.current)
    pillTimer.current = setTimeout(() => setPillVisible(false), 1800)
  }

  const onBoardMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = kanbanRef.current
    if (!el) return
    // Cards handle their own click — only drag from column bg / header / empty space
    if ((e.target as HTMLElement).closest('[data-card]')) return
    dragState.current = { startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, isDragging: false }
    // Prevent text selection while dragging
    const prevSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    el.style.cursor = 'grabbing'
    const onMove = (ev: MouseEvent) => {
      const walk = (ev.pageX - el.offsetLeft) - dragState.current.startX
      if (Math.abs(walk) > 3) {
        dragState.current.isDragging = true
        el.scrollLeft = dragState.current.scrollLeft - walk
      }
    }
    const onUp = () => {
      document.body.style.userSelect = prevSelect
      el.style.cursor = 'grab'
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  function openLead(lead: Lead) {
    router.push('/dashboard/pipeline/' + lead.id)
  }

  function leadsForStage(key: string) {
    const stageleads = leads.filter(l => l.lead_status === key)
    return stageleads.sort((a, b) => {
      // Scheduled stage (generic or roofing): soonest job date first
      if (key === 'Scheduled' || key === 'scheduled') {
        const da = a.scheduled_date ? new Date(a.scheduled_date).getTime() : Infinity
        const db = b.scheduled_date ? new Date(b.scheduled_date).getTime() : Infinity
        return da - db
      }
      // Job Won (generic=Paid, roofing=job_won): newest first
      if (key === 'Paid' || key === 'job_won') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      // All other active stages: oldest first — most urgent at top
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }

  // Terminal stages — lost + unqualified (roofing) or just Lost (generic)
  const terminalStageKeys = getTerminalStages(tradeSlug).map(s => s.key as string)
  const terminalKeys = new Set<string>([...terminalStageKeys, 'Lost', 'lost'])
  const lostLeads = leads.filter(l => terminalKeys.has(l.lead_status as string))

  return (
    <>
    {/* ── KPI Stats Bar — desktop only, computed from leads ── */}
    {(() => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      const activeLeads = leads.filter(l => !['job_won','Paid','lost','unqualified','Lost'].includes(l.lead_status))
      const pipelineVal = activeLeads.reduce((s,l) => s + (l.quoted_amount||0), 0)
      const wonThisMonth = leads.filter(l =>
        (l.lead_status === 'job_won' || l.lead_status === 'Paid') &&
        new Date((l as any).updated_at || l.created_at).getTime() >= monthStart
      )
      const wonVal = wonThisMonth.reduce((s,l) => s + (l.quoted_amount||0), 0)
      const avgAge = activeLeads.length
        ? (activeLeads.reduce((s,l) => s + (Date.now()-new Date(l.created_at).getTime())/86400000, 0) / activeLeads.length).toFixed(1)
        : '0'
      const totalThisMonth = leads.filter(l => new Date(l.created_at).getTime() >= monthStart).length
      const ageNum = parseFloat(String(avgAge))
      const kpis = [
        { label: 'Pipeline Value', value: pipelineVal > 0 ? `$${pipelineVal.toLocaleString()}` : '—',
          sub: `${activeLeads.length} active leads`, trend: `${activeLeads.length} active`, color: '#0F766E', icon: '💰' },
        { label: 'Won This Month', value: wonVal > 0 ? `$${wonVal.toLocaleString()}` : '—',
          sub: `${wonThisMonth.length} job${wonThisMonth.length!==1?'s':''}`, trend: `${wonThisMonth.length} job${wonThisMonth.length!==1?'s':''}`, color: '#047857', icon: '🏆' },
        { label: 'New This Month', value: String(totalThisMonth),
          sub: 'leads received', trend: 'leads received', color: '#1E40AF', icon: '📥' },
        { label: 'Avg Lead Age', value: ageNum < 1 ? '< 1d' : `${avgAge}d`,
          sub: 'active pipeline', trend: ageNum > 7 ? '⚠ Above target' : 'On track', color: ageNum > 7 ? '#92400E' : '#64748B', icon: '⏱' },
      ]
      return (
        <div className="hidden md:grid mb-4 gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {kpis.map(k => (
            <div key={k.label} style={{
              background: t.cardBg, border: `1px solid ${t.cardBorder}`,
              borderTop: `3px solid ${k.color}`,
              borderRadius: 14, padding: '16px 18px',
              boxShadow: dk ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
              display:'flex', alignItems:'flex-start', justifyContent:'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle,
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: t.textPri,
                  letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: k.trend?.startsWith('+') ? '#16A34A' : k.trend?.startsWith('-') ? '#DC2626' : t.textSubtle, fontWeight: 500 }}>
                  {k.trend || k.sub}
                </div>
              </div>
              <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
                background: dk ? '#1E293B' : '#F8FAFC',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                {k.icon}
              </div>
            </div>
          ))}
        </div>
      )
    })()}

    {/* ── List / Board toggle bar — desktop only ── */}
    <div className="hidden md:flex items-center gap-2 mb-3 px-1">
      <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: t.cardBorder }}>
        {([['board', 'Board'], ['list', 'List']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setListView(v === 'list')}
            className="px-4 py-1.5 text-[13px] font-semibold transition-all"
            style={{
              background: (v === 'list') === listView ? '#0F766E' : (t.cardBg),
              color: (v === 'list') === listView ? 'white' : (t.textMuted),
            }}>
            {label}
          </button>
        ))}
      </div>
      <span className="text-[12px]" style={{ color: t.textSubtle }}>
        {leads.length} lead{leads.length !== 1 ? 's' : ''}
      </span>
    </div>
      {/* ── Mobile tab strip ── */}
      <div className="md:hidden relative mb-3">
      <div className="flex gap-1 overflow-x-auto pb-1 px-4" style={{ scrollbarWidth: 'none' }}>
        {stages.map(s => {
          const cnt = leadsForStage(s.key).length
          const active = mobileStage === s.key
          return (
            <button key={s.key} onClick={() => setMobileStage(s.key as StageKey)}
              className="flex-shrink-0 px-4 py-2.5 rounded-full text-[13px] border transition-all"
              style={active
                ? { background: dk ? s.color + '1A' : s.bg, color: s.color, borderColor: s.color, fontWeight: 700, boxShadow: `0 0 0 1.5px ${s.color}` }
                : { background: dk ? 'rgba(255,255,255,0.04)' : '#F5F4F0', color: dk ? '#9CA3AF' : '#6B7280', borderColor: dk ? '#334155' : '#D1C9C0', fontWeight: 500 }}>
              {s.label} {cnt > 0 && <span style={{ fontWeight: active ? 800 : 600 }}>({cnt})</span>}
            </button>
          )
        })}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, #F5F4F0)' }} />
      </div>
      <div className="md:hidden space-y-2 px-4">
        {leadsForStage(mobileStage).length === 0
          ? <p className="text-center py-8 text-sm text-gray-500">No leads in {stages.find(s => s.key === mobileStage)?.label ?? mobileStage}</p>
          : leadsForStage(mobileStage).map(lead => {
              const stage = stages.find(s => s.key === lead.lead_status) || stages[0]
              return <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => openLead(lead)} dk={dk} onStatusChange={onStatusChange} /></div>
            })
        }
      </div>

      {/* ── Desktop list view ── */}
      {listView && (
        <div className="hidden md:block">
          <LeadListView leads={leads} onOpen={openLead} dk={dk} stages={stages} />
        </div>
      )}

      {/* ── Desktop: all stages, horizontal scroll — column count driven by trade config ── */}
      <div className={`${listView ? 'hidden' : 'hidden md:block'} relative`}>
        {/* Right fade — elegant scroll hint */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10"
          style={{ background: `linear-gradient(90deg, transparent, ${dk ? '#0E1118' : '#F5F4F0'})` }} />
        {/* Scroll position pill — always visible, shows position on load */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20"
          style={{ transform:'translateX(-50%)' }}>
          <div style={{ width:140, height:4, borderRadius:4,
            background: dk ? '#1E293B' : '#E2E8F0',
            position:'relative', overflow:'hidden' }}>
            <div style={{
              position:'absolute', top:0, height:'100%',
              width:`${Math.max(14, (1 - scrollPct) * 40 + 14)}%`,
              left:`${scrollPct * (100 - Math.max(14, (1 - scrollPct) * 40 + 14))}%`,
              borderRadius:4,
              background: dk ? '#475569' : '#94A3B8',
              transition:'left 100ms ease',
            }} />
          </div>
        </div>
        <div
          className="pg-kanban-scroll"
          style={{ overflowX:'auto', paddingBottom:16,
            scrollbarWidth:'none', msOverflowStyle:'none',
            cursor: 'grab' }}
          ref={kanbanRef}
          onMouseDown={onBoardMouseDown}
          onScroll={onKanbanScroll}>
          <style>{`.pg-kanban-scroll::-webkit-scrollbar{display:none}.pg-kanban-scroll:active{cursor:grabbing}`}</style>
          <div style={{ display:'flex', gap:12, minWidth: stages.length * 292,
            alignItems:'flex-start', paddingBottom:28, paddingRight:40 }}>
            {stages.map(stage => (
              <PipelineColumn key={stage.key} stage={stage} leads={leadsForStage(stage.key)} onOpen={lead => openLead(lead)} dk={dk} onStatusChange={onStatusChange} />
            ))}
          </div>
        </div>
      </div>

      {/* Lost leads — expandable */}
      {lostLeads.length > 0 && (
        <div className="mt-3 px-4">
          <button
            onClick={() => setShowLost(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[13px] font-medium transition-all"
            style={{ background: dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: t.textSubtle, border: `1px solid ${t.cardBorder}` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {showLost
                ? <polyline points="18 15 12 9 6 15"/>
                : <polyline points="6 9 12 15 18 9"/>}
            </svg>
            {showLost ? 'Hide' : `${lostLeads.length} lost lead${lostLeads.length !== 1 ? 's' : ''}`}
          </button>
          {showLost && (
            <div className="mt-2 space-y-2">
              {lostLeads.map(lead => {
                const [avBg, avFg] = avatarColor(lead.contact_name)
                return (
                  <div key={lead.id} className="rounded-xl overflow-hidden"
                    style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, opacity: 0.85 }}>
                    {/* Lead info row */}
                    <div className="flex items-center gap-2 px-4 py-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: avBg, color: avFg }}>
                        {initials(lead.contact_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold truncate" style={{ color: t.textBody }}>{capName(lead.contact_name)}</p>
                        <p className="text-[12px]" style={{ color: t.textSubtle }}>{timeAgo(lead.created_at)} · Lost</p>
                      </div>
                      <button onClick={() => openLead(lead)}
                        className="text-[12px] font-medium px-2 py-1 rounded-lg flex-shrink-0"
                        style={{ color: t.textSubtle, border: `1px solid ${t.cardBorder}`, background: 'transparent' }}>
                        Open
                      </button>
                    </div>
                    {/* Stage move actions — reopen to first two active stages */}
                    <div className="flex border-t" style={{ borderColor: t.cardBorder }}>
                      {(stages.slice(0, 2).map(s => s.key) as string[]).map((stageName, i) => (
                        <button key={stageName}
                          onClick={async () => { await onStatusChange(lead.id, stageName) }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-opacity hover:opacity-70"
                          style={{
                            background: 'transparent',
                            color: stages.find(s => s.key === stageName)?.color ?? '#6B7280',
                            borderRight: i === 0 ? `1px solid ${t.cardBorder}` : 'none',
                            borderTop: 'none', borderLeft: 'none', borderBottom: 'none',
                            cursor: 'pointer',
                          }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          Move to {stageName}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
