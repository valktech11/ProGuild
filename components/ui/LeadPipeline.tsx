'use client'
import { useState } from 'react'
import { Lead } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

export const PIPELINE_STAGES = [
  { key: 'New',       label: 'New',       color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
  { key: 'Contacted', label: 'Contacted', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
  { key: 'Quoted',    label: 'Quoted',    color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
  { key: 'Scheduled', label: 'Scheduled', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
  { key: 'Completed', label: 'Completed', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
  { key: 'Paid',      label: 'Paid ✓',   color: '#059669', bg: '#D1FAE5', dot: '#059669' },
] as const

// Active stages shown on board. Completed + Paid are collapsed by default.
const ACTIVE_STAGES  = PIPELINE_STAGES.slice(0, 4)
const CLOSED_STAGES  = PIPELINE_STAGES.slice(4)

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

function DaysChip({ days }: { days: number }) {
  if (days < 1) return null
  const style =
    days > 3  ? { bg: '#FEE2E2', color: '#B91C1C' } :
    days >= 2 ? { bg: '#FEF3C7', color: '#B45309' } :
                { bg: '#D1FAE5', color: '#065F46' }
  return (
    <span
      className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: style.bg, color: style.color }}
      title={`${days} day${days !== 1 ? 's' : ''} since created`}
    >
      {days}d
    </span>
  )
}

// ── Backward move confirmation ─────────────────────────────────────────────────
function BackwardConfirm({ fromStage, toStage, isPaidMove, onConfirm, onCancel }: {
  fromStage: string
  toStage: string
  isPaidMove: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4 mx-auto">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round">
            <path d="M13 9v5M13 16.5v1" />
            <circle cx="13" cy="13" r="10.5" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
          Move back to {toStage}?
        </h3>
        <p className="text-sm text-gray-500 text-center leading-relaxed mb-3">
          This lead is <span className="font-semibold text-gray-800">{fromStage}</span>.
          Moving it back is allowed but tracked.
        </p>
        {isPaidMove && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center mb-3">
            ⚠️ This lead was marked <strong>Paid</strong>. Moving it back will affect your revenue stats.
          </p>
        )}
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel}
            className="flex-1 py-3.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>
            Yes, move back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead detail modal — field-optimised ───────────────────────────────────────
function LeadModal({ lead, onClose, onStatusChange, onUpdate }: {
  lead: Lead
  onClose: () => void
  onStatusChange: (id: string, status: string) => Promise<void>
  onUpdate: (id: string, fields: Partial<Lead>) => Promise<void>
}) {
  const [notes, setNotes]         = useState(lead.notes || '')
  const [amount, setAmount]       = useState(lead.quoted_amount?.toString() || '')
  const [schedDate, setSchedDate] = useState(lead.scheduled_date || '')
  const [followUp, setFollowUp]   = useState(lead.follow_up_date || '')
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState(lead.lead_status)
  const [pendingStage,       setPendingStage]       = useState<string | null>(null)
  const [showDidntProceed,   setShowDidntProceed]   = useState(false)

  function handleStageClick(newStage: string) {
    if (newStage === status) return
    const isBackward = (STAGE_ORDER[newStage] ?? 0) < (STAGE_ORDER[status] ?? 0)
    if (isBackward) setPendingStage(newStage)
    else setStatus(newStage as any)
  }

  function confirmBackward() {
    if (pendingStage) setStatus(pendingStage as any)
    setPendingStage(null)
  }

  async function save() {
    setSaving(true)
    await onUpdate(lead.id, {
      notes: notes || null,
      quoted_amount: amount ? parseFloat(amount) : null,
      scheduled_date: schedDate || null,
      follow_up_date: followUp || null,
      lead_status: status as any,
    })
    setSaving(false)
    onClose()
  }

  const currentStageInfo = PIPELINE_STAGES.find(s => s.key === status)

  return (
    <>
      {pendingStage && (
        <BackwardConfirm
          fromStage={status}
          toStage={pendingStage}
          isPaidMove={status === 'Paid'}
          onConfirm={confirmBackward}
          onCancel={() => setPendingStage(null)}
        />
      )}

      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.65)' }}
        onClick={onClose}
      >
        <div
          className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
          style={{ maxHeight: '92vh' }}
        >
          {/* ── Header — high contrast, large touch target ── */}
          <div className="flex items-start justify-between px-6 py-5"
            style={{ borderBottom: '1px solid #E5E7EB' }}>
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{lead.contact_name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {timeAgo(lead.created_at)} · {lead.lead_source?.replace(/_/g, ' ')}
              </p>
              {/* Current stage pill — large, immediately visible */}
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
                style={{ background: currentStageInfo?.bg, color: currentStageInfo?.color }}>
                <div className="w-2 h-2 rounded-full" style={{ background: currentStageInfo?.dot }} />
                {currentStageInfo?.label}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              style={{ fontSize: 22 }}
            >
              ×
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(92vh - 100px)' }}>
            <div className="px-6 py-5 space-y-6">

              {/* ── Request message — near-black, large ── */}
              <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1.5px solid #E5E7EB' }}>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Request</p>
                <p className="text-base font-medium leading-relaxed text-gray-900">{lead.message}</p>
              </div>

              {/* ── Contact buttons — 48px+ tap targets, primary action first ── */}
              <div className="flex gap-3">
                {lead.contact_phone && (
                  <a
                    href={`tel:${lead.contact_phone}`}
                    className="flex-1 flex items-center justify-center gap-2.5 py-4 rounded-2xl text-base font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M3 3.5C3 10.5 7.5 15 14.5 15l.5-3-3-1.5-1.5 2C8.5 12 6 9.5 5.5 8l2-1.5L6 3H3z"/>
                    </svg>
                    Call {lead.contact_name.split(' ')[0]}
                  </a>
                )}
                {lead.contact_email && (
                  <a
                    href={`mailto:${lead.contact_email}`}
                    className="flex-1 flex items-center justify-center gap-2.5 py-4 rounded-2xl text-base font-bold border-2 text-gray-800"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="2" y="4" width="14" height="10" rx="2"/>
                      <path d="M2 5.5l7 5 7-5"/>
                    </svg>
                    Email
                  </a>
                )}
              </div>

              {/* ── Pipeline stage — 2-col grid, 48px+ buttons ── */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Pipeline stage
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PIPELINE_STAGES.map(s => {
                    const isCurrent  = status === s.key
                    const isBackward = (STAGE_ORDER[s.key] ?? 0) < (STAGE_ORDER[status] ?? 0)
                    return (
                      <button
                        key={s.key}
                        onClick={() => handleStageClick(s.key)}
                        className="flex items-center justify-center gap-2 py-4 px-3 rounded-2xl text-sm font-bold border-2 transition-all"
                        style={isCurrent
                          ? { background: s.bg, color: s.color, borderColor: s.color }
                          : { background: 'white', color: '#374151', borderColor: '#E5E7EB' }
                        }
                      >
                        {isBackward && !isCurrent && (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M9 6.5H4M6.5 4L4 6.5l2.5 2.5"/>
                          </svg>
                        )}
                        {s.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  ← arrow = moving backward · will ask for confirmation
                </p>
              </div>

              {/* ── Quote amount — large input ── */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Quote amount</p>
                <div className="flex items-center border-2 rounded-2xl overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                  <span className="px-4 py-4 text-lg font-bold text-gray-400 bg-gray-50">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 px-4 py-4 text-lg font-bold outline-none bg-white text-gray-900"
                    style={{ minHeight: 56 }}
                  />
                </div>
              </div>

              {/* ── Dates — side by side ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Scheduled</p>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={e => setSchedDate(e.target.value)}
                    className="w-full px-4 py-4 text-sm font-semibold border-2 rounded-2xl outline-none text-gray-900"
                    style={{ borderColor: '#E5E7EB', minHeight: 56 }}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Follow-up</p>
                  <input
                    type="date"
                    value={followUp}
                    onChange={e => setFollowUp(e.target.value)}
                    className="w-full px-4 py-4 text-sm font-semibold border-2 rounded-2xl outline-none text-gray-900"
                    style={{ borderColor: '#E5E7EB', minHeight: 56 }}
                  />
                </div>
              </div>

              {/* ── Notes — large textarea ── */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Notes</p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Left voicemail, quoted $850, customer wants work done by Friday..."
                  rows={4}
                  className="w-full px-4 py-4 text-base border-2 rounded-2xl outline-none resize-none text-gray-900"
                  style={{ borderColor: '#E5E7EB' }}
                />
              </div>

              {/* ── Actions — full width, 56px height ── */}
              <div className="flex gap-3 pb-2">
                <button
                  onClick={() => setShowDidntProceed(true)}
                  className="flex-1 py-4 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Didn't proceed
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 py-4 rounded-2xl text-base font-bold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showDidntProceed && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowDidntProceed(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
              Mark as didn't proceed?
            </h3>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-2">
              <span className="font-semibold text-gray-800">{lead.contact_name}</span> will be moved out of your active pipeline.
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">
              You can still find them under <span className="font-semibold">Show closed</span> if you need them later.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDidntProceed(false)}
                className="flex-1 py-3.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDidntProceed(false)
                  await onStatusChange(lead.id, 'Lost')
                  onClose()
                }}
                className="flex-1 py-3.5 rounded-xl text-sm font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors">
                Yes, didn't proceed
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

// ── Paid review prompt ────────────────────────────────────────────────────────
function PaidPrompt({ lead, onDismiss }: { lead: Lead; onDismiss: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl border"
      style={{ background: '#F0FDFA', borderColor: '#0F766E33' }}>
      <span className="text-lg">⭐</span>
      <p className="text-sm font-medium text-gray-800 flex-1">
        Job marked paid — send <span className="font-bold">{lead.contact_name}</span> a review request?
      </p>
      {lead.contact_email && (
        <a
          href={`mailto:${lead.contact_email}?subject=How did we do?&body=Hi ${lead.contact_name.split(' ')[0]}, thanks for choosing us! We'd love a review on ProGuild: https://proguild.ai`}
          className="text-xs font-bold text-white px-3 py-2 rounded-full flex-shrink-0"
          style={{ background: '#0F766E' }}
          onClick={onDismiss}
        >
          Send
        </a>
      )}
      <button onClick={onDismiss} className="text-sm text-gray-400 hover:text-gray-600 px-1">Skip</button>
    </div>
  )
}

// ── Lead card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, stage, onOpen }: {
  lead: Lead
  stage: typeof PIPELINE_STAGES[number]
  onOpen: () => void
}) {
  const [bg, fg]  = avatarColor(lead.contact_name)
  const days      = daysSince(lead.created_at)
  const isOverdue = days > 3
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const followUpDue = lead.follow_up_date
    ? new Date(lead.follow_up_date) <= today : false

  return (
    <div
      onClick={onOpen}
      className="bg-white rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] transition-all p-3.5"
      style={{
        borderLeft: `4px solid ${stage.color}`,
        border: isOverdue
          ? '1.5px solid #FCA5A5'
          : `1px solid ${stage.color}33`,
        borderLeftWidth: 4,
        borderLeftColor: stage.color,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: bg, color: fg }}>
          {initials(lead.contact_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate text-gray-900">{lead.contact_name}</p>
          <p className="text-xs text-gray-400">{timeAgo(lead.created_at)}</p>
        </div>
        <DaysChip days={days} />
      </div>

      <p className="text-xs leading-relaxed line-clamp-2 mb-2.5 text-gray-600">{lead.message}</p>

      <div className="flex items-center gap-1.5 flex-wrap">
        {lead.contact_phone && (
          <a href={`tel:${lead.contact_phone}`} onClick={e => e.stopPropagation()}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-teal-50 transition-colors"
            style={{ color: '#0F766E' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2.5 2.5C2.5 8.5 5.5 11.5 11.5 11.5l.5-2.5-2.5-1L8.5 10C7 9.5 4.5 7 4 5.5l1.5-1L4 2H2.5z"/>
            </svg>
          </a>
        )}
        {lead.quoted_amount && (
          <span className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ background: '#F5F3FF', color: '#7C3AED' }}>
            ${lead.quoted_amount.toLocaleString()}
          </span>
        )}
        {lead.scheduled_date && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: '#F0FDFA', color: '#0F766E' }}>
            📅 {new Date(lead.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {followUpDue && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
            follow-up today
          </span>
        )}
        {lead.lead_source === 'Registry_Card' && (
          <span className="text-xs px-1.5 py-0.5 rounded ml-auto"
            style={{ background: '#FEF3C7', color: '#92400E' }}>Registry</span>
        )}
      </div>
    </div>
  )
}

// ── Pipeline header ───────────────────────────────────────────────────────────
function PipelineHeader({ leads }: { leads: Lead[] }) {
  const pipelineValue = leads
    .filter(l => l.quoted_amount && !['Lost', 'Archived'].includes(l.lead_status))
    .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const needAction = leads
    .filter(l => !['Paid', 'Lost', 'Archived'].includes(l.lead_status) && daysSince(l.created_at) > 3).length
  const newCount = leads.filter(l => l.lead_status === 'New').length

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-900">Lead Pipeline</span>
        {newCount > 0 && (
          <span className="w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {newCount > 9 ? '9+' : newCount}
          </span>
        )}
        {pipelineValue > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#F0FDFA', color: '#0F766E' }}>
            ${pipelineValue.toLocaleString()} in pipeline
          </span>
        )}
        {needAction > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#FEE2E2', color: '#B91C1C' }}>
            {needAction} need action
          </span>
        )}
      </div>
      <span className="text-xs font-medium px-2 py-1 rounded-lg"
        style={{ background: 'rgba(15,118,110,0.06)', color: '#0F766E' }}>
        Tap card to manage
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LeadPipeline({ leads, onStatusChange, onUpdate, isPaid }: Props) {
  const [selectedLead, setSelectedLead]     = useState<Lead | null>(null)
  const [mobileStage, setMobileStage]       = useState<StageKey>('New')
  const [paidPromptLead, setPaidPromptLead] = useState<Lead | null>(null)
  const [showClosed, setShowClosed]         = useState(false)

  function leadsForStage(stageKey: string) {
    return leads.filter(l => l.lead_status === stageKey)
  }

  async function handleStatusChange(leadId: string, status: string) {
    await onStatusChange(leadId, status)
    if (status === 'Paid') {
      const lead = leads.find(l => l.id === leadId)
      if (lead) setPaidPromptLead(lead)
    }
  }

  const closedCount = CLOSED_STAGES.reduce((n, s) => n + leadsForStage(s.key).length, 0)

  return (
    <>
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={async (id, status) => {
            await handleStatusChange(id, status)
            setSelectedLead(prev => prev ? { ...prev, lead_status: status as any } : null)
          }}
          onUpdate={async (id, fields) => {
            await onUpdate(id, fields)
            setSelectedLead(null)
          }}
        />
      )}

      <PipelineHeader leads={leads} />

      <div className="p-4">
        {paidPromptLead && (
          <PaidPrompt lead={paidPromptLead} onDismiss={() => setPaidPromptLead(null)} />
        )}

        {leads.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2 opacity-20">📬</div>
            <p className="text-sm font-medium text-gray-600 mb-1">No leads yet</p>
            <p className="text-xs">When someone contacts you, they'll appear here.</p>
          </div>
        ) : (
          <>
            {/* ── Mobile: tab strip + single column ── */}
            <div className="md:hidden flex gap-1 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
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
            <div className="md:hidden space-y-2">
              {leadsForStage(mobileStage).length === 0
                ? <p className="text-center py-8 text-sm text-gray-400">No leads in {mobileStage}</p>
                : leadsForStage(mobileStage).map(lead => {
                    const stage = PIPELINE_STAGES.find(s => s.key === lead.lead_status) || PIPELINE_STAGES[0]
                    return <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => setSelectedLead(lead)} /></div>
                  })
              }
            </div>

            {/* ── Desktop: 4 active columns, no scroll needed ── */}
            <div className="hidden md:grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              {ACTIVE_STAGES.map(stage => {
                const stageLeads = leadsForStage(stage.key)
                const hasLeads   = stageLeads.length > 0
                return (
                  <div key={stage.key} data-testid={`column-${stage.key}`}>
                    {/* Column header */}
                    <div
                      className="flex items-center justify-between mb-2 px-2.5 py-2 rounded-xl"
                      style={hasLeads ? { background: stage.bg } : {}}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full"
                          style={{ background: stage.dot, opacity: hasLeads ? 1 : 0.35 }} />
                        <span className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: hasLeads ? stage.color : '#C4BCAF' }}>
                          {stage.label}
                        </span>
                      </div>
                      {hasLeads && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'white', color: stage.color }}>
                          {stageLeads.length}
                        </span>
                      )}
                    </div>
                    {/* Cards — max 2 visible, show all in overflow */}
                    <div className="space-y-2">
                      {!hasLeads ? (
                        <div className="flex items-center justify-center py-8 rounded-xl text-xs text-gray-300"
                          style={{ border: '1.5px dashed #E8E2D9' }}>
                          Empty
                        </div>
                      ) : stageLeads.slice(0, 2).map(lead => (
                        <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => setSelectedLead(lead)} /></div>
                      ))}
                      {stageLeads.length > 2 && (
                        <button
                          onClick={() => {
                            // Show third lead — user can navigate from modal
                            setSelectedLead(stageLeads[2])
                          }}
                          className="w-full py-2 text-xs font-semibold text-center rounded-xl border transition-colors hover:bg-gray-50"
                          style={{ borderColor: stage.color + '44', color: stage.color }}>
                          +{stageLeads.length - 2} more — tap to view
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Closed stages disclosure (Completed + Paid) ── */}
            <div className="hidden md:block">
              <button
                onClick={() => setShowClosed(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors mb-3 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
              >
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={`transition-transform ${showClosed ? 'rotate-90' : ''}`}
                >
                  <path d="M5 3l4 4-4 4" />
                </svg>
                <span className="font-medium">
                  {showClosed ? 'Hide' : 'Show'} closed
                  {closedCount > 0 && (
                    <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: '#F3F4F6', color: '#6B7280' }}>
                      {closedCount}
                    </span>
                  )}
                </span>
              </button>

              {showClosed && (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                  {CLOSED_STAGES.map(stage => {
                    const stageLeads = leadsForStage(stage.key)
                    const hasLeads   = stageLeads.length > 0
                    return (
                      <div key={stage.key} data-testid={`column-${stage.key}`}>
                        <div className="flex items-center justify-between mb-2 px-2.5 py-2 rounded-xl"
                          style={hasLeads ? { background: stage.bg } : {}}>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full"
                              style={{ background: stage.dot, opacity: hasLeads ? 1 : 0.35 }} />
                            <span className="text-xs font-bold uppercase tracking-wider"
                              style={{ color: hasLeads ? stage.color : '#C4BCAF' }}>
                              {stage.label}
                            </span>
                          </div>
                          {hasLeads && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'white', color: stage.color }}>
                              {stageLeads.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {!hasLeads ? (
                            <div className="flex items-center justify-center py-6 rounded-xl text-xs text-gray-300"
                              style={{ border: '1.5px dashed #E8E2D9' }}>Empty</div>
                          ) : stageLeads.map(lead => (
                            <div key={lead.id}><LeadCard lead={lead} stage={stage} onOpen={() => setSelectedLead(lead)} /></div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Lost leads count */}
            {leads.filter(l => l.lead_status === 'Lost').length > 0 && (
              <div className="mt-3 text-center">
                <span className="text-xs text-gray-400">
                  {leads.filter(l => l.lead_status === 'Lost').length} lead{leads.filter(l => l.lead_status === 'Lost').length !== 1 ? 's' : ''} didn't proceed
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
