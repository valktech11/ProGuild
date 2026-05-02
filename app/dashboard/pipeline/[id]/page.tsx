'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Lead, Session, LeadStatus } from '@/types'
import { avatarColor, initials, timeAgo } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'

const STAGES: LeadStatus[] = ['New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Paid']
const STAGE_ORDER: Record<string, number> = { New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5 }

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtPhone(p: string | null): string {
  if (!p) return '—'
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  return p
}
function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function getNBA(lead: Lead, stage: LeadStatus): { label: string; sub: string; urgent: boolean } {
  const days = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
  switch (stage) {
    case 'New': return days > 3
      ? { label: 'Call now — overdue response', sub: `Lead is ${days} days old with no contact.`, urgent: true }
      : { label: 'Call or message this lead', sub: 'Respond quickly to win the job.', urgent: false }
    case 'Contacted': return { label: 'Send a quote', sub: 'Customer has been contacted. Send your estimate.', urgent: false }
    case 'Quoted':    return { label: 'Follow up (3 days no response)', sub: 'Customer has not replied to the estimate yet.', urgent: true }
    case 'Scheduled': return { label: 'Confirm the job day', sub: 'Send a reminder before the scheduled date.', urgent: false }
    case 'Completed': return { label: 'Generate invoice & request review', sub: 'Job is done — collect payment and get a review.', urgent: false }
    case 'Paid':      return { label: 'Request a review', sub: 'Ask the customer to leave a review.', urgent: false }
    default:          return { label: 'Review this lead', sub: '', urgent: false }
  }
}

interface ToastItem { id: number; message: string; type: 'success' | 'error'; prevStage?: LeadStatus }

