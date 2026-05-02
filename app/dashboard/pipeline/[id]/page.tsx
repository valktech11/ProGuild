'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Lead, Session, LeadStatus } from '@/types'
import { avatarColor, initials, timeAgo } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'

const STAGES: LeadStatus[] = ['New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Paid']
const STAGE_ORDER: Record<string, number> = { New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5 }

const SOURCE_OPTIONS = ['Profile Page','Job Post','Search Result','Direct','Registry Card','Phone Call','Facebook','Instagram','Referral','Website','Yard Sign','Walk In','Other']
const STATUS_OPTIONS: LeadStatus[] = ['New','Contacted','Quoted','Scheduled','Completed','Paid']

interface LeadWithLocation extends Lead {
  contact_city: string | null
  contact_state: string | null
  updated_at: string
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtPhone(p: string | null): string {
  if (!p) return '—'
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return p
}
function isOverdue(d: string | null): boolean {
  if (!d) return false
  return new Date(d) < new Date()
}
function isTomorrow(d: string | null): boolean {
  if (!d) return false
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const dt = new Date(d)
  return dt.toDateString() === tomorrow.toDateString()
}
function shortId(id: string): string {
  return id.replace(/-/g,'').slice(0,8).toUpperCase()
}
function getNBA(lead: LeadWithLocation, stage: LeadStatus): { label: string; sub: string; urgent: boolean; icon: string } {
  const days = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
  switch (stage) {
    case 'New': return days > 3
      ? { label: 'Call now — overdue response', sub: `Lead is ${days} days old with no contact.`, urgent: true, icon: 'alert' }
      : { label: 'Call or message this lead', sub: 'Respond quickly to win the job.', urgent: false, icon: 'bell' }
    case 'Contacted': return { label: 'Send a quote', sub: 'Customer contacted. Send your estimate now.', urgent: false, icon: 'doc' }
    case 'Quoted':    return { label: 'Follow up (no response)', sub: 'Customer has not replied to the estimate yet.', urgent: true, icon: 'alert' }
    case 'Scheduled': return { label: 'Confirm the job day', sub: `Job is scheduled for ${fmt(lead.scheduled_date)}. Send a reminder before the date.`, urgent: false, icon: 'bell' }
    case 'Completed': return { label: 'Generate invoice & request review', sub: 'Job is done — collect payment and get a review.', urgent: false, icon: 'check' }
    case 'Paid':      return { label: 'Request a review', sub: 'Ask the customer to leave you a review.', urgent: false, icon: 'star' }
    default:          return { label: 'Review this lead', sub: '', urgent: false, icon: 'bell' }
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

function CopyBtn({ text, color }: { text: string; color: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={copy} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color, opacity: copied ? 1 : 0.5, transition: 'opacity 0.15s' }}>
      <Ic color={color} size={13}>
        {copied ? <polyline points="20 6 9 17 4 12"/> : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>}
      </Ic>
    </button>
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
  const [lead, setLead] = useState<LeadWithLocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [currentStage, setCurrentStage] = useState<LeadStatus>('New')
  const [stageSaving, setStageSaving] = useState(false)
  const [confirmBack, setConfirmBack] = useState<LeadStatus | null>(null)

  // drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dPhone, setDPhone] = useState('')
  const [dEmail, setDEmail] = useState('')
  const [dCity, setDCity] = useState('')
  const [dState, setDState] = useState('')
  const [dSource, setDSource] = useState('')
  const [dScheduled, setDScheduled] = useState('')
  const [dFollowUp, setDFollowUp] = useState('')
  const [dJobType, setDJobType] = useState('')
  const [dQuote, setDQuote] = useState('')
  const [dStatus, setDStatus] = useState<LeadStatus>('New')
  const [dNotes, setDNotes] = useState('')
  const [savingDrawer, setSavingDrawer] = useState(false)

  // conversation composer
  const [composerText, setComposerText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

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
        const l = data.lead as LeadWithLocation
        setLead(l)
        setCurrentStage(l.lead_status as LeadStatus)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, id, router])

  function openDrawer() {
    if (!lead) return
    setDPhone(lead.contact_phone || '')
    setDEmail(lead.contact_email || '')
    setDCity(lead.contact_city || '')
    setDState(lead.contact_state || '')
    setDSource((lead.lead_source || '').replace(/_/g,' '))
    setDScheduled(lead.scheduled_date || '')
    setDFollowUp(lead.follow_up_date || '')
    setDJobType((lead as any).job_type || '')
    setDQuote(lead.quoted_amount != null ? String(lead.quoted_amount) : '')
    setDStatus(currentStage)
    setDNotes(lead.notes || '')
    setDrawerOpen(true)
  }

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

  async function handleSaveDrawer() {
    setSavingDrawer(true)
    const sourceRaw = dSource.replace(/ /g,'_') as any
    const ok = await patchLead({
      contact_phone: dPhone || null,
      contact_email: dEmail || null,
      contact_city: dCity || null,
      contact_state: dState || null,
      lead_source: sourceRaw || null,
      scheduled_date: dScheduled || null,
      follow_up_date: dFollowUp || null,
      quoted_amount: dQuote ? parseFloat(dQuote) : null,
      lead_status: dStatus,
      notes: dNotes || null,
    })
    setSavingDrawer(false)
    if (ok) {
      setLead(l => l ? {
        ...l,
        contact_phone: dPhone || null,
        contact_email: dEmail || null,
        contact_city: dCity || null,
        contact_state: dState || null,
        lead_source: sourceRaw || null,
        scheduled_date: dScheduled || null,
        follow_up_date: dFollowUp || null,
        quoted_amount: dQuote ? parseFloat(dQuote) : null,
        lead_status: dStatus,
        notes: dNotes || null,
      } : l)
      setCurrentStage(dStatus)
      setDrawerOpen(false)
      addToast('Lead updated')
    } else addToast('Failed to save', 'error')
  }

  async function handleAddNote() {
    if (!composerText.trim()) return
    setSavingNote(true)
    const newNotes = lead?.notes ? `${lead.notes}\n\n${composerText.trim()}` : composerText.trim()
    const ok = await patchLead({ notes: newNotes })
    setSavingNote(false)
    if (ok) { setLead(l => l ? { ...l, notes: newNotes } : l); setComposerText(''); addToast('Note saved') }
    else addToast('Failed to save note', 'error')
  }

  function getActivity() {
    if (!lead) return []
    const items: { date: string; title: string; sub: string; type: string }[] = []
    items.push({ date: lead.created_at, title: 'Lead created', sub: `From ${(lead.lead_source || 'unknown').replace(/_/g,' ')}${lead.message ? ` · "${lead.message.slice(0,60)}${lead.message.length > 60 ? '…' : ''}"` : ''}`, type: 'created' })
    if (lead.quoted_amount != null) items.push({ date: lead.updated_at || lead.created_at, title: 'Quote amount set', sub: `$${Number(lead.quoted_amount).toLocaleString()}`, type: 'quote' })
    if (lead.scheduled_date) items.push({ date: lead.updated_at || lead.created_at, title: 'Job scheduled', sub: fmt(lead.scheduled_date), type: 'scheduled' })
    if (lead.notes) {
      lead.notes.split(/\n\n+/).filter(Boolean).forEach(n => {
        items.push({ date: lead.updated_at || lead.created_at, title: 'Note added', sub: n.slice(0,100) + (n.length > 100 ? '…' : ''), type: 'note' })
      })
    }
    return items.reverse()
  }

  // theme
  const bg = dk ? '#0A1628' : '#F5F4F0'
  const card = dk ? '#1E293B' : '#FFFFFF'
  const border = dk ? '#2D3748' : '#E8E2D9'
  const tp = dk ? '#F1F5F9' : '#111827'
  const ts = dk ? '#94A3B8' : '#6B7280'
  const inputBg = dk ? '#0F172A' : '#F9FAFB'
  const inputStyle = { fontSize: 14, padding: '8px 10px', borderRadius: 7, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%', fontFamily: 'inherit', outline: 'none' }
  const selectStyle = { ...inputStyle }

  if (!session) return null

  const overdueFU = isOverdue(lead?.follow_up_date ?? null)
  const tomorrowFU = isTomorrow(lead?.follow_up_date ?? null)
  const nba = lead ? getNBA(lead, currentStage) : null
  const activity = getActivity()
  const curIdx = STAGE_ORDER[currentStage] ?? 0
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E1F5EE', '#0F6E56']
  const locationStr = [lead?.contact_city, lead?.contact_state].filter(Boolean).join(', ') || null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={() => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }}>
      <div style={{ background: bg, minHeight: '100vh', padding: '20px 24px', paddingBottom: 60 }}>

        {/* Toasts */}
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 400, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', alignItems: 'center' }}>
          {toasts.map(t => (
            <div key={t.id} style={{ pointerEvents: 'all', background: t.type === 'error' ? '#FEF2F2' : '#F0FDF4', border: `1.5px solid ${t.type === 'error' ? '#FECACA' : '#BBF7D0'}`, borderRadius: 12, padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 500, color: t.type === 'error' ? '#991B1B' : '#166534', minWidth: 280, maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.prevStage && t.type === 'success' && <button onClick={() => handleUndo(t.id, t.prevStage!)} style={{ fontSize: 14, color: '#0F766E', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, whiteSpace: 'nowrap' }}>Undo</button>}
              <button onClick={() => dismissToast(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>

        {/* Backward confirm modal */}
        {confirmBack && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConfirmBack(null)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 16, fontWeight: 500, color: tp, marginBottom: 8 }}>Move back to {confirmBack}?</p>
              <p style={{ fontSize: 14, color: ts, marginBottom: 20 }}>This lead is currently <strong>{currentStage}</strong>. Moving backward is allowed but recorded.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmBack(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={handleConfirmBack} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Move back</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Lead Drawer */}
        {drawerOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex' }} onClick={() => setDrawerOpen(false)}>
            <div style={{ flex: 1 }} />
            <div style={{ width: 380, background: card, borderLeft: `1px solid ${border}`, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              {/* Drawer header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: tp }}>Edit Lead</div>
                  <div style={{ fontSize: 13, color: ts, marginTop: 2 }}>Update lead information</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 22, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
              </div>

              {/* Drawer form */}
              <div style={{ padding: '20px 24px', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Phone</label>
                    <input value={dPhone} onChange={e => setDPhone(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Email</label>
                    <input value={dEmail} onChange={e => setDEmail(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>City</label>
                    <input value={dCity} onChange={e => setDCity(e.target.value)} placeholder="Jacksonville" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>State</label>
                    <input value={dState} onChange={e => setDState(e.target.value)} placeholder="FL" maxLength={2} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Scheduled date</label>
                    <input type="date" value={dScheduled} onChange={e => setDScheduled(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Follow-up date</label>
                    <input type="date" value={dFollowUp} onChange={e => setDFollowUp(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Source</label>
                    <select value={dSource} onChange={e => setDSource(e.target.value)} style={selectStyle}>
                      {SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Estimated value</label>
                    <input type="number" value={dQuote} onChange={e => setDQuote(e.target.value)} placeholder="0.00" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Lead status</label>
                    <select value={dStatus} onChange={e => setDStatus(e.target.value as LeadStatus)} style={selectStyle}>
                      {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Lead owner</label>
                    <input value={session.name} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 12, color: ts, display: 'block', marginBottom: 5 }}>Notes</label>
                  <textarea value={dNotes} onChange={e => setDNotes(e.target.value)} rows={4} maxLength={500} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                  <div style={{ fontSize: 11, color: ts, textAlign: 'right', marginTop: 3 }}>{dNotes.length}/500</div>
                </div>

                {/* Drawer footer buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
                  <button onClick={() => setDrawerOpen(false)} style={{ padding: '10px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Cancel</button>
                  <button onClick={handleSaveDrawer} disabled={savingDrawer} style={{ padding: '10px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                    {savingDrawer ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>

                {/* Audit trail */}
                {lead && (
                  <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: tp, marginBottom: 10 }}>Lead created</div>
                    <div style={{ fontSize: 13, color: ts, marginBottom: 4 }}>{new Date(lead.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(lead.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                    <div style={{ fontSize: 13, color: ts, marginBottom: 4 }}>Created by <span style={{ color: tp, fontWeight: 500 }}>{session.name}</span></div>
                    <div style={{ fontSize: 13, color: ts }}>Source · <span style={{ color: tp }}>{(lead.lead_source || 'Unknown').replace(/_/g,' ')}{lead.message ? ` · "${lead.message.slice(0,40)}…"` : ''}</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 14 }}>Loading...</div>}
        {notFound && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 14 }}>Lead not found.</div>}

        {!loading && !notFound && lead && (() => {
          const nbaData = getNBA(lead, currentStage)
          return (
            <>
              {/* Top nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <button onClick={() => router.push('/dashboard/pipeline')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: ts, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Ic color={ts}><polyline points="15 18 9 12 15 6"/></Ic>
                  Back to Pipeline
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: tp, fontSize: 14, cursor: 'pointer' }}>
                    <Ic color={tp}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Ic>
                    Call
                  </button>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: tp, fontSize: 14, cursor: 'pointer' }}>
                    <Ic color={tp}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></Ic>
                    Send SMS
                  </button>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                    <Ic color="white"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Ic>
                    Follow Up
                  </button>
                  <button style={{ padding: '8px 11px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: ts, fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>···</button>
                </div>
              </div>

              {/* Hero */}
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: avBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 500, color: avFg, flexShrink: 0 }}>
                    {initials(lead.contact_name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontSize: 26, fontWeight: 500, color: tp }}>{lead.contact_name}</span>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#EEEDFE', color: '#3C3489', fontWeight: 500 }}>{currentStage}</span>
                      <span style={{ fontSize: 14, color: ts }}>· {timeAgo(lead.created_at)}</span>
                      {overdueFU && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 }}>Overdue</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: ts, flexWrap: 'wrap' }}>
                      {lead.lead_source && <><span>{lead.lead_source.replace(/_/g,' ')}</span><span style={{ opacity: 0.4 }}>·</span></>}
                      {lead.quoted_amount != null && <><span>${Number(lead.quoted_amount).toLocaleString()} est. value</span><span style={{ opacity: 0.4 }}>·</span></>}
                      <span>Lead #{shortId(lead.id)}</span>
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
                          padding: '7px 16px', borderRadius: 20, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
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

              {/* Next Action card */}
              <div style={{ background: dk ? '#1A1A3E' : '#F0EFFF', border: `1px solid ${dk ? '#2D2D5E' : '#D4D0F7'}`, borderRadius: 14, padding: '20px 24px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: dk ? '#2D2D5E' : '#DDD9FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic color="#7C3AED" size={22}>
                    {nbaData.icon === 'bell'  && <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>}
                    {nbaData.icon === 'alert' && <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}
                    {nbaData.icon === 'doc'   && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                    {nbaData.icon === 'check' && <polyline points="20 6 9 17 4 12"/>}
                    {nbaData.icon === 'star'  && <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
                  </Ic>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Next action</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: dk ? '#E0DEFF' : '#1E1B4B', marginBottom: 4 }}>{nbaData.label}</div>
                  <div style={{ fontSize: 14, color: dk ? '#A5B4FC' : '#6D6494' }}>{nbaData.sub}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#0F766E', color: 'white', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <Ic color="white" size={14}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Ic>
                    Call Now
                  </button>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: card, color: tp, border: `1px solid ${border}`, borderRadius: 9, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <Ic color={tp} size={14}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></Ic>
                    Send Reminder SMS
                  </button>
                </div>
              </div>

              {/* Contact info strip */}
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, marginBottom: 10, display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>
                {[
                  { icon: 'phone', label: 'Phone', value: fmtPhone(lead.contact_phone), copy: lead.contact_phone },
                  { icon: 'email', label: 'Email', value: lead.contact_email || '—', copy: lead.contact_email },
                  { icon: 'pin', label: 'Location', value: locationStr || '—', copy: null },
                  { icon: 'source', label: 'Source', value: (lead.lead_source || '—').replace(/_/g,' '), copy: null },
                  { icon: 'calendar', label: 'Scheduled Date', value: fmt(lead.scheduled_date), copy: null },
                  {
                    icon: 'followup', label: 'Follow-up Date',
                    value: lead.follow_up_date
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {fmt(lead.follow_up_date)}
                          {tomorrowFU && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontWeight: 500 }}>Tomorrow</span>}
                          {overdueFU && !tomorrowFU && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 }}>Overdue</span>}
                        </span>
                      : '—',
                    copy: null
                  },
                ].map((cell, ci, arr) => (
                  <div key={cell.label} style={{ flex: '1 1 0', minWidth: 110, padding: '14px 16px', borderRight: ci < arr.length - 1 ? `1px solid ${border}` : 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Ic color="#0F766E" size={13}>
                        {cell.icon === 'phone'    && <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>}
                        {cell.icon === 'email'    && <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>}
                        {cell.icon === 'pin'      && <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>}
                        {cell.icon === 'source'   && <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>}
                        {cell.icon === 'calendar' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                        {cell.icon === 'followup' && <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>}
                      </Ic>
                      <span style={{ fontSize: 12, color: ts }}>{cell.label}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: tp, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {cell.value}
                      {cell.copy && typeof cell.copy === 'string' && <CopyBtn text={cell.copy} color={ts} />}
                    </div>
                  </div>
                ))}
                {/* Edit pencil at far right */}
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', borderLeft: `1px solid ${border}`, flexShrink: 0 }}>
                  <button onClick={openDrawer} title="Edit lead info" style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                    <Ic color={ts} size={16}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Ic>
                  </button>
                </div>
              </div>

              {/* Conversation */}
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span style={{ fontSize: 17, fontWeight: 500, color: tp }}>Conversation</span>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: ts, background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Ic color={ts} size={14}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></Ic>
                    Filter
                    <Ic color={ts} size={12}><polyline points="6 9 12 15 18 9"/></Ic>
                  </button>
                </div>

                {/* Activity feed */}
                {activity.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: ts, fontSize: 14 }}>No activity yet.</div>
                  : activity.map((item, i) => {
                    const iconColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#3C3489' : item.type === 'scheduled' ? '#0F766E' : '#0F766E'
                    const iconBg = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEEDFE' : '#E1F5EE'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ic color={iconColor} size={16}>
                            {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
                            {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                            {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                            {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                          </Ic>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 500, color: tp }}>{item.title}</div>
                          <div style={{ fontSize: 14, color: ts, marginTop: 3 }}>{item.sub}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, color: ts }}>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div style={{ fontSize: 13, color: ts }}>{new Date(item.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    )
                  })
                }

                {/* Composer */}
                <div style={{ marginTop: 16, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <textarea
                    value={composerText}
                    onChange={e => setComposerText(e.target.value)}
                    placeholder="Add a note or send a message..."
                    rows={2}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 14, background: inputBg, color: tp, border: 'none', resize: 'none', fontFamily: 'inherit', outline: 'none', display: 'block' }}
                  />
                  <div style={{ display: 'flex', borderTop: `1px solid ${border}` }}>
                    {[
                      { label: 'Add Note', icon: 'note', action: handleAddNote, primary: true },
                      { label: 'Send SMS', icon: 'sms', action: () => addToast('SMS coming in v76', 'error'), primary: false },
                      { label: 'Log Call', icon: 'call', action: () => addToast('Call log coming in v76', 'error'), primary: false },
                    ].map((btn, bi) => (
                      <button
                        key={btn.label}
                        onClick={btn.action}
                        disabled={btn.primary && (savingNote || !composerText.trim())}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '11px 0', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                          background: btn.primary && composerText.trim() ? '#0F766E' : 'transparent',
                          color: btn.primary && composerText.trim() ? 'white' : ts,
                          border: 'none',
                          borderRight: bi < 2 ? `1px solid ${border}` : 'none',
                          transition: 'background 0.15s',
                        }}
                      >
                        <Ic color={btn.primary && composerText.trim() ? 'white' : ts} size={14}>
                          {btn.icon === 'note' && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                          {btn.icon === 'sms'  && <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>}
                          {btn.icon === 'call' && <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>}
                        </Ic>
                        {savingNote && btn.primary ? 'Saving…' : btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </DashboardShell>
  )
}
