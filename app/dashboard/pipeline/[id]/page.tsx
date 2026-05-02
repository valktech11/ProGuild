'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lead, Session } from '@/types'
import { avatarColor, initials, timeAgo } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'

// ── Stage definitions ──────────────────────────────────────────────────────────
const STAGES = [
  { key: 'New',       label: 'New',       color: '#D97706', bg: '#FFFBEB' },
  { key: 'Contacted', label: 'Contacted', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'Quoted',    label: 'Quoted',    color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'Scheduled', label: 'Scheduled', color: '#0F766E', bg: '#F0FDFA' },
  { key: 'Completed', label: 'Completed', color: '#374151', bg: '#F9FAFB' },
  { key: 'Paid',      label: 'Paid',      color: 'white',   bg: '#4A7B4A' },
]

const STAGE_ORDER: Record<string, number> = {
  New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5, Lost: 6,
}

// ── Next Best Action (static rule-based) ───────────────────────────────────────
function getNextAction(lead: Lead): { icon: string; text: string; cta: string; color: string } {
  const days = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
  switch (lead.lead_status) {
    case 'New':
      return days >= 1
        ? { icon: '⚡', text: `No contact in ${days} day${days > 1 ? 's' : ''} — call now to increase win rate`, cta: 'Call Lead', color: '#EF4444' }
        : { icon: '📞', text: 'New lead — respond within 24hrs to increase win rate by 40%', cta: 'Call Lead', color: '#D97706' }
    case 'Contacted':
      return { icon: '📋', text: 'Send a quote to keep momentum going', cta: 'Create Estimate', color: '#7C3AED' }
    case 'Quoted':
      return days >= 3
        ? { icon: '🔔', text: `Quote pending ${days} days — follow up to close`, cta: 'Follow Up', color: '#EF4444' }
        : { icon: '⏳', text: 'Quote sent — follow up in 2–3 days if no response', cta: 'Set Reminder', color: '#0F766E' }
    case 'Scheduled':
      return { icon: '📅', text: 'Confirm job day details with the client', cta: 'Send Confirmation', color: '#0F766E' }
    case 'Completed':
      return { icon: '🧾', text: 'Job done — send invoice and request a review', cta: 'Generate Invoice', color: '#059669' }
    case 'Paid':
      return { icon: '⭐', text: 'Great job! Ask the client for a review while fresh', cta: 'Request Review', color: '#D97706' }
    default:
      return { icon: '📋', text: 'Review this lead and take the next step', cta: 'View Details', color: '#6B7280' }
  }
}

