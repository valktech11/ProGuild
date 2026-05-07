'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Lead } from '@/types'
import { initials, avatarColor, timeAgo, capName } from '@/lib/utils'
import { stageStyle } from '@/lib/design'

// ── Stage definitions ──────────────────────────────────────────────────────────
export const PIPELINE_STAGES = [
  { key: 'New',       label: 'New',       subLabel: 'Not yet contacted',  nextLabel: 'Call' },
  { key: 'Contacted', label: 'Contacted', subLabel: 'In conversation',    nextLabel: 'Follow Up' },
  { key: 'Quoted',    label: 'Quoted',    subLabel: 'Proposal sent',      nextLabel: 'Send Estimate' },
  { key: 'Scheduled', label: 'Scheduled', subLabel: 'Job confirmed',      nextLabel: 'Job Day' },
  { key: 'Completed', label: 'Completed', subLabel: 'Job completed',      nextLabel: 'Generate Invoice' },
  { key: 'Paid',      label: 'Job Won',   subLabel: 'Payment received',   nextLabel: '✓ Job Won' },
] as const

type StageKey = typeof PIPELINE_STAGES[number]['key']

const STAGE_ORDER: Record<string, number> = {
  New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5, Lost: 6,
}

interface Props {
  leads: Lead[]
  onStatusChange: (leadId: string, status: string) => Promise<void>
  onUpdate: (leadId: string, fields: Partial<Lead>) => Promise<void>
  isPaid: boolean
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
function BackwardConfirm({ fromStage, toStage, isPaidMove, onConfirm, onCancel }: {
  fromStage: string; toStage: string; isPaidMove: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4 mx-auto">
          <Ic d="M12 9v4M12 16.5v1M2 12a10 10 0 1020 0 10 10 0 00-20 0" s={26} sw={2.2} c="#D97706" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Move back to {toStage}?</h3>
        <p className="text-sm text-gray-500 text-center mb-3">
          This lead is <span className="font-semibold text-gray-800">{fromStage}</span>. Moving it back is allowed but tracked.
        </p>
        {isPaidMove && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center mb-3">
            ⚠️ Moving a <strong>Job Won</strong> lead back will affect your revenue stats.
          </p>
        )}
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: '#0F766E' }}>Yes, move back</button>
        </div>
      </div>
    </div>
  )
}

