'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Lead } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

// ── Stage definitions ──────────────────────────────────────────────────────────
export const PIPELINE_STAGES = [
  { key: 'New',       label: 'New',       color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B', subLabel: 'Awaiting response',  nextLabel: 'Call',          nextColor: '#D97706', nextBg: '#FEF3C7' },
  { key: 'Contacted', label: 'Contacted', color: '#2563EB', bg: '#EFF6FF', dot: '#3B82F6', subLabel: 'In conversation',    nextLabel: 'Follow Up',     nextColor: '#2563EB', nextBg: '#DBEAFE' },
  { key: 'Quoted',    label: 'Quoted',    color: '#7C3AED', bg: '#F5F3FF', dot: '#8B5CF6', subLabel: 'Proposal sent',      nextLabel: 'Send Estimate', nextColor: '#7C3AED', nextBg: '#EDE9FE' },
  { key: 'Scheduled', label: 'Scheduled', color: '#0F766E', bg: '#F0FDFA', dot: '#14B8A6', subLabel: 'Job confirmed',      nextLabel: 'Job Day',       nextColor: '#0F766E', nextBg: '#CCFBF1' },
  { key: 'Completed', label: 'Completed', color: '#374151', bg: '#F9FAFB', dot: '#6B7280', subLabel: 'Job completed',      nextLabel: 'Generate Invoice', nextColor: '#059669', nextBg: '#D1FAE5' },
  { key: 'Paid',      label: 'Paid',      color: 'white',   bg: '#4A7B4A', dot: 'white',   subLabel: 'Payment received',   nextLabel: 'Paid',          nextColor: '#059669', nextBg: '#DCFCE7' },
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
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// ── SVG icon helper ────────────────────────────────────────────────────────────
function Ic({ d, s = 14, sw = 1.6, c = 'currentColor' }: { d: string; s?: number; sw?: number; c?: string }) {
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
            ⚠️ Moving a <strong>Paid</strong> lead back will affect your revenue stats.
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
                style={{ background: currentStage?.bg, color: currentStage?.color }}>
                <div className="w-2 h-2 rounded-full" style={{ background: currentStage?.dot }} />
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
                        ? { background: s.bg, color: s.color, borderColor: s.color }
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
function LeadCard({ lead, stage, onOpen }: {
  lead: Lead
  stage: typeof PIPELINE_STAGES[number]
  onOpen: () => void
}) {
  const router = useRouter()
  const [bg, fg] = avatarColor(lead.contact_name)
  const days     = daysSince(lead.created_at)
  const [creatingEst, setCreatingEst] = useState(false)
  const [existingEst, setExistingEst] = useState<{ id: string; estimate_number: string; total: number; created_at: string } | null>(null)

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
        }),
      })
      const d = await r.json()
      if (d.existed) {
        // Show choice modal — don't navigate yet
        setExistingEst(d.estimate)
        setCreatingEst(false)
      } else if (d.estimate?.id) {
        router.push(`/dashboard/estimates/${d.estimate.id}`)
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
      // Pass force_new flag — bypass existing draft check
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:      session.id,
          lead_id:     lead.id,
          lead_name:   lead.contact_name,
          lead_source: lead.lead_source || '',
          trade:       session.trade    || '',
          force_new:   true,
        }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}`)
    } catch {
      setCreatingEst(false)
    }
  }

  return (
    <div onClick={onOpen}
      className="bg-white rounded-xl cursor-pointer hover:shadow-md active:scale-[0.98] transition-all"
      style={{
        border: `1px solid ${stage.color}22`,
        borderLeft: `4px solid ${stage.color}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        padding: '12px',
      }}>

      {/* Row 1: avatar + name + amount */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: bg, color: fg }}>
            {initials(lead.contact_name)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-900 truncate">{lead.contact_name}</p>
            <p className="text-[11px] text-gray-400">{timeAgo(lead.created_at)}</p>
          </div>
        </div>
        {lead.quoted_amount ? (
          <span className="text-[13px] font-bold flex-shrink-0" style={{ color: '#0F766E' }}>
            ${lead.quoted_amount.toLocaleString()}
          </span>
        ) : (
          <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
            style={{ background: days > 3 ? '#FEE2E2' : days >= 2 ? '#FEF3C7' : '#D1FAE5',
                     color: days > 3 ? '#B91C1C' : days >= 2 ? '#B45309' : '#065F46' }}>
            {days}d
          </span>
        )}
      </div>

      {/* Row 2: message */}
      <p className="text-[12px] text-gray-500 line-clamp-2 mb-2.5 leading-relaxed">{lead.message}</p>

      {/* Row 3: Next action pill */}
      <div className="flex items-center justify-between gap-2">
        {stage.key === 'Paid' ? (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 flex-shrink-0"
            style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            Paid
          </span>
        ) : stage.key === 'Completed' ? (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 flex-shrink-0"
            style={{ background: 'white', color: '#374151', border: '1px solid #E5E7EB' }}>
            <Ic d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" s={12} c="#374151" />
            Generate Invoice
          </span>
        ) : stage.key === 'Quoted' ? (
          <button
            onClick={openEstimate}
            disabled={creatingEst}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: stage.nextBg, color: stage.nextColor }}>
            {creatingEst ? 'Opening...' : 'Next: Send Estimate'}
          </button>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: stage.nextBg, color: stage.nextColor }}>
            Next: {stage.nextLabel}
            {stage.key === 'Scheduled' && lead.scheduled_date &&
              ` · ${new Date(lead.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </span>
        )}

        {/* Bottom icons */}
        <div className="flex items-center gap-1">
          {lead.contact_phone && (
            <a href={`tel:${lead.contact_phone}`} onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" s={14} c="#6B7280" />
            </a>
          )}
          <button onClick={e => { e.stopPropagation(); onOpen() }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <Ic d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" s={14} c="#6B7280" />
          </button>
          {/* Stage-aware 3rd icon */}
          {(stage.key === 'Scheduled' || stage.key === 'Paid') ? (
            <button onClick={e => { e.stopPropagation(); onOpen() }}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <Ic d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" s={14} c="#6B7280" />
            </button>
          ) : stage.key === 'Quoted' ? (
            <button onClick={openEstimate} disabled={creatingEst}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-purple-100 transition-colors disabled:opacity-40"
              title="Open Estimate">
              <Ic d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" s={14} c="#7C3AED" />
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onOpen() }}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <Ic d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" s={14} c="#6B7280" />
            </button>
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
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => { e.stopPropagation(); e.preventDefault() }}
          >
            <h3 className="font-bold text-gray-900 text-base mb-1">Estimate already exists</h3>
            <p className="text-sm text-gray-500 mb-4">
              A draft estimate was found for <span className="font-semibold text-gray-700">{lead.contact_name}</span>.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">#{existingEst.estimate_number}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Draft · {new Date(existingEst.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span className="text-sm font-bold text-[#0F766E]">
                ${existingEst.total.toLocaleString()}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={e => { e.stopPropagation(); e.preventDefault(); router.push(`/dashboard/estimates/${existingEst.id}`) }}
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
    </div>
  )
}

// ── Slide panel for overflow leads ─────────────────────────────────────────────
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
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="w-80 h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}
        style={{ borderLeft: `4px solid ${stage.color}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100"
          style={{ background: stage.bg }}>
          <div>
            <div className="text-[13px] font-bold" style={{ color: stage.key === 'Paid' ? 'white' : stage.color }}>
              More Leads – {stage.label} ({leads.length})
            </div>
            <div className="text-[11px] text-gray-500">Additional leads in this stage</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors text-gray-400 text-xl">×</button>
        </div>
        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
            <Ic d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" s={14} c="#9CA3AF" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="flex-1 bg-transparent text-[13px] outline-none text-gray-700" />
          </div>
        </div>
        {/* Lead list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {filtered.map(lead => {
            const [bg, fg] = avatarColor(lead.contact_name)
            return (
              <div key={lead.id} onClick={() => { onClose(); onOpen(lead) }}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-100">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: bg, color: fg }}>
                  {initials(lead.contact_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900 truncate">{lead.contact_name}</div>
                  <div className="text-[11px] text-gray-400">{timeAgo(lead.created_at)}</div>
                </div>
                {lead.quoted_amount && (
                  <span className="text-[12px] font-bold flex-shrink-0" style={{ color: stage.color }}>
                    ${lead.quoted_amount.toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold"
            style={{ background: stage.bg, color: stage.color }}>
            <Ic d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" s={14} c={stage.color} />
            View all leads
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pipeline column ────────────────────────────────────────────────────────────
function PipelineColumn({ stage, leads, onOpen }: {
  stage: typeof PIPELINE_STAGES[number]
  leads: Lead[]
  onOpen: (lead: Lead) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showSlide, setShowSlide] = useState(false)
  const colValue = leads.reduce((s, l) => s + (l.quoted_amount || 0), 0)
  const visibleLeads = expanded ? leads : leads.slice(0, 3)
  const overflow = leads.length - 3

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
        <div className="rounded-xl px-3 py-2.5 mb-2" style={{ background: stage.bg, borderTop: `3px solid ${stage.key === 'Paid' ? 'rgba(255,255,255,0.35)' : stage.key === 'Completed' ? '#9CA3AF' : stage.color}` }}>
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold" style={{ color: stage.color }}>
                {stage.label}
              </span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: stage.key === 'Paid' ? 'rgba(255,255,255,0.25)' : stage.color, color: stage.key === 'Paid' ? 'white' : 'white' }}>
                {leads.length}
              </span>
            </div>
            {colValue > 0 && (
              <span className="text-[12px] font-bold" style={{ color: stage.color }}>
                ${colValue.toLocaleString()}
              </span>
            )}
          </div>
          <div className="text-[11px]" style={{ color: stage.key === 'Paid' ? 'rgba(255,255,255,0.8)' : stage.color, opacity: stage.key === 'Paid' ? 1 : 0.8 }}>{stage.subLabel}</div>
        </div>

        {/* Cards */}
        <div className="space-y-2 flex-1">
          {leads.length === 0 ? (
            <div className="flex items-center justify-center py-8 rounded-xl text-[12px] text-gray-300"
              style={{ border: '1.5px dashed #E8E2D9' }}>
              Empty
            </div>
          ) : (
            <>
              {visibleLeads.map(lead => (
                <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => onOpen(lead)} /></div>
              ))}
              {!expanded && overflow > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => setExpanded(true)}
                    className="flex-1 py-2 text-[12px] font-semibold rounded-xl border transition-colors hover:opacity-80"
                    style={{ borderColor: stage.color + '44', color: stage.color, background: stage.bg }}>
                    + {overflow} more leads ∨
                  </button>
                  {leads.length > 3 && (
                    <button onClick={() => setShowSlide(true)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border transition-colors hover:opacity-80 flex-shrink-0"
                      style={{ borderColor: stage.color + '44', color: stage.color, background: stage.bg }}>
                      <Ic d="M9 18l6-6-6-6" s={14} c={stage.color} />
                    </button>
                  )}
                </div>
              )}
              {expanded && (
                <button onClick={() => setExpanded(false)}
                  className="w-full py-2 text-[12px] font-semibold rounded-xl border transition-colors hover:opacity-80"
                  style={{ borderColor: stage.color + '44', color: stage.color, background: stage.bg }}>
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
export default function LeadPipeline({ leads, onStatusChange, onUpdate }: Props) {
  const router = useRouter()
  const [mobileStage, setMobileStage] = useState<StageKey>('New')
  function openLead(lead: Lead) { router.push('/dashboard/pipeline/' + lead.id) }

  function leadsForStage(key: string) {
    return leads.filter(l => l.lead_status === key)
  }

  const lostLeads = leads.filter(l => l.lead_status === 'Lost')

  return (
    <>


      {/* ── Mobile tab strip ── */}
      <div className="md:hidden flex gap-1 mb-3 overflow-x-auto pb-1 px-4" style={{ scrollbarWidth: 'none' }}>
        {PIPELINE_STAGES.map(s => {
          const cnt = leadsForStage(s.key).length
          return (
            <button key={s.key} onClick={() => setMobileStage(s.key as StageKey)}
              className="flex-shrink-0 px-3 py-2 rounded-full text-xs font-bold border transition-all"
              style={mobileStage === s.key
                ? { background: s.bg, color: s.color, borderColor: s.color }
                : { background: 'white', color: '#6B7280', borderColor: '#E8E2D9' }}>
              {s.label} {cnt > 0 && `(${cnt})`}
            </button>
          )
        })}
      </div>
      <div className="md:hidden space-y-2 px-4">
        {leadsForStage(mobileStage).length === 0
          ? <p className="text-center py-8 text-sm text-gray-400">No leads in {mobileStage}</p>
          : leadsForStage(mobileStage).map(lead => {
              const stage = PIPELINE_STAGES.find(s => s.key === lead.lead_status) || PIPELINE_STAGES[0]
              return <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => openLead(lead)} /></div>
            })
        }
      </div>

      {/* ── Desktop: all 6 columns, horizontal scroll ── */}
      <div className="hidden md:block overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', minWidth: 1320 }}>
          {PIPELINE_STAGES.map(stage => (
            <div key={stage.key}><PipelineColumn stage={stage} leads={leadsForStage(stage.key)} onOpen={lead => openLead(lead)} /></div>
          ))}
        </div>
      </div>

      {/* Lost leads */}
      {lostLeads.length > 0 && (
        <div className="mt-3 text-center px-4">
          <span className="text-xs text-gray-400">
            {lostLeads.length} lead{lostLeads.length !== 1 ? 's' : ''} didn't proceed
          </span>
        </div>
      )}
    </>
  )
}