function Ic({ children, color = '#0F766E', size = 14 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })

  const [dk, setDk] = useState(false)
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [currentStage, setCurrentStage] = useState<LeadStatus>('New')
  const [stageSaving, setStageSaving] = useState(false)
  const [confirmBack, setConfirmBack] = useState<LeadStatus | null>(null)

  const [editingInfo, setEditingInfo] = useState(false)
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editQuote, setEditQuote] = useState('')
  const [editScheduled, setEditScheduled] = useState('')
  const [editFollowUp, setEditFollowUp] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)

  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [toastSeq, setToastSeq] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined') setDk(localStorage.getItem('pg_darkmode') === '1')
  }, [])

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/leads/${id}?pro_id=${session.id}`)
      .then(r => { if (r.status === 404) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(data => {
        if (!data) return
        const l: Lead = data.lead
        setLead(l)
        setCurrentStage(l.lead_status as LeadStatus)
        setNotes(l.notes || '')
        setEditPhone(l.contact_phone || '')
        setEditEmail(l.contact_email || '')
        setEditQuote(l.quoted_amount != null ? String(l.quoted_amount) : '')
        setEditScheduled(l.scheduled_date || '')
        setEditFollowUp(l.follow_up_date || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, id, router])

  function addToast(message: string, type: ToastItem['type'] = 'success', prevStage?: LeadStatus) {
    const tid = toastSeq + 1
    setToastSeq(tid)
    setToasts(t => [...t, { id: tid, message, type, prevStage }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 5000)
  }
  function dismissToast(tid: number) { setToasts(t => t.filter(x => x.id !== tid)) }

  const patchLead = useCallback(async (fields: Record<string, unknown>) => {
    if (!session) return false
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, ...fields }),
    })
    return res.ok
  }, [session, id])

  async function handleStageClick(stage: LeadStatus) {
    if (stage === currentStage || stageSaving) return
    if (STAGE_ORDER[stage] < STAGE_ORDER[currentStage]) { setConfirmBack(stage); return }
    const prev = currentStage
    setCurrentStage(stage)
    setStageSaving(true)
    const ok = await patchLead({ lead_status: stage })
    setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: stage } : l); addToast(`Moved to ${stage}`, 'success', prev) }
    else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function handleConfirmBack() {
    if (!confirmBack) return
    const stage = confirmBack; const prev = currentStage
    setConfirmBack(null); setCurrentStage(stage); setStageSaving(true)
    const ok = await patchLead({ lead_status: stage })
    setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: stage } : l); addToast(`Moved back to ${stage}`, 'success', prev) }
    else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function handleUndo(tid: number, prevStage: LeadStatus) {
    dismissToast(tid)
    const from = currentStage; setCurrentStage(prevStage); setStageSaving(true)
    const ok = await patchLead({ lead_status: prevStage })
    setStageSaving(false)
    if (!ok) { setCurrentStage(from); addToast('Undo failed', 'error') }
  }

  async function handleSaveInfo() {
    setSavingInfo(true)
    const ok = await patchLead({
      contact_phone: editPhone || null,
      contact_email: editEmail || null,
      quoted_amount: editQuote ? parseFloat(editQuote) : null,
      scheduled_date: editScheduled || null,
      follow_up_date: editFollowUp || null,
    })
    setSavingInfo(false)
    if (ok) {
      setLead(l => l ? { ...l, contact_phone: editPhone || null, contact_email: editEmail || null, quoted_amount: editQuote ? parseFloat(editQuote) : null, scheduled_date: editScheduled || null, follow_up_date: editFollowUp || null } : l)
      setEditingInfo(false); addToast('Lead information saved')
    } else addToast('Failed to save', 'error')
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    const ok = await patchLead({ notes })
    setSavingNotes(false)
    if (ok) { setLead(l => l ? { ...l, notes } : l); addToast('Note saved') }
    else addToast('Failed to save note', 'error')
  }

  function getActivity() {
    if (!lead) return []
    const items: { date: string; title: string; sub: string; type: string }[] = []
    items.push({ date: lead.created_at, title: 'Lead created', sub: `From ${(lead.lead_source || 'unknown').replace(/_/g, ' ')}${lead.message ? ` · "${lead.message.slice(0, 60)}${lead.message.length > 60 ? '…' : ''}"` : ''}`, type: 'created' })
    if (lead.quoted_amount != null) items.push({ date: (lead as any).updated_at || lead.created_at, title: 'Quote amount set', sub: `$${Number(lead.quoted_amount).toLocaleString()}`, type: 'quote' })
    if (lead.scheduled_date) items.push({ date: (lead as any).updated_at || lead.created_at, title: 'Job scheduled', sub: fmt(lead.scheduled_date), type: 'scheduled' })
    if (lead.notes) items.push({ date: (lead as any).updated_at || lead.created_at, title: 'Note added', sub: lead.notes.slice(0, 80) + (lead.notes.length > 80 ? '…' : ''), type: 'note' })
    return items.reverse()
  }

  const bg = dk ? '#0A1628' : '#F5F4F0'
  const card = dk ? '#1E293B' : '#FFFFFF'
  const border = dk ? '#2D3748' : '#E8E2D9'
  const tp = dk ? '#F1F5F9' : '#111827'
  const ts = dk ? '#94A3B8' : '#6B7280'
  const inputBg = dk ? '#0F172A' : '#F9FAFB'
  const subBg = dk ? '#0F172A' : '#F9FAFB'

  if (!session) return null

  const overdueFU = isOverdue(lead?.follow_up_date ?? null)
  const nba = lead ? getNBA(lead, currentStage) : null
  const activity = getActivity()
  const curIdx = STAGE_ORDER[currentStage] ?? 0
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E1F5EE', '#0F6E56']

  const infoRows = lead ? [
    { label: 'Phone',          icon: 'phone',    view: fmtPhone(lead.contact_phone),   edit: <input value={editPhone} onChange={e => setEditPhone(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%' }} /> },
    { label: 'Source',         icon: 'source',   view: (lead.lead_source || '—').replace(/_/g, ' '), edit: null },
    { label: 'Email',          icon: 'email',    view: lead.contact_email || '—',       edit: <input value={editEmail} onChange={e => setEditEmail(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%' }} /> },
    { label: 'Scheduled date', icon: 'calendar', view: fmt(lead.scheduled_date),        edit: <input type="date" value={editScheduled} onChange={e => setEditScheduled(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%' }} /> },
    { label: 'Quote amount',   icon: 'dollar',   view: lead.quoted_amount != null ? `$${Number(lead.quoted_amount).toLocaleString()}` : '—', edit: <input type="number" value={editQuote} onChange={e => setEditQuote(e.target.value)} placeholder="0.00" style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%' }} /> },
    { label: 'Follow-up date', icon: 'followup', view: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{fmt(lead.follow_up_date)}{overdueFU && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 }}>Overdue</span>}</span>, edit: <input type="date" value={editFollowUp} onChange={e => setEditFollowUp(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%' }} /> },
  ] : []

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={() => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }}>
      <div style={{ background: bg, minHeight: '100vh', padding: '20px 24px', paddingBottom: 40 }}>

        {/* Toasts */}
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id} style={{ pointerEvents: 'all', background: t.type === 'error' ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${t.type === 'error' ? '#FECACA' : '#BBF7D0'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: t.type === 'error' ? '#991B1B' : '#166534', minWidth: 220, maxWidth: 320 }}>
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.prevStage && t.type === 'success' && <button onClick={() => handleUndo(t.id, t.prevStage!)} style={{ fontSize: 12, color: '#0F766E', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Undo</button>}
              <button onClick={() => dismissToast(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>

        {/* Backward confirm modal */}
        {confirmBack && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConfirmBack(null)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 15, fontWeight: 500, color: tp, marginBottom: 8 }}>Move back to {confirmBack}?</p>
              <p style={{ fontSize: 13, color: ts, marginBottom: 20 }}>This lead is currently <strong>{currentStage}</strong>. Moving backward is allowed but recorded.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmBack(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={handleConfirmBack} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Move back</button>
              </div>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 14 }}>Loading...</div>}
        {notFound && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 14 }}>Lead not found.</div>}

        {!loading && !notFound && lead && (
          <>
            {/* Top nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <button onClick={() => router.push('/dashboard/pipeline')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: ts, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Ic color={ts}><polyline points="15 18 9 12 15 6"/></Ic>
                Back to Pipeline
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: tp, fontSize: 13, cursor: 'pointer' }}>
                  <Ic color={tp}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Ic>
                  Call
                </button>
                <button style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: tp, fontSize: 13, cursor: 'pointer' }}>Send Estimate</button>
                <button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Follow Up</button>
                <button style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: ts, fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>···</button>
              </div>
            </div>

            {/* Hero */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: avBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 500, color: avFg, flexShrink: 0 }}>
                  {initials(lead.contact_name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 500, color: tp }}>{lead.contact_name}</span>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#EEEDFE', color: '#3C3489', fontWeight: 500 }}>{currentStage}</span>
                    <span style={{ fontSize: 13, color: ts }}>· {timeAgo(lead.created_at)}</span>
                    {overdueFU && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 }}>Overdue</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: ts, flexWrap: 'wrap' }}>
                    {lead.quoted_amount != null && <><span>${Number(lead.quoted_amount).toLocaleString()} est. value</span><span style={{ opacity: 0.5 }}>·</span></>}
                    {lead.lead_source && <span>{lead.lead_source.replace(/_/g, ' ')}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Stage pills */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '14px 24px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
              {STAGES.map((stage, i) => {
                const done = i < curIdx; const active = i === curIdx
                return (
                  <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => handleStageClick(stage)}
                      disabled={stageSaving}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                        background: done ? '#DCFCE7' : 'transparent',
                        border: `1.5px solid ${done ? '#22C55E' : active ? '#7C3AED' : (dk ? '#4B5563' : '#D1D5DB')}`,
                        color: done ? '#166534' : active ? '#7C3AED' : ts,
                        cursor: stageSaving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {done   && <Ic color="#166534" size={12}><polyline points="20 6 9 17 4 12"/></Ic>}
                      {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7C3AED', display: 'inline-block' }} />}
                      {stage}
                    </button>
                    {i < STAGES.length - 1 && <Ic color={ts} size={12}><polyline points="9 18 15 12 9 6"/></Ic>}
                  </div>
                )
              })}
            </div>

            {/* Lead information */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: tp }}>Lead information</span>
                {!editingInfo
                  ? <button onClick={() => setEditingInfo(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: ts, background: 'none', border: 'none', cursor: 'pointer' }}><Ic color={ts}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Ic>Edit</button>
                  : <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setEditingInfo(false); setEditPhone(lead.contact_phone || ''); setEditEmail(lead.contact_email || '') }} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                      <button onClick={handleSaveInfo} disabled={savingInfo} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>{savingInfo ? 'Saving…' : 'Save'}</button>
                    </div>
                }
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {infoRows.map((row, i) => {
                  const isLeft = i % 2 === 0; const isLast = i >= 4
                  return (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 0', paddingRight: isLeft ? 24 : 0, paddingLeft: isLeft ? 0 : 24, borderBottom: isLast ? 'none' : `1px solid ${border}`, borderRight: isLeft ? `1px solid ${border}` : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: dk ? '#1E3A4A' : '#F0FDFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <Ic color="#0F766E">
                          {row.icon === 'phone'    && <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>}
                          {row.icon === 'email'    && <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>}
                          {row.icon === 'source'   && <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>}
                          {row.icon === 'calendar' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                          {row.icon === 'dollar'   && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                          {row.icon === 'followup' && <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>}
                        </Ic>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: ts, marginBottom: 3 }}>{row.label}</div>
                        <div style={{ fontSize: 13, color: tp, fontWeight: 500 }}>{editingInfo && row.edit ? row.edit : row.view}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Current status & next action */}
            {nba && (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: tp, marginBottom: 12 }}>Current status &amp; next action</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: 16, background: subBg, borderRight: `1px solid ${border}` }}>
                    <div style={{ fontSize: 11, color: ts, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Status</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500, color: '#3C3489', marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic color="#3C3489"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></Ic>
                      </div>
                      {currentStage}
                    </div>
                    <div style={{ fontSize: 12, color: ts }}>Updated {timeAgo((lead as any).updated_at || lead.created_at)}</div>
                  </div>
                  <div style={{ padding: 16, background: nba.urgent ? (dk ? '#2D1B00' : '#FFFBF0') : subBg }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: nba.urgent ? '#F59E0B' : '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ic color="white" size={10}>
                          {nba.urgent ? <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> : <polyline points="20 6 9 17 4 12"/>}
                        </Ic>
                      </div>
                      <span style={{ fontSize: 11, color: nba.urgent ? '#854F0B' : '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next step</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: tp, marginBottom: 4 }}>{nba.label}</div>
                    <div style={{ fontSize: 12, color: ts, marginBottom: 12 }}>{nba.sub}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#0F766E', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <Ic color="white" size={13}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Ic>
                        Call now
                      </button>
                      <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', color: tp, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                        <Ic color={tp} size={13}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></Ic>
                        Send SMS
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: tp, marginBottom: 16 }}>Conversation</div>
              <div style={{ border: `1px solid ${border}`, borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a note or send a message..." rows={3} style={{ width: '100%', padding: '12px 14px', fontSize: 13, background: inputBg, color: tp, border: 'none', resize: 'none', fontFamily: 'inherit', outline: 'none', display: 'block' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: `1px solid ${border}`, background: subBg }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Note', 'SMS', 'Email'] as const).map((t, ti) => (
                      <button key={t} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${border}`, background: ti === 0 ? card : 'transparent', color: ti === 0 ? tp : ts, cursor: 'pointer' }}>{t}</button>
                    ))}
                  </div>
                  <button onClick={handleSaveNotes} disabled={savingNotes || !notes.trim()} style={{ padding: '6px 14px', fontSize: 13, background: notes.trim() ? '#0F766E' : (dk ? '#1E293B' : '#E5E7EB'), color: notes.trim() ? 'white' : ts, border: 'none', borderRadius: 6, cursor: notes.trim() ? 'pointer' : 'default', fontWeight: 500 }}>
                    {savingNotes ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </div>
              {activity.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px 0', color: ts, fontSize: 13 }}>No activity yet.</div>
                : activity.map((item, i) => {
                  const iconColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#3C3489' : '#0F766E'
                  const iconBg = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEEDFE' : '#E1F5EE'
                  return (
                    <div key={i}>
                      <div style={{ textAlign: 'center', margin: '8px 0 12px' }}>
                        <span style={{ fontSize: 11, color: ts, background: dk ? '#1E293B' : '#F3F4F6', padding: '3px 10px', borderRadius: 20, border: `1px solid ${border}` }}>
                          {new Date(item.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14, borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none', marginBottom: i < activity.length - 1 ? 14 : 0 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ic color={iconColor}>
                            {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
                            {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                            {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                            {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                          </Ic>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: tp }}>{item.title}</div>
                          <div style={{ fontSize: 13, color: ts, marginTop: 2 }}>{item.sub}</div>
                        </div>
                        <div style={{ fontSize: 12, color: ts, flexShrink: 0 }}>{new Date(item.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