// ── Inline SVG icon ────────────────────────────────────────────────────────────
function Ic({ d, s = 16, sw = 1.8, c = '#6B7280' }: { d: string; s?: number; sw?: number; c?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// ── Backward confirmation ──────────────────────────────────────────────────────
function BackConfirm({ from, to, onConfirm, onCancel }: { from: string; to: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Ic d="M12 9v4M12 16.5v1M2 12a10 10 0 1020 0 10 10 0 00-20 0" s={24} sw={2} c="#D97706" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Move back to {to}?</h3>
        <p className="text-sm text-gray-500 text-center mb-5">This lead is currently <strong>{from}</strong>. Moving backward is allowed but recorded.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: '#0F766E' }}>Move back</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() => typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  function toggleDark() { setDk(p => { const n = !p; localStorage.setItem('pg_darkmode', n ? '1' : '0'); return n }) }

  const [lead,    setLead]    = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [tab,     setTab]     = useState<'notes' | 'activity' | 'conversation' | 'files'>('notes')
  const [backConfirm, setBackConfirm] = useState<string | null>(null)
  const [toast,   setToast]   = useState('')

  // Editable fields
  const [notes,     setNotes]     = useState('')
  const [amount,    setAmount]    = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [followUp,  setFollowUp]  = useState('')

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/leads/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.lead) {
          setLead(d.lead)
          setNotes(d.lead.notes || '')
          setAmount(d.lead.quoted_amount?.toString() || '')
          setSchedDate(d.lead.scheduled_date || '')
          setFollowUp(d.lead.follow_up_date || '')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id, session, router])

  async function saveChanges(fields: Partial<Lead> = {}) {
    if (!lead) return
    setSaving(true)
    const body = {
      notes: notes || null,
      quoted_amount: amount ? parseFloat(amount) : null,
      scheduled_date: schedDate || null,
      follow_up_date: followUp || null,
      ...fields,
    }
    const r = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (d.lead) {
      setLead(d.lead)
      setToast('Saved!')
      setTimeout(() => setToast(''), 2000)
    }
    setSaving(false)
  }

  async function changeStage(newStage: string) {
    if (!lead) return
    const isBackward = (STAGE_ORDER[newStage] ?? 0) < (STAGE_ORDER[lead.lead_status] ?? 0)
    if (isBackward) { setBackConfirm(newStage); return }
    await saveChanges({ lead_status: newStage as Lead['lead_status'] })
    setLead(prev => prev ? { ...prev, lead_status: newStage as Lead['lead_status'] } : null)
  }

  const cardBg   = dk ? '#1E293B' : 'white'
  const cardBdr  = dk ? '#334155' : '#E5E7EB'
  const pageBg   = dk ? '#0F172A' : '#F3F4F6'
  const textMain = dk ? '#F1F5F9' : '#0A1628'
  const textSub  = dk ? '#94A3B8' : '#6B7280'
  const inputCls = `w-full px-3 py-2.5 text-[13px] rounded-xl border outline-none transition-all focus:ring-2 focus:ring-teal-100 focus:border-teal-600`
  const inputStyle = { backgroundColor: dk ? '#0F172A' : 'white', borderColor: cardBdr, color: textMain }

  if (!session || loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: pageBg }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#0F766E', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ background: pageBg }}>
        <p className="text-lg font-bold" style={{ color: textMain }}>Lead not found</p>
        <Link href="/dashboard/pipeline" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#0F766E' }}>← Back to Pipeline</Link>
      </div>
    )
  }

  const [avBg, avFg] = avatarColor(lead.contact_name)
  const currentStage = STAGES.find(s => s.key === lead.lead_status) || STAGES[0]
  const nextAction   = getNextAction(lead)
  const days         = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      {backConfirm && (
        <BackConfirm
          from={lead.lead_status} to={backConfirm}
          onConfirm={async () => {
            const stage = backConfirm
            setBackConfirm(null)
            await saveChanges({ lead_status: stage as Lead['lead_status'] })
            setLead(prev => prev ? { ...prev, lead_status: stage as Lead['lead_status'] } : null)
          }}
          onCancel={() => setBackConfirm(null)}
        />
      )}

      {/* Save toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-xl"
          style={{ background: '#0F766E' }}>
          {toast}
        </div>
      )}

      <div style={{ backgroundColor: pageBg, minHeight: '100%' }}>
        {/* ── Top header ───────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b flex items-center justify-between"
          style={{ backgroundColor: cardBg, borderColor: cardBdr }}>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/pipeline"
              className="flex items-center gap-1.5 text-[13px] font-semibold hover:opacity-70 transition-opacity"
              style={{ color: '#0F766E' }}>
              <Ic d="M19 12H5M12 19l-7-7 7-7" s={15} sw={2.5} c="#0F766E" />
              Back to Pipeline
            </Link>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: avBg, color: avFg }}>
                {initials(lead.contact_name)}
              </div>
              <div>
                <div className="text-[15px] font-bold" style={{ color: textMain }}>{lead.contact_name}</div>
                <div className="text-[12px]" style={{ color: textSub }}>
                  {lead.lead_source?.replace(/_/g, ' ')} · {timeAgo(lead.created_at)}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold ml-1"
                style={{ background: currentStage.bg, color: currentStage.key === 'Paid' ? '#4A7B4A' : currentStage.color }}>
                {currentStage.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lead.contact_phone && (
              <a href={`tel:${lead.contact_phone}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border transition-colors hover:bg-gray-50"
                style={{ borderColor: cardBdr, color: textMain }}>
                <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" s={14} c="#0F766E" />
                Call
              </a>
            )}
            <button onClick={() => saveChanges()} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: '#0F766E' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Stage progress bar ───────────────────────────────────────────── */}
        <div className="px-6 py-3 border-b overflow-x-auto" style={{ backgroundColor: cardBg, borderColor: cardBdr }}>
          <div className="flex items-center gap-2 min-w-max">
            {STAGES.filter(s => s.key !== 'Paid').concat(STAGES.filter(s => s.key === 'Paid')).map((s, i, arr) => {
              const isActive  = lead.lead_status === s.key
              const isPast    = (STAGE_ORDER[lead.lead_status] ?? 0) > (STAGE_ORDER[s.key] ?? 0)
              const isLast    = i === arr.length - 1
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <button onClick={() => changeStage(s.key)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:opacity-80"
                    style={isActive
                      ? { background: s.key === 'Paid' ? s.bg : s.bg, color: s.key === 'Paid' ? '#4A7B4A' : s.color, border: `2px solid ${s.key === 'Paid' ? '#4A7B4A' : s.color}` }
                      : isPast
                        ? { background: '#F0FDF4', color: '#059669', border: '2px solid #86EFAC' }
                        : { background: dk ? '#334155' : '#F9FAFB', color: textSub, border: `1.5px solid ${cardBdr}` }
                    }>
                    {(isActive || isPast) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke={isActive ? (s.key === 'Paid' ? '#4A7B4A' : s.color) : '#059669'}
                        strokeWidth="2.5" strokeLinecap="round">
                        <path d={isActive ? 'M12 2l.01 0' : 'M20 6L9 17l-5-5'} />
                      </svg>
                    )}
                    {s.label}
                  </button>
                  {!isLast && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dk ? '#475569' : '#D1D5DB'} strokeWidth="2" strokeLinecap="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 3-column body ────────────────────────────────────────────────── */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ── LEFT: Conversation / Notes / Activity ── */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex gap-1 border-b" style={{ borderColor: cardBdr }}>
              {(['conversation', 'notes', 'activity', 'files'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="px-4 py-2.5 text-[13px] font-semibold capitalize transition-all border-b-2"
                  style={tab === t
                    ? { color: '#0F766E', borderColor: '#0F766E' }
                    : { color: textSub, borderColor: 'transparent' }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Conversation — TBD */}
            {tab === 'conversation' && (
              <div className="rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
                <div className="text-4xl mb-3">💬</div>
                <div className="text-[15px] font-bold mb-1" style={{ color: textMain }}>Messaging coming in v76</div>
                <div className="text-[13px] max-w-xs" style={{ color: textSub }}>
                  SMS, WhatsApp and Email conversations will appear here once messaging is live.
                </div>
                <div className="mt-4 px-3 py-1 rounded-full text-[11px] font-semibold" style={{ background: '#EDE9FE', color: '#7C3AED' }}>v76</div>
              </div>
            )}

            {/* Notes */}
            {tab === 'notes' && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
                <div className="text-[13px] font-bold mb-3" style={{ color: textMain }}>Notes</div>
                <div className="relative">
                  <svg className="absolute left-3 top-3 flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={textSub} strokeWidth="1.8" strokeLinecap="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={8}
                    placeholder="Add notes about this lead — what they want, budget discussed, special requirements..."
                    className={inputCls + ' pl-9 resize-none'}
                    style={inputStyle} />
                </div>
                <div className="flex justify-end mt-3">
                  <button onClick={() => saveChanges()} disabled={saving}
                    className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ background: '#0F766E' }}>
                    {saving ? 'Saving…' : 'Save Notes'}
                  </button>
                </div>
              </div>
            )}

            {/* Activity */}
            {tab === 'activity' && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
                <div className="text-[13px] font-bold mb-4" style={{ color: textMain }}>Activity</div>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#F0FDFA' }}>
                      <Ic d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" s={14} c="#0F766E" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: textMain }}>Lead created</div>
                      <div className="text-[12px]" style={{ color: textSub }}>
                        Received via {lead.lead_source?.replace(/_/g, ' ')} · {timeAgo(lead.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: currentStage.key === 'Paid' ? '#D1FAE5' : currentStage.bg }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: currentStage.key === 'Paid' ? '#4A7B4A' : currentStage.color }} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: textMain }}>
                        Currently: {lead.lead_status}
                      </div>
                      <div className="text-[12px]" style={{ color: textSub }}>
                        {days === 0 ? 'Today' : `${days} day${days > 1 ? 's' : ''} in pipeline`}
                      </div>
                    </div>
                  </div>
                  {lead.notes && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#F5F3FF' }}>
                        <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" s={14} c="#7C3AED" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold" style={{ color: textMain }}>Notes added</div>
                        <div className="text-[12px] line-clamp-2" style={{ color: textSub }}>{lead.notes}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-5 pt-4 border-t text-center text-[12px]" style={{ borderColor: cardBdr, color: textSub }}>
                  Full activity log with timestamps coming in v76
                </div>
              </div>
            )}

            {/* Files — TBD */}
            {tab === 'files' && (
              <div className="rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
                <div className="text-4xl mb-3">📎</div>
                <div className="text-[15px] font-bold mb-1" style={{ color: textMain }}>File attachments coming in v76</div>
                <div className="text-[13px] max-w-xs" style={{ color: textSub }}>
                  Photos, contracts, and documents shared by the client will appear here.
                </div>
                <div className="mt-4 px-3 py-1 rounded-full text-[11px] font-semibold" style={{ background: '#EDE9FE', color: '#7C3AED' }}>v76</div>
              </div>
            )}

            {/* Request message card */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: textSub }}>Original Request</div>
              <p className="text-[14px] leading-relaxed" style={{ color: textMain }}>{lead.message}</p>
            </div>
          </div>

          {/* ── MIDDLE: Lead details ── */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[14px] font-bold" style={{ color: textMain }}>Lead Details</div>
              </div>

              <div className="space-y-3">
                {/* Phone */}
                {lead.contact_phone && (
                  <div className="flex items-center gap-3">
                    <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" s={15} c="#0F766E" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: textSub }}>Phone</div>
                      <a href={`tel:${lead.contact_phone}`} className="text-[13px] font-semibold hover:underline" style={{ color: textMain }}>
                        {lead.contact_phone}
                      </a>
                    </div>
                    <a href={`tel:${lead.contact_phone}`} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors" title="Call">
                      <Ic d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" s={13} c="#0F766E" />
                    </a>
                  </div>
                )}

                {/* Email */}
                {lead.contact_email && (
                  <div className="flex items-center gap-3">
                    <Ic d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" s={15} c="#2563EB" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: textSub }}>Email</div>
                      <a href={`mailto:${lead.contact_email}`} className="text-[13px] font-semibold hover:underline truncate block" style={{ color: textMain }}>
                        {lead.contact_email}
                      </a>
                    </div>
                  </div>
                )}

                {/* Source */}
                <div className="flex items-center gap-3">
                  <Ic d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 10a1 1 0 100-2 1 1 0 000 2" s={15} c="#7C3AED" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: textSub }}>Source</div>
                    <div className="text-[13px] font-semibold" style={{ color: textMain }}>{lead.lead_source?.replace(/_/g, ' ')}</div>
                  </div>
                </div>

                {/* Received */}
                <div className="flex items-center gap-3">
                  <Ic d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" s={15} c="#D97706" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: textSub }}>Received</div>
                    <div className="text-[13px] font-semibold" style={{ color: textMain }}>{timeAgo(lead.created_at)}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3 pt-4 border-t" style={{ borderColor: cardBdr }}>
                {/* Quote amount */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: textSub }}>Quote Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold" style={{ color: textSub }}>$</span>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0"
                      className={inputCls + ' pl-6'}
                      style={inputStyle} />
                  </div>
                </div>

                {/* Scheduled date */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: textSub }}>Scheduled Date</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                    className={inputCls}
                    style={inputStyle} />
                </div>

                {/* Follow-up date */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: textSub }}>Follow-up Date</label>
                  <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)}
                    className={inputCls}
                    style={inputStyle} />
                </div>
              </div>

              {/* Reminders placeholder */}
              <div className="mt-4 pt-4 border-t" style={{ borderColor: cardBdr }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-bold" style={{ color: textMain }}>Reminders</div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EDE9FE', color: '#7C3AED' }}>v76</span>
                </div>
                <div className="text-[12px]" style={{ color: textSub }}>Automated reminders and follow-up scheduling coming in v76.</div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Intelligence ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Estimate */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold" style={{ color: textMain }}>Estimate</div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#D97706' }}>v75</span>
              </div>
              {lead.quoted_amount ? (
                <div className="text-[24px] font-bold mb-1" style={{ color: textMain }}>${lead.quoted_amount.toLocaleString()}</div>
              ) : (
                <div className="text-[14px] font-bold mb-1" style={{ color: textSub }}>—</div>
              )}
              <div className="text-[11px] mb-3" style={{ color: textSub }}>Est. Amount</div>
              <button className="w-full py-2 rounded-xl text-[12px] font-semibold border transition-colors hover:bg-gray-50"
                style={{ borderColor: cardBdr, color: textSub }}>
                Create / View Estimate
              </button>
              <div className="text-[10px] text-center mt-1.5" style={{ color: textSub }}>Available in v75</div>
            </div>

            {/* Next Best Action */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-sm">💡</span>
                <div className="text-[13px] font-bold" style={{ color: textMain }}>Next Best Action</div>
              </div>
              <p className="text-[12px] leading-relaxed mb-3" style={{ color: textSub }}>{nextAction.text}</p>
              {lead.contact_phone && nextAction.cta === 'Call Lead' ? (
                <a href={`tel:${lead.contact_phone}`}
                  className="w-full flex items-center justify-center py-2 rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: nextAction.color }}>
                  📞 {nextAction.cta}
                </a>
              ) : (
                <button className="w-full py-2 rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: nextAction.color }}>
                  {nextAction.cta}
                </button>
              )}
            </div>

            {/* AI Insights — TBD */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z"/>
                  </svg>
                  <div className="text-[13px] font-bold" style={{ color: textMain }}>AI Insights</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EDE9FE', color: '#7C3AED' }}>v85</span>
              </div>
              <div className="text-[12px]" style={{ color: textSub }}>Price sensitivity analysis, win probability, and competitive insights coming in v85.</div>
            </div>

            {/* Lead Score — TBD */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold" style={{ color: textMain }}>Lead Score</div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EDE9FE', color: '#7C3AED' }}>v85</span>
              </div>
              <div className="text-[12px]" style={{ color: textSub }}>AI-powered lead scoring with budget, intent, and fit signals coming in v85.</div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