// ── Lead detail modal ──────────────────────────────────────────────────────────
function LeadModal({ lead, onClose, onStatusChange, onUpdate }: {
  lead: Lead; onClose: () => void
  onStatusChange: (id: string, status: string) => Promise<void>
  onUpdate: (id: string, fields: Partial<Lead>) => Promise<void>
}) {
  const [notes, setNotes]         = useState(lead.notes || '')
  const [amount, setAmount]       = useState(lead.quoted_amount?.toString() || '')
  const [schedDate, setSchedDate] = useState(lead.scheduled_date || '')
  const [followUp, setFollowUp]   = useState(lead.follow_up_date || '')
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState(lead.lead_status)
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
      quoted_amount: amount ? parseFloat(amount) : null,
      scheduled_date: schedDate || null,
      follow_up_date: followUp || null,
      lead_status: status as StageKey,
    })
    setSaving(false)
    onClose()
  }

  const currentStage = PIPELINE_STAGES.find(s => s.key === status)
  const currentStageSS = stageStyle(status)

  return (
    <>
      {pendingStage && (
        <BackwardConfirm
          fromStage={status} toStage={pendingStage} isPaidMove={status === 'Paid'}
          onConfirm={() => { setStatus(pendingStage as StageKey); setPendingStage(null) }}
          onCancel={() => setPendingStage(null)}
        />
      )}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
        <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>

          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #E5E7EB' }}>
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-xl font-bold text-gray-900">{lead.contact_name}</h2>
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
                  {PIPELINE_STAGES.map(s => (
                    <button key={s.key} onClick={() => handleStageClick(s.key)}
                      className="py-2.5 rounded-xl text-xs font-bold border-2 transition-all"
                      style={status === s.key
                        ? { background: stageStyle(s.key).bg, color: stageStyle(s.key).color, borderColor: stageStyle(s.key).color }
                        : { background: 'white', color: '#6B7280', borderColor: '#E5E7EB' }}>
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
  stage: typeof PIPELINE_STAGES[number]
  onOpen: () => void
  dk?: boolean
  onStatusChange?: (leadId: string, status: string) => Promise<void>
}) {
  const router = useRouter()
  const [bg, fg] = avatarColor(lead.contact_name)
  const days     = daysSince(lead.created_at)
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

  const primaryLabel =
    stage.key === 'New'       ? 'Mark Contacted' :
    stage.key === 'Contacted' ? 'Send Estimate' :
    stage.key === 'Quoted'    ? (creatingEst ? 'Opening…' : 'Estimate →') :
    stage.key === 'Scheduled' ? 'View Job' :
    stage.key === 'Completed' ? 'Invoice' :
    stage.key === 'Paid'      ? '✓ Won' : 'Open'

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
  const ageBg   = urgency === 'high' ? '#FEE2E2' : urgency === 'mid' ? '#FEF3C7' : '#D1FAE5'
  const ageColor= urgency === 'high' ? '#DC2626' : urgency === 'mid' ? '#B45309' : '#065F46'

  return (
    <>
    <div
      onClick={onOpen}
      className="rounded-xl cursor-pointer transition-all active:scale-[0.98]"
      style={{
        border: `1px solid ${dk ? stageStyle(stage.key).color + '33' : stageStyle(stage.key).color + '22'}`,
        borderLeft: `3px solid ${stageStyle(stage.key).color}`,
        padding: '10px 12px',
        background: dk ? '#1E293B' : 'white',
        boxShadow: dk ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = dk ? '0 0 0 1px rgba(15,118,110,0.3)' : '0 3px 10px rgba(0,0,0,0.09)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = dk ? 'none' : '0 1px 3px rgba(0,0,0,0.05)')}>

      {/* Row 1: avatar + name + age */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{ background: bg, color: fg }}>
          {initials(lead.contact_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold truncate leading-tight" style={{ color: dk ? '#F1F5F9' : '#111827' }}>
            {capName(lead.contact_name)}
          </p>
          {lead.quoted_amount ? (
            <p className="text-[11px] font-bold" style={{ color: '#0F766E' }}>${lead.quoted_amount.toLocaleString()}</p>
          ) : (
            <p className="text-[11px]" style={{ color: dk ? '#64748B' : '#9CA3AF' }}>{timeAgo(lead.created_at)}</p>
          )}
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
          style={{ background: ageBg, color: ageColor }}>
          {days}d
        </span>
      </div>

      {/* Row 2: action buttons — always visible, never hidden */}
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {/* Call button — if phone exists */}
        {lead.contact_phone ? (
          <a href={`tel:${lead.contact_phone}`}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: '#F0FDFA', color: '#0F766E', border: '1px solid #CCFBF1' }}>
            <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={11} c="#0F766E" />
            Call
          </a>
        ) : (
          <button onClick={e => { e.stopPropagation(); onOpen() }}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: dk ? '#334155' : '#F9FAFB', color: dk ? '#94A3B8' : '#6B7280', border: `1px solid ${dk ? '#475569' : '#E5E7EB'}` }}>
            <Ic d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M21 15v2M21 19v2M24 17h-6" s={11} c={dk ? '#94A3B8' : '#6B7280'} />
            Add Phone
          </button>
        )}

        {/* Primary stage action — smart, not duplicate of Call */}
        <button
          onClick={handlePrimaryAction}
          disabled={creatingEst}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 min-w-0"
          style={{
            background: stageStyle(stage.key === 'New' ? 'Contacted' : stage.key).bg,
            color: stageStyle(stage.key === 'New' ? 'Contacted' : stage.key).color,
            border: `1px solid ${stageStyle(stage.key === 'New' ? 'Contacted' : stage.key).chipBg}`
          }}>
          {stage.key === 'New' && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
          )}
          {primaryLabel}
        </button>

        {/* Open detail arrow */}
        <button
          onClick={e => { e.stopPropagation(); onOpen() }}
          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
          style={{ background: dk ? '#334155' : '#F3F4F6', color: dk ? '#94A3B8' : '#6B7280' }}
          title="Open lead detail">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
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
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => { e.stopPropagation(); e.preventDefault() }}
          >
            <h3 className="font-bold text-gray-900 text-base mb-1">Active estimate exists</h3>
            <p className="text-sm text-gray-500 mb-4">
              An estimate already exists for <span className="font-semibold text-gray-700">{lead.contact_name}</span>. Open it or create a new version.
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
function LeadListView({ leads, onOpen, dk }: { leads: Lead[]; onOpen: (l: Lead) => void; dk: boolean }) {
  const router = useRouter()
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
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    color: sort === col ? '#0F766E' : (dk ? '#64748B' : '#9CA3AF'),
    cursor: 'pointer', padding: '10px 14px', whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  })

  const arrow = (col: typeof sort) => sort === col ? (asc ? ' ↑' : ' ↓') : ''

  return (
    <div style={{ background: dk ? '#1E293B' : 'white', borderRadius: 14, border: `1px solid ${dk ? '#334155' : '#E8E2D9'}`, overflow: 'hidden' }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${dk ? '#334155' : '#F3F4F6'}` }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${dk ? '#334155' : '#E8E2D9'}`, background: dk ? '#0F172A' : '#F9FAFB', color: dk ? '#F1F5F9' : '#111827', fontSize: 13, boxSizing: 'border-box' as const }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: dk ? '#64748B' : '#9CA3AF', fontSize: 14 }}>No leads match</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dk ? '#334155' : '#F3F4F6'}` }}>
                <th style={thStyle('name')}    onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
                <th style={thStyle('stage')}   onClick={() => toggleSort('stage')}>Stage{arrow('stage')}</th>
                <th style={thStyle('age')}     onClick={() => toggleSort('age')}>Age{arrow('age')}</th>
                <th style={thStyle('value')}   onClick={() => toggleSort('value')}>Value{arrow('value')}</th>
                <th style={{ ...thStyle('age'), cursor: 'default' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => {
                const stage = PIPELINE_STAGES.find(s => s.key === lead.lead_status) || PIPELINE_STAGES[0]
                const days  = daysSince(lead.created_at)
                const [avBg, avFg] = avatarColor(lead.contact_name)
                const urgency = days > 3 ? '#DC2626' : days >= 2 ? '#B45309' : '#059669'
                const urgBg   = days > 3 ? '#FEE2E2' : days >= 2 ? '#FEF3C7' : '#D1FAE5'

                return (
                  <tr key={lead.id}
                    style={{ borderBottom: `1px solid ${dk ? '#1E293B' : '#F9F8F6'}`, background: i % 2 === 1 ? (dk ? '#0F172A' : '#FAFAF8') : 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = dk ? '#1a2940' : '#F0FAFA')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? (dk ? '#0F172A' : '#FAFAF8') : 'transparent')}
                    onClick={() => onOpen(lead)}>

                    {/* Name */}
                    <td style={{ padding: '11px 14px', minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {initials(lead.contact_name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: dk ? '#F1F5F9' : '#111827' }}>{capName(lead.contact_name)}</div>
                          {lead.contact_phone && <div style={{ fontSize: 11, color: dk ? '#64748B' : '#9CA3AF' }}>{lead.contact_phone}</div>}
                        </div>
                      </div>
                    </td>

                    {/* Stage */}
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: stageStyle(stage.key).bg, color: stageStyle(stage.key).color, whiteSpace: 'nowrap' }}>
                        {stage.label}
                      </span>
                    </td>

                    {/* Age */}
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: urgBg, color: urgency }}>{days}d</span>
                    </td>

                    {/* Value */}
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: lead.quoted_amount ? '#0F766E' : (dk ? '#475569' : '#D1D5DB') }}>
                      {lead.quoted_amount ? `$${lead.quoted_amount.toLocaleString()}` : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {lead.contact_phone && (
                          <a href={`tel:${lead.contact_phone}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, background: '#F0FDFA', color: '#0F766E', border: '1px solid #CCFBF1', fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={11} c="#0F766E" />
                            Call
                          </a>
                        )}
                        <button onClick={() => onOpen(lead)}
                          style={{ padding: '5px 10px', borderRadius: 7, background: dk ? '#334155' : '#F3F4F6', color: dk ? '#CBD5E1' : '#374151', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
function LeadQuickView({ leadId, onClose, onFullDetail }: {
  leadId: string
  onClose: () => void
  onFullDetail: () => void
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

  const stage = lead ? PIPELINE_STAGES.find(s => s.key === lead.lead_status) || PIPELINE_STAGES[0] : PIPELINE_STAGES[0]
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E5E7EB', '#6B7280']
  const days = lead ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000) : 0

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="flex-1" />
      <div
        className="flex flex-col h-full bg-white shadow-2xl overflow-y-auto"
        style={{ width: '100%', maxWidth: 380, borderLeft: `4px solid ${stageStyle(stage.key).color}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F3F4F6', background: stageStyle(stage.key).bg, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {lead ? initials(lead.contact_name) : '…'}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{lead ? capName(lead.contact_name) : '…'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: stageStyle(stage.key).color, color: 'white' }}>{stage.label}</span>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>{days}d ago</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
          </div>
          {/* Quick action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {lead?.contact_phone && (
              <a href={`tel:${lead.contact_phone}`} onClick={e => e.stopPropagation()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, background: 'white', border: '1.5px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#374151', textDecoration: 'none', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                Call
              </a>
            )}
            <button onClick={onFullDetail}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, background: 'linear-gradient(135deg,#0F766E,#0D9488)', border: 'none', fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
              Open Full Detail
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 48, borderRadius: 10, background: '#F3F4F6', animation: 'pulse 1.5s infinite' }} />)}
          </div>
        ) : lead ? (
          <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact info */}
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lead.contact_phone && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6B7280' }}>Phone</span>
                    <a href={`tel:${lead.contact_phone}`} style={{ color: '#0F766E', fontWeight: 600, textDecoration: 'none' }}>{lead.contact_phone}</a>
                  </div>
                )}
                {lead.contact_email && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6B7280' }}>Email</span>
                    <span style={{ color: '#111827', fontWeight: 500 }}>{lead.contact_email}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>Source</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{(lead.lead_source || 'Unknown').replace(/_/g,' ')}</span>
                </div>
                {lead.quoted_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6B7280' }}>Quote</span>
                    <span style={{ color: '#0F766E', fontWeight: 700 }}>${lead.quoted_amount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Message */}
            {lead.message && (
              <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '14px 16px', border: '1px solid #FDE68A' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Message</div>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{lead.message}</p>
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div style={{ background: '#F0FDFA', borderRadius: 12, padding: '14px 16px', border: '1px solid #CCFBF1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Notes</div>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{lead.notes}</p>
              </div>
            )}

            {/* Quick note */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Add Note</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Type a quick note…"
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13, color: '#111827', background: 'white', outline: 'none', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <button
                onClick={saveNote}
                disabled={!note.trim() || savingNote}
                style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: note.trim() ? 'linear-gradient(135deg,#0F766E,#0D9488)' : '#E5E7EB', color: note.trim() ? 'white' : '#9CA3AF', fontSize: 13, fontWeight: 700, cursor: note.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                {noteSaved ? '✓ Saved' : savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>

          </div>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Failed to load lead</div>
        )}
      </div>
    </div>
  )
}


function SlidePanel({ stage, leads, onClose, onOpen }: {
  stage: typeof PIPELINE_STAGES[number]
  leads: Lead[]
  onClose: () => void
  onOpen: (lead: Lead) => void
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
          style={{ background: stageStyle(stage.key).bg, borderBottom: `1px solid ${stageStyle(stage.key).color}22` }}>
          <div>
            <div className="text-[14px] font-bold" style={{ color: stageStyle(stage.key).color }}>
              {stage.label} · {leads.length} leads
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: '#6B7280' }}>Tap a lead to open</div>
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
                  <div className="text-[13px] font-semibold truncate" style={{ color: '#111827' }}>{capName(lead.contact_name)}</div>
                  <div className="text-[11px] text-gray-400">{timeAgo(lead.created_at)}</div>
                </div>
                {/* Age badge */}
                {!lead.quoted_amount && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
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
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: 7, background: '#F0FDFA', color: '#0F766E', border: '1px solid #CCFBF1', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                      <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={10} c="#0F766E" />
                      Call
                    </a>
                  )}
                  <button onClick={() => { onClose(); onOpen(lead) }}
                    style={{ padding: '4px 9px', borderRadius: 7, background: '#F3F4F6', color: '#374151', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
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
  stage: typeof PIPELINE_STAGES[number]
  leads: Lead[]
  onOpen: (lead: Lead) => void
  dk?: boolean
  onStatusChange?: (leadId: string, status: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [showSlide, setShowSlide] = useState(false)
  const colValue = leads.reduce((s, l) => s + (l.quoted_amount || 0), 0)
  const visibleLeads = expanded ? leads : leads.slice(0, 3)
  const overflow = leads.length - 3
  const emptyBorder = dk ? '#334155' : '#E8E2D9'
  const emptyText   = dk ? '#475569' : '#D1D5DB'

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
      <div className="flex flex-col min-w-0" style={{ minWidth: 220 }}>
        {/* Column header */}
        <div className="rounded-xl px-3 py-2.5 mb-2" style={{
          background: stage.key === 'Paid' ? (dk ? 'rgba(74,123,74,0.20)' : 'rgba(74,123,74,0.12)') : (dk ? stageStyle(stage.key).bg.replace(')', ',0.15)').replace('rgb','rgba') : stageStyle(stage.key).bg),
          borderTop: `3px solid ${stageStyle(stage.key).color}`
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold" style={{ color: stageStyle(stage.key).color }}>
                {stage.label}
              </span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: stageStyle(stage.key).color, color: 'white' }}>
                {leads.length}
              </span>
            </div>
            {colValue > 0 && (
              <span className="text-[12px] font-bold" style={{ color: stageStyle(stage.key).color }}>
                ${colValue.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-2 flex-1">
          {leads.length === 0 ? (
            <div className="flex items-center justify-center py-8 rounded-xl text-[12px]"
              style={{ border: `1.5px dashed ${emptyBorder}`, color: emptyText }}>
              Empty
            </div>
          ) : (
            <>
              {visibleLeads.map(lead => (
                <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => onOpen(lead)} dk={dk} onStatusChange={onStatusChange} /></div>
              ))}
              {!expanded && overflow > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => setExpanded(true)}
                    className="flex-1 py-2 text-[12px] font-semibold rounded-xl border transition-colors hover:opacity-80"
                    style={{ borderColor: stageStyle(stage.key).color + '44', color: stageStyle(stage.key).color, background: stageStyle(stage.key).bg }}>
                    + {overflow} more leads ∨
                  </button>
                  {leads.length > 3 && (
                    <button onClick={() => setShowSlide(true)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border transition-colors hover:opacity-80 flex-shrink-0"
                      style={{ borderColor: stageStyle(stage.key).color + '44', color: stageStyle(stage.key).color, background: stageStyle(stage.key).bg }}>
                      <Ic d="M9 18l6-6-6-6" s={14} c={stageStyle(stage.key).color} />
                    </button>
                  )}
                </div>
              )}
              {expanded && (
                <button onClick={() => setExpanded(false)}
                  className="w-full py-2 text-[12px] font-semibold rounded-xl border transition-colors hover:opacity-80"
                  style={{ borderColor: stageStyle(stage.key).color + '44', color: stageStyle(stage.key).color, background: stageStyle(stage.key).bg }}>
                  Show less ∧
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LeadPipeline({ leads, onStatusChange, onUpdate, isPaid, dk = false }: Props) {
  const router = useRouter()
  const [mobileStage, setMobileStage] = useState<StageKey>('New')
  const [showLost, setShowLost] = useState(false)
  const [listView, setListView] = useState(false)

  function openLead(lead: Lead) {
    router.push('/dashboard/pipeline/' + lead.id)
  }

  function leadsForStage(key: string) {
    const stageleads = leads.filter(l => l.lead_status === key)
    return stageleads.sort((a, b) => {
      // Scheduled: soonest job date first
      if (key === 'Scheduled') {
        const da = a.scheduled_date ? new Date(a.scheduled_date).getTime() : Infinity
        const db = b.scheduled_date ? new Date(b.scheduled_date).getTime() : Infinity
        return da - db
      }
      // Job Won (Paid): newest first — celebrate recent wins at top
      if (key === 'Paid') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      // All active stages (New, Contacted, Quoted, Completed): oldest first — most urgent
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }

  const lostLeads = leads.filter(l => l.lead_status === 'Lost')

  return (
    <>
    {/* ── List / Board toggle bar — desktop only ── */}
    <div className="hidden md:flex items-center gap-2 mb-3 px-1">
      <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: dk ? '#334155' : '#E8E2D9' }}>
        {([['board', 'Board'], ['list', 'List']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setListView(v === 'list')}
            className="px-4 py-1.5 text-[13px] font-semibold transition-all"
            style={{
              background: (v === 'list') === listView ? '#0F766E' : (dk ? '#1E293B' : 'white'),
              color: (v === 'list') === listView ? 'white' : (dk ? '#94A3B8' : '#6B7280'),
            }}>
            {label}
          </button>
        ))}
      </div>
      <span className="text-[12px]" style={{ color: dk ? '#64748B' : '#9CA3AF' }}>
        {leads.length} lead{leads.length !== 1 ? 's' : ''}
      </span>
    </div>
      {/* ── Mobile tab strip ── */}
      <div className="md:hidden relative mb-3">
      <div className="flex gap-1 overflow-x-auto pb-1 px-4" style={{ scrollbarWidth: 'none' }}>
        {PIPELINE_STAGES.map(s => {
          const cnt = leadsForStage(s.key).length
          return (
            <button key={s.key} onClick={() => setMobileStage(s.key as StageKey)}
              className="flex-shrink-0 px-4 py-2.5 rounded-full text-[13px] font-bold border transition-all"
              style={mobileStage === s.key
                ? { background: stageStyle(s.key).bg, color: stageStyle(s.key).color, borderColor: stageStyle(s.key).color }
                : { background: 'white', color: '#374151', borderColor: '#C8C3BC' }}>
              {s.label} {cnt > 0 && `(${cnt})`}
            </button>
          )
        })}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, #F5F4F0)' }} />
      </div>
      <div className="md:hidden space-y-2 px-4">
        {leadsForStage(mobileStage).length === 0
          ? <p className="text-center py-8 text-sm text-gray-500">No leads in {mobileStage}</p>
          : leadsForStage(mobileStage).map(lead => {
              const stage = PIPELINE_STAGES.find(s => s.key === lead.lead_status) || PIPELINE_STAGES[0]
              return <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => openLead(lead)} dk={dk} onStatusChange={onStatusChange} /></div>
            })
        }
      </div>

      {/* ── Desktop list view ── */}
      {listView && (
        <div className="hidden md:block">
          <LeadListView leads={leads} onOpen={openLead} dk={dk} />
        </div>
      )}

      {/* ── Desktop: all 6 columns, horizontal scroll ── */}
      <div className={`${listView ? 'hidden' : 'hidden md:block'} overflow-x-auto pb-4`} style={{ scrollbarWidth: 'thin' }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', minWidth: 1320 }}>
          {PIPELINE_STAGES.map(stage => (
            <div key={stage.key}><PipelineColumn stage={stage} leads={leadsForStage(stage.key)} onOpen={lead => openLead(lead)} dk={dk} onStatusChange={onStatusChange} /></div>
          ))}
        </div>
      </div>

      {/* Lost leads — expandable */}
      {lostLeads.length > 0 && (
        <div className="mt-3 px-4">
          <button
            onClick={() => setShowLost(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[13px] font-medium transition-all"
            style={{ background: 'rgba(0,0,0,0.04)', color: '#6B7280', border: '1px solid #E5E7EB' }}>
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
                    style={{ background: dk ? '#1E293B' : 'white', border: '1px solid #E5E7EB', opacity: 0.85 }}>
                    {/* Lead info row */}
                    <div className="flex items-center gap-2 px-4 py-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: avBg, color: avFg }}>
                        {initials(lead.contact_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold truncate" style={{ color: dk ? '#F1F5F9' : '#374151' }}>{capName(lead.contact_name)}</p>
                        <p className="text-[11px]" style={{ color: dk ? '#64748B' : '#9CA3AF' }}>{timeAgo(lead.created_at)} · Lost</p>
                      </div>
                      <button onClick={() => openLead(lead)}
                        className="text-[11px] font-medium px-2 py-1 rounded-lg flex-shrink-0"
                        style={{ color: dk ? '#64748B' : '#9CA3AF', border: `1px solid ${dk ? '#334155' : '#E5E7EB'}`, background: 'transparent' }}>
                        Open
                      </button>
                    </div>
                    {/* Stage move actions */}
                    <div className="flex border-t" style={{ borderColor: dk ? '#334155' : '#F3F4F6' }}>
                      {(['New', 'Contacted'] as const).map((stageName, i) => (
                        <button key={stageName}
                          onClick={async () => { await onStatusChange(lead.id, stageName) }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-opacity hover:opacity-70"
                          style={{
                            background: 'transparent',
                            color: stageName === 'New' ? '#D97706' : '#2563EB',
                            borderRight: i === 0 ? `1px solid ${dk ? '#334155' : '#F3F4F6'}` : 'none',
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
