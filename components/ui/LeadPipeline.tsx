'use client'
import { useState } from 'react'
import { Lead } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

// ── Pipeline stages ───────────────────────────────────────────────────────────
export const PIPELINE_STAGES = [
  { key: 'New',       label: 'New',       color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
  { key: 'Contacted', label: 'Contacted', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
  { key: 'Quoted',    label: 'Quoted',    color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
  { key: 'Scheduled', label: 'Scheduled', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
  { key: 'Completed', label: 'Completed', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
  { key: 'Paid',      label: 'Paid ✓',   color: '#059669', bg: '#D1FAE5', dot: '#059669' },
] as const

type StageKey = typeof PIPELINE_STAGES[number]['key']

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
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: style.bg, color: style.color }}>
      {days}d
    </span>
  )
}

// ── Lead detail modal ─────────────────────────────────────────────────────────
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E8E2D9' }}>
          <div>
            <div className="text-base font-bold" style={{ color: '#0A1628' }}>{lead.contact_name}</div>
            <div className="text-xs" style={{ color: '#A89F93' }}>{timeAgo(lead.created_at)} · {lead.lead_source?.replace('_', ' ')}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="p-4 rounded-xl" style={{ background: '#FAF9F6', border: '1px solid #E8E2D9' }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#A89F93' }}>Request</div>
            <div className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>{lead.message}</div>
          </div>
          <div className="flex gap-2">
            {lead.contact_phone && (
              <a href={`tel:${lead.contact_phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                📞 Call {lead.contact_name.split(' ')[0]}
              </a>
            )}
            {lead.contact_email && (
              <a href={`mailto:${lead.contact_email}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border"
                style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
                ✉ Email
              </a>
            )}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#A89F93' }}>Pipeline stage</div>
            <div className="grid grid-cols-3 gap-1.5">
              {PIPELINE_STAGES.map(s => (
                <button key={s.key} onClick={() => setStatus(s.key as any)}
                  className="py-2 rounded-lg text-xs font-semibold border transition-all"
                  style={status === s.key
                    ? { background: s.bg, color: s.color, borderColor: s.color }
                    : { background: 'white', color: '#6B7280', borderColor: '#E8E2D9' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#A89F93' }}>Quote amount</div>
            <div className="flex items-center border rounded-xl overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
              <span className="px-3 py-2.5 text-sm font-semibold" style={{ color: '#A89F93', background: '#FAF9F6' }}>$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00" className="flex-1 px-3 py-2.5 text-sm outline-none bg-white" style={{ color: '#0A1628' }} />
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#A89F93' }}>Scheduled date</div>
            <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border rounded-xl outline-none"
              style={{ borderColor: '#E8E2D9', color: '#0A1628' }} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#A89F93' }}>Follow-up date</div>
            <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border rounded-xl outline-none"
              style={{ borderColor: '#E8E2D9', color: '#0A1628' }} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#A89F93' }}>Notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Left voicemail, quoted $850, customer wants work done by Friday..."
              rows={3} className="w-full px-3 py-2.5 text-sm border rounded-xl outline-none resize-none"
              style={{ borderColor: '#E8E2D9', color: '#0A1628' }} />
          </div>
          <div className="flex gap-2 pt-2 border-t" style={{ borderColor: '#E8E2D9' }}>
            <button onClick={async () => { await onStatusChange(lead.id, 'Lost'); onClose() }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
              Mark Lost
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Paid prompt ───────────────────────────────────────────────────────────────
function PaidPrompt({ lead, onDismiss }: { lead: Lead; onDismiss: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl border"
      style={{ background: '#F0FDFA', borderColor: '#0F766E33' }}>
      <span className="text-base">⭐</span>
      <p className="text-sm text-gray-800 flex-1">
        Job marked paid — send <span className="font-semibold">{lead.contact_name}</span> a review request?
      </p>
      {lead.contact_email && (
        <a href={`mailto:${lead.contact_email}?subject=How did we do?&body=Hi ${lead.contact_name.split(' ')[0]}, thanks for choosing us! We'd love a review on ProGuild: https://proguild.ai`}
          className="text-xs font-semibold text-white px-3 py-1.5 rounded-full hover:opacity-90"
          style={{ background: '#0F766E' }}
          onClick={onDismiss}>
          Send request
        </a>
      )}
      <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600 px-2">Skip</button>
    </div>
  )
}

// ── Lead card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const [bg, fg] = avatarColor(lead.contact_name)
  const days = daysSince(lead.created_at)
  const isOverdue = days > 3
  const today = new Date(); today.setHours(0,0,0,0)
  const followUpDue = lead.follow_up_date ? new Date(lead.follow_up_date) <= today : false

  return (
    <div onClick={onOpen}
      className="bg-white rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all p-3.5"
      style={{
        border: isOverdue ? '1.5px solid #FCA5A5' : '1px solid #E8E2D9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: bg, color: fg }}>
          {initials(lead.contact_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: '#0A1628' }}>{lead.contact_name}</div>
          <div className="text-xs" style={{ color: '#A89F93' }}>{timeAgo(lead.created_at)}</div>
        </div>
        <DaysChip days={days} />
      </div>
      <div className="text-xs leading-relaxed line-clamp-2 mb-2.5" style={{ color: '#6B7280' }}>{lead.message}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {lead.contact_phone && (
          <a href={`tel:${lead.contact_phone}`} onClick={e => e.stopPropagation()}
            className="w-6 h-6 flex items-center justify-center rounded-full text-xs hover:bg-teal-50 transition-colors"
            style={{ color: '#0F766E' }}>📞</a>
        )}
        {lead.quoted_amount && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
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
          <span className="text-xs px-1.5 py-0.5 rounded ml-auto" style={{ background: '#FEF3C7', color: '#92400E' }}>Registry</span>
        )}
      </div>
    </div>
  )
}

// ── Pipeline header ───────────────────────────────────────────────────────────
function PipelineHeader({ leads }: { leads: Lead[] }) {
  const pipelineValue = leads
    .filter(l => l.quoted_amount && !['Lost','Archived'].includes(l.lead_status))
    .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const needAction = leads
    .filter(l => !['Paid','Lost','Archived'].includes(l.lead_status) && daysSince(l.created_at) > 3).length
  const newCount = leads.filter(l => l.lead_status === 'New').length

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
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
        Tap any card to manage
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LeadPipeline({ leads, onStatusChange, onUpdate, isPaid }: Props) {
  const [selectedLead, setSelectedLead]     = useState<Lead | null>(null)
  const [mobileStage, setMobileStage]       = useState<StageKey>('New')
  const [paidPromptLead, setPaidPromptLead] = useState<Lead | null>(null)

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
            <div className="text-sm font-medium text-gray-600 mb-1">No leads yet</div>
            <div className="text-xs">When someone contacts you, they'll appear here.</div>
          </div>
        ) : (
          <>
            {/* Mobile tabs */}
            <div className="md:hidden flex gap-1 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {PIPELINE_STAGES.map(s => {
                const cnt = leadsForStage(s.key).length
                return (
                  <button key={s.key} onClick={() => setMobileStage(s.key as StageKey)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
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
                ? <div className="text-center py-8 text-sm" style={{ color: '#A89F93' }}>No leads in {mobileStage}</div>
                : leadsForStage(mobileStage).map(lead => (
                    <LeadCard key={lead.id} lead={lead} onOpen={() => setSelectedLead(lead)} />
                  ))
              }
            </div>

            {/* Desktop Kanban */}
            <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: 'repeat(6, minmax(160px, 1fr))' }}>
              {PIPELINE_STAGES.map(stage => {
                const stageLeads = leadsForStage(stage.key)
                return (
                  <div key={stage.key} className="flex flex-col min-h-64">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: stage.dot }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6B7280' }}>{stage.label}</span>
                      </div>
                      {stageLeads.length > 0 && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: stage.bg, color: stage.color }}>
                          {stageLeads.length}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 space-y-2 min-h-16 rounded-xl p-1"
                      style={{ background: stageLeads.length === 0 ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                      {stageLeads.length === 0
                        ? <div className="h-full flex items-center justify-center text-xs" style={{ color: '#D1CBC3' }}>Empty</div>
                        : stageLeads.map(lead => (
                            <LeadCard key={lead.id} lead={lead} onOpen={() => setSelectedLead(lead)} />
                          ))
                      }
                    </div>
                  </div>
                )
              })}
            </div>

            {leads.filter(l => l.lead_status === 'Lost').length > 0 && (
              <div className="mt-4 text-center">
                <span className="text-xs" style={{ color: '#A89F93' }}>
                  {leads.filter(l => l.lead_status === 'Lost').length} lost leads hidden
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
