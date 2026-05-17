'use client'
import { useState, useEffect, use, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lead, Session, LeadStatus } from '@/types'
import { avatarColor, initials, timeAgo, capName, US_STATES } from '@/lib/utils'
import { theme, T, BRAND } from '@/lib/tokens'
import DashboardShell from '@/components/layout/DashboardShell'
import { getPipelineStages } from '@/components/ui/LeadPipeline'
import { ROOFING_VALID_TRANSITIONS } from '@/lib/trades/roofing/state-machine'
import InsuranceClaimFields from '@/components/roofing/InsuranceClaimFields'
import JobPhotoLog from '@/components/roofing/JobPhotoLog'
import WarrantyRecord from '@/components/roofing/WarrantyRecord'

const STAGES: LeadStatus[] = ['New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Paid']
const STAGE_ORDER: Record<string, number> = {
  // Generic
  New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5,
  // Roofing — matches registry order
  lead_in: 0, inspection_scheduled: 1, proposal_sent: 2, proposal_signed: 3,
  insurance_approved: 4, scheduled: 5, in_progress: 6, job_won: 7,
  lost: 8, unqualified: 9,
  // HVAC
  new_call: 0, diagnosed: 1, quoted: 2, parts_ordered: 3,
}

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

function LeadDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const _from      = searchParams.get('from')   // 'calendar' | 'clients' | null
  const fromCalendar = _from === 'calendar'
  const fromClients  = _from === 'clients'

  // Back nav — maps `from` param to label + href
  const _fromEstId = searchParams.get('est_id')
  function backNav() {
    if (_from === 'calendar')  return { label: 'Back to Calendar',  href: '/dashboard/calendar' }
    if (_from === 'clients')   return { label: 'Back to Clients',   href: '/dashboard/clients' }
    if (_from === 'estimates') return { label: 'Back to Estimate',  href: _fromEstId ? `/dashboard/estimates/${_fromEstId}` : '/dashboard/estimates' }
    return { label: 'Back to Pipeline', href: '/dashboard/pipeline' }
  }

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
  const [confirmBack,        setConfirmBack]        = useState<LeadStatus | null>(null)
  const [warnScheduled,      setWarnScheduled]      = useState(false)   // P2-1
  const [warnCompleted,      setWarnCompleted]       = useState(false)   // P2-2
  const [warnNewEstimate,    setWarnNewEstimate]     = useState(false)   // P2-3

  // drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dPhone, setDPhone] = useState('')
  const [dEmail, setDEmail] = useState('')
  const [dCity, setDCity] = useState('')
  const [dState, setDState] = useState('')
  const [dSource, setDSource] = useState('')
  const [dScheduled, setDScheduled] = useState('')
  const [dScheduledTime, setDScheduledTime] = useState('')
  const [dFollowUp, setDFollowUp] = useState('')
  const [dStatus, setDStatus] = useState<LeadStatus>('New')
  const [dNotes, setDNotes] = useState('')
  const [savingDrawer, setSavingDrawer] = useState(false)

  // conversation composer
  const [composerText, setComposerText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [toasts,       setToasts]       = useState<ToastItem[]>([])
  const [leadEstimate, setLeadEstimate] = useState<{ id: string; estimate_number: string; total: number; invoice_id?: string } | null>(null)
  const [leadInvoice,  setLeadInvoice]  = useState<{ id: string; invoice_number: string; status: string; balance_due: number } | null>(null)
  const [creatingEst,  setCreatingEst]  = useState(false)
  const [creatingInv,  setCreatingInv]  = useState(false)
  const [depositCollected, setDepositCollected] = useState(false)
  const [toastSeq, setToastSeq] = useState(0)
  const stageBarRef = useRef<HTMLDivElement>(null)
  const activePillRef = useRef<HTMLButtonElement>(null)

  // Tab + trade state
  type DetailTab = 'details' | 'photos' | 'estimate' | 'activity'
  const [activeTab,     setActiveTab]     = useState<DetailTab>('details')
  const [showWarranty,  setShowWarranty]  = useState(false)
  const [showMoveSheet, setShowMoveSheet] = useState(false)
  const isRoofingTrade = ['roofing-contractor','roofing','roofer'].includes(session?.trade_slug ?? '')

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

  // Fetch existing estimate for this lead
  useEffect(() => {
    if (!session || !lead) return
    // Fetch estimate for this lead — C1 FIX: pick by status priority not newest
    fetch(`/api/estimates?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => {
        const leadEstimates = (d.estimates || []).filter((e: any) => e.lead_id === lead.id && !['void','declined'].includes(e.status))
        if (leadEstimates.length === 0) return
        const priority = ['invoiced', 'approved', 'paid', 'sent', 'viewed', 'draft']
        const best = leadEstimates.sort((a: any, b: any) =>
          (priority.indexOf(a.status) < priority.indexOf(b.status) ? -1 : 1)
        )[0]
        if (best) setLeadEstimate(best)
      })
      .catch(() => {})
    // Fetch invoice for this lead
    fetch(`/api/invoices?pro_id=${session.id}&lead_id=${lead.id}`)
      .then(r => r.json())
      .then(d => {
        const inv = (d.invoices || []).find((i: any) => i.status !== 'void')
        if (inv) setLeadInvoice(inv)
      })
      .catch(() => {})
  }, [session, lead])

  // Scroll active stage pill into view on mobile
  useEffect(() => {
    if (activePillRef.current && stageBarRef.current) {
      activePillRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentStage])

  function openDrawer() {
    if (!lead) return
    setDPhone(lead.contact_phone || '')
    setDEmail(lead.contact_email || '')
    setDCity(lead.contact_city || '')
    setDState(lead.contact_state || '')
    setDSource((lead.lead_source || '').replace(/_/g,' '))
    setDScheduled(lead.scheduled_date || '')
    setDScheduledTime((lead as any).scheduled_time || '')
    setDFollowUp(lead.follow_up_date || '')
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
    // P2-1: Warn moving to Scheduled with no approved/invoiced/paid estimate
    if (stage === 'Scheduled' && !leadEstimate?.id) {
      const hasApproved = leadEstimate && ['approved','invoiced','paid'].includes((leadEstimate as any).status || '')
      if (!hasApproved) { setWarnScheduled(true); return }
    }
    // P2-2: Warn moving to Completed with no invoice
    if (stage === 'Completed' && !leadInvoice) { setWarnCompleted(true); return }
    const prev = currentStage
    setCurrentStage(stage)
    setStageSaving(true)
    const ok = await patchLead({ lead_status: stage })
    setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: stage } : l); addToast(`Moved to ${stage.replace(/_/g,' ')}`, 'success', prev) }
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
      scheduled_time: dScheduledTime || null,
      follow_up_date: dFollowUp || null,
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
  const t = theme(dk)
  const bg = t.pageBg
  const card = t.cardBg
  const border = t.cardBorder
  const tp = t.textPri
  const ts = t.textMuted
  const inputBg = t.cardBgAlt
  const inputStyle = { fontSize: 15, padding: '8px 10px', borderRadius: T.radSm, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%', fontFamily: 'inherit', outline: 'none' }
  const selectStyle = { ...inputStyle }

  if (!session) return null

  const overdueFU = isOverdue(lead?.follow_up_date ?? null)
  const tomorrowFU = isTomorrow(lead?.follow_up_date ?? null)
  const nba = lead ? getNBA(lead, currentStage) : null
  const activity = getActivity()
  const curIdx = STAGE_ORDER[currentStage] ?? 0
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E1F5EE', '#0F6E56']
  const locationStr = [lead?.contact_city, lead?.contact_state].filter(Boolean).join(', ') || null

  const createEstimate = async () => {
    if (!lead || !session || creatingEst) return
    // P2-3: Warn creating estimate for New lead (not yet contacted)
    if (lead.lead_status === 'New') { setWarnNewEstimate(true); return }
    setCreatingEst(true)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          lead_id:       lead.id,
          lead_name:     lead.contact_name,
          lead_source:   lead.lead_source || '',
          trade:         session.trade || '',
          state:         session.state || '',
          contact_phone: lead.contact_phone || '',
          contact_email: lead.contact_email || '',
        }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${id}`)
    } catch { setCreatingEst(false) }
  }

  // P2 proceed functions
  async function proceedToScheduled() {
    setWarnScheduled(false)
    const prev = currentStage; setCurrentStage('Scheduled'); setStageSaving(true)
    const ok = await patchLead({ lead_status: 'Scheduled' })
    setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: 'Scheduled' } : l); addToast('Moved to Scheduled', 'success', prev) }
    else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function proceedToCompleted() {
    setWarnCompleted(false)
    const prev = currentStage; setCurrentStage('Completed'); setStageSaving(true)
    const ok = await patchLead({ lead_status: 'Completed' })
    setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: 'Completed' } : l); addToast('Moved to Completed', 'success', prev) }
    else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function proceedCreateEstimate() {
    setWarnNewEstimate(false)
    if (!lead || !session) return
    setCreatingEst(true)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id: session.id, lead_id: lead.id, lead_name: lead.contact_name,
          lead_source: lead.lead_source || '', trade: session.trade || '',
          state: session.state || '', contact_phone: lead.contact_phone || '',
          contact_email: lead.contact_email || '',
        }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${id}`)
    } catch { setCreatingEst(false) }
  }

  const createInvoice = async () => {
    if (!lead || !session || creatingInv) return
    // If invoice already exists navigate to it
    if (leadInvoice) { router.push(`/dashboard/invoices/${leadInvoice.id}`); return }
    setCreatingInv(true)
    try {
      const r = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          lead_id:       lead.id,
          estimate_id:   leadEstimate?.id || undefined,
          lead_name:     lead.contact_name,
          deposit_paid:  depositCollected ? (leadEstimate as any)?.deposit_amount || 0 : 0,
          trade:         session.trade || '',
          contact_name:  lead.contact_name,
          contact_email: lead.contact_email || '',
          contact_phone: lead.contact_phone || '',
        }),
      })
      const d = await r.json()
      if (d.invoice?.id) router.push(`/dashboard/invoices/${d.invoice.id}`)
    } catch { /* toast shown by push failure */ }
    finally { setCreatingInv(false) }
  }

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={() => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }}>
      <div style={{ background: bg, minHeight: '100vh', padding: '12px 16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', overflowX: 'hidden', maxWidth: '100vw' }}>

        {/* Toasts */}
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 400, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', alignItems: 'center' }}>
          {toasts.map(t => (
            <div key={t.id} style={{ pointerEvents: 'all', background: t.type === 'error' ? '#FEF2F2' : '#F0FDF4', border: `1.5px solid ${t.type === 'error' ? '#FECACA' : '#BBF7D0'}`, borderRadius: 12, padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 500, color: t.type === 'error' ? '#991B1B' : '#166534', minWidth: 280, maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.prevStage && t.type === 'success' && <button onClick={() => handleUndo(t.id, t.prevStage!)} style={{ fontSize: 15, color: '#0F766E', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, whiteSpace: 'nowrap' }}>Undo</button>}
              <button onClick={() => dismissToast(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>

        {/* Backward confirm modal */}
        {/* ── P2-1: Warn Scheduled without approved estimate ── */}
        {warnScheduled && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setWarnScheduled(false)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: tp }}>No approved estimate</div>
                  <div style={{ fontSize: 14, color: ts, marginTop: 2 }}>This lead hasn't been quoted yet.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => { setWarnScheduled(false); createEstimate() }} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Create Estimate First</button>
                <button onClick={proceedToScheduled} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Schedule Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* ── P2-2: Warn Completed without invoice ── */}
        {warnCompleted && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setWarnCompleted(false)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: tp }}>No invoice created</div>
                  <div style={{ fontSize: 14, color: ts, marginTop: 2 }}>Create an invoice before marking complete.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => { setWarnCompleted(false); createInvoice() }} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Create Invoice First</button>
                <button onClick={proceedToCompleted} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Mark Complete Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* ── P2-3: Warn creating estimate for New lead ── */}
        {warnNewEstimate && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setWarnNewEstimate(false)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: tp }}>Lead not yet contacted</div>
                  <div style={{ fontSize: 14, color: ts, marginTop: 2 }}>Sending an estimate before making contact has lower acceptance rates.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => { setWarnNewEstimate(false); handleStageClick('Contacted') }} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Contact First</button>
                <button onClick={proceedCreateEstimate} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Send Anyway</button>
              </div>
            </div>
          </div>
        )}

        {confirmBack && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConfirmBack(null)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 16, fontWeight: 500, color: tp, marginBottom: 8 }}>Move back to {confirmBack}?</p>
              <p style={{ fontSize: 15, color: ts, marginBottom: 20 }}>This lead is currently <strong>{currentStage}</strong>. Moving backward is allowed but recorded.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmBack(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 15 }}>Cancel</button>
                <button onClick={handleConfirmBack} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 15, fontWeight: 500 }}>Move back</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Lead Drawer — bottom sheet on mobile, side panel on desktop */}
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
              onClick={() => setDrawerOpen(false)}
            />

            {/* Panel — bottom sheet mobile, right side panel desktop */}
            <div
              className="md:top-0 md:bottom-0 md:left-auto md:right-0 md:w-[420px] md:max-h-none md:rounded-none md:border-l"
              style={{
                position: 'fixed',
                zIndex: 501,
                background: card,
                display: 'flex',
                flexDirection: 'column',
                bottom: 0,
                left: 0,
                right: 0,
                maxHeight: '92dvh',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
                borderLeft: `1px solid ${border}`,
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle — mobile only */}
              <div className="md:hidden" style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: border }} />
              </div>

              {/* Header */}
              <div style={{ padding: '12px 20px 14px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: tp }}>Edit Lead</div>
                  <div style={{ fontSize: 14, color: ts, marginTop: 2 }}>{capName(lead?.contact_name || 'Unknown')}</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 22, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
              </div>

              {/* Scrollable form area */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px 12px', WebkitOverflowScrolling: 'touch' as any }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Phone + Email */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</label>
                      <input value={dPhone} onChange={e => setDPhone(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box', width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
                      <input value={dEmail} onChange={e => setDEmail(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box', width: '100%' }} />
                    </div>
                  </div>

                  {/* City + State */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>City</label>
                      <input value={dCity} onChange={e => setDCity(e.target.value)} placeholder="Jacksonville" style={{ ...inputStyle, boxSizing: 'border-box', width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>State</label>
                      <select value={dState} onChange={e => setDState(e.target.value)} style={{ ...selectStyle, boxSizing: 'border-box', width: '100%' }}>
                        <option value="">—</option>
                        {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Scheduled date + time */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scheduled date &amp; time</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input type="date" value={dScheduled} onChange={e => setDScheduled(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box', width: '100%', colorScheme: dk ? 'dark' : 'light' }} />
                      <input type="time" value={dScheduledTime} onChange={e => setDScheduledTime(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box', width: '100%', colorScheme: dk ? 'dark' : 'light' }} />
                    </div>
                  </div>

                  {/* Follow-up date */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Follow-up date</label>
                    <input type="date" value={dFollowUp} onChange={e => setDFollowUp(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box', width: '100%', colorScheme: dk ? 'dark' : 'light' }} />
                  </div>

                  {/* Source */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</label>
                    <select value={dSource} onChange={e => setDSource(e.target.value)} style={{ ...selectStyle, boxSizing: 'border-box', width: '100%' }}>
                      {SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Estimate value — read-only, set by estimate system */}
                  {leadEstimate && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: dk ? '#0f172a' : '#F0FDFA', border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Estimate Value</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#0F766E' }}>${leadEstimate.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <button onClick={() => router.push(`/dashboard/estimates/${leadEstimate.id}?from=pipeline&lead_id=${id}`)}
                        style={{ fontSize: 13, color: '#0F766E', background: 'white', border: '1px solid #CCFBF1', borderRadius: 8, cursor: 'pointer', padding: '6px 12px', fontWeight: 600 }}>
                        #{leadEstimate.estimate_number} →
                      </button>
                    </div>
                  )}

                  {/* Lead status */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lead status</label>
                    <select value={dStatus} onChange={e => setDStatus(e.target.value as LeadStatus)} style={{ ...selectStyle, boxSizing: 'border-box', width: '100%' }}>
                      {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</label>
                    <textarea value={dNotes} onChange={e => setDNotes(e.target.value)} rows={4} maxLength={500} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 90, boxSizing: 'border-box', width: '100%' }} />
                    <div style={{ fontSize: 12, color: ts, textAlign: 'right', marginTop: 3 }}>{dNotes.length}/500</div>
                  </div>

                </div>
              </div>

              {/* Sticky footer */}
              <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: `1px solid ${border}`, background: card, paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <button onClick={() => setDrawerOpen(false)} style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${border}`, background: t.cardBgAlt, color: tp, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Cancel</button>
                  <button onClick={handleSaveDrawer} disabled={savingDrawer} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: 'white', cursor: 'pointer', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 12px rgba(15,118,110,0.35)' }}>
                    {savingDrawer ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
                {lead && (
                  <div style={{ fontSize: 12, color: ts, opacity: 0.7 }}>
                    Created {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {(lead.lead_source || 'Unknown').replace(/_/g,' ')}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 15 }}>Loading...</div>}
        {notFound && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 15 }}>Lead not found.</div>}

        {!loading && !notFound && lead && (() => {
          const nbaData    = getNBA(lead, currentStage)
          const stages     = getPipelineStages(session?.trade_slug)
          const stageObj   = stages.find(s => s.key === currentStage)
          const activeStgs = stages.filter(s => !s.terminal)
          const curPos     = activeStgs.findIndex(s => s.key === currentStage)
          const nextStage  = activeStgs[curPos + 1] ?? null
          const nextLabel  = stageObj?.nextLabel ?? (nextStage ? `Move to ${nextStage.label}` : null)
          const TIPS: Record<string, string> = {
  lead_in:              'Call within 1 hour — response rate drops 80% after 24hrs.',
  inspection_scheduled: 'Confirm appointment the evening before. Bring a moisture meter.',
  proposal_sent:        'Follow up in 48hrs if no response. Most jobs are won on the follow-up.',
  proposal_signed:      'Collect deposit now — 25–33% is standard. Send receipt immediately.',
  insurance_approved:   'Order materials within 24hrs to lock price. Verify permit requirements.',
  scheduled:            'Send job start reminder to homeowner 48hrs before crew arrives.',
  in_progress:          'Take photos at each phase: decking, installation, completion.',
  job_won:              'Request a Google review within 24hrs of payment — 70% response rate.',
}
          const stageTip   = TIPS[currentStage] ?? ''

          const tabs: { key: DetailTab; label: string }[] = [
            { key: 'details',  label: 'Job Details' },
            ...(isRoofingTrade ? [{ key: 'photos' as DetailTab, label: 'Photos' }] : []),
            { key: 'estimate', label: 'Estimate' },
            { key: 'activity', label: 'Activity' },
          ]

          return (
            <>
              {/* Warranty modal */}
              {showWarranty && isRoofingTrade && (
                <WarrantyRecord
                  leadId={lead.id} proId={session!.id} propertyId={null} darkMode={dk}
                  onSaved={() => { setShowWarranty(false); addToast('Warranty recorded') }}
                  onDismiss={() => setShowWarranty(false)}
                />
              )}

              {/* ── Move sheet — valid transitions from current stage ── */}
              {showMoveSheet && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 60,
                  background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                  onClick={() => setShowMoveSheet(false)}>
                  <div style={{ width: '100%', maxWidth: 520, background: card,
                    borderRadius: '20px 20px 0 0', padding: '0 0 max(20px, env(safe-area-inset-bottom))',
                    boxShadow: '0 -24px 60px rgba(0,0,0,0.2)' }}
                    onClick={e => e.stopPropagation()}>
                    {/* Handle */}
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 4px' }}>
                      <div style={{ width: 32, height: 4, borderRadius: 2, background: dk ? '#334155' : '#E5E7EB' }} />
                    </div>
                    {/* Header */}
                    <div style={{ padding: '8px 20px 14px', borderBottom: `1px solid ${border}` }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: tp, letterSpacing: '-0.02em' }}>
                        Move job
                      </div>
                      <div style={{ fontSize: 13, color: ts, marginTop: 2 }}>
                        Currently: <span style={{ fontWeight: 600, color: stageObj?.color ?? '#0F766E' }}>{stageObj?.label ?? currentStage}</span>
                      </div>
                    </div>
                    {/* Valid transitions */}
                    <div style={{ padding: '8px 16px' }}>
                      {(() => {
                        const validKeys = isRoofingTrade
                          ? (ROOFING_VALID_TRANSITIONS[currentStage as keyof typeof ROOFING_VALID_TRANSITIONS] ?? [])
                          : stages.filter(s => s.key !== currentStage).map(s => s.key)
                        const validStages = validKeys
                          .map(k => stages.find(s => s.key === k))
                          .filter(Boolean) as typeof stages
                        const forward  = validStages.filter(s => {
                          const curPos = stages.findIndex(s2 => s2.key === currentStage)
                          const tgtPos = stages.findIndex(s2 => s2.key === s.key)
                          return tgtPos > curPos && !s.terminal
                        })
                        const terminal = validStages.filter(s => s.terminal)
                        const backward = validStages.filter(s => {
                          const curPos = stages.findIndex(s2 => s2.key === currentStage)
                          const tgtPos = stages.findIndex(s2 => s2.key === s.key)
                          return tgtPos < curPos && !s.terminal
                        })

                        function MoveBtn({ stg, fwd }: { stg: typeof stages[0]; fwd: boolean }) {
                          return (
                            <button
                              onClick={() => {
                                setShowMoveSheet(false)
                                if (!fwd) { setConfirmBack(stg.key as LeadStatus); return }
                                handleStageClick(stg.key as LeadStatus)
                              }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                padding: '13px 14px', borderRadius: 10, border: `1.5px solid ${border}`,
                                background: fwd ? (dk ? '#0F1A2B' : stg.bg) : (dk ? '#1E293B' : '#F9F8F6'),
                                cursor: 'pointer', marginBottom: 6, transition: 'all 0.15s',
                                textAlign: 'left' as const,
                              }}>
                              {/* Color dot */}
                              <div style={{ width: 10, height: 10, borderRadius: '50%',
                                background: stg.color, flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: fwd ? stg.color : ts }}>
                                  {stg.label}
                                </div>
                                {stg.subLabel && (
                                  <div style={{ fontSize: 12, color: ts, marginTop: 1 }}>{stg.subLabel}</div>
                                )}
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke={fwd ? stg.color : ts} strokeWidth="2.5" strokeLinecap="round">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                              </svg>
                            </button>
                          )
                        }

                        return (
                          <>
                            {forward.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#475569' : '#9CA3AF',
                                  textTransform: 'uppercase', letterSpacing: '0.08em',
                                  margin: '10px 0 8px' }}>Move forward</div>
                                {forward.map(s => <MoveBtn key={s.key} stg={s} fwd={true} />)}
                              </div>
                            )}
                            {terminal.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#475569' : '#9CA3AF',
                                  textTransform: 'uppercase', letterSpacing: '0.08em',
                                  margin: '10px 0 8px' }}>Close job</div>
                                {terminal.map(s => <MoveBtn key={s.key} stg={s} fwd={false} />)}
                              </div>
                            )}
                            {backward.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#475569' : '#9CA3AF',
                                  textTransform: 'uppercase', letterSpacing: '0.08em',
                                  margin: '10px 0 8px' }}>Move back</div>
                                {backward.map(s => <MoveBtn key={s.key} stg={s} fwd={false} />)}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    <div style={{ padding: '4px 16px 0' }}>
                      <button onClick={() => setShowMoveSheet(false)}
                        style={{ width: '100%', padding: '13px', borderRadius: 10, border: `1.5px solid ${border}`,
                          background: 'transparent', color: ts, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Top nav ────────────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button onClick={() => router.push(backNav().href)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: ts,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: 'auto' }}>
                  <Ic color={ts}><polyline points="15 18 9 12 15 6"/></Ic>
                  {backNav().label}
                </button>
                {lead.contact_phone && (
                  <a href={`tel:${lead.contact_phone.replace(/\D/g,'')}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                      borderRadius: 8, border: `1px solid ${border}`, background: card,
                      color: tp, fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
                    <Ic color={tp}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Ic>
                    Call
                  </a>
                )}
                <button onClick={openDrawer}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                    borderRadius: 8, border: `1.5px solid ${border}`, background: 'none',
                    color: ts, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
              </div>

              {/* ── Two-column layout on desktop — left: action, right: activity ─── */}
              <div className="md:grid md:gap-4" style={{ gridTemplateColumns: '1fr 340px' }}>

                {/* ── LEFT COLUMN ──────────────────────────────────────── */}
                <div>

                  {/* ── HERO — dominant card ────────────────────────────── */}
                  <div style={{
                    background: card,
                    borderRadius: 16,
                    marginBottom: 10,
                    overflow: 'hidden',
                    border: `1px solid ${border}`,
                    borderLeft: `5px solid ${stageObj?.color ?? '#0F766E'}`,
                    boxShadow: dk ? 'none' : '0 4px 20px rgba(0,0,0,0.08)',
                  }}>
                    {/* Identity */}
                    <div style={{ padding: '18px 20px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 14, background: avBg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 17, fontWeight: 800, color: avFg, flexShrink: 0, letterSpacing: '-0.02em' }}>
                            {initials(lead.contact_name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: tp, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                              {capName(lead.contact_name)}
                            </div>
                            {(lead as any).property_address ? (
                              <div style={{ fontSize: 13, color: '#0F766E', fontWeight: 600, marginTop: 3,
                                display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                {(lead as any).property_address}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: ts, marginTop: 2 }}>
                                {[lead.contact_phone, lead.lead_source?.replace(/_/g,' ')].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Value badge */}
                        {lead.quoted_amount != null && (
                          <div style={{ flexShrink: 0, textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: ts, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Value</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F766E', letterSpacing: '-0.03em' }}>
                              ${Number(lead.quoted_amount).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Stage + meta */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                          background: stageObj?.bg ?? '#F0FDFA', color: stageObj?.color ?? '#0F766E',
                        }}>{stageObj?.label ?? currentStage}</span>
                        <span style={{ fontSize: 12, color: ts }}>{timeAgo(lead.created_at)}</span>
                        {nbaData.urgent && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Needs attention
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── Progress bar ─────────────────────────────────── */}
                    <div style={{ borderTop: `1px solid ${border}`, padding: '14px 20px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8 }}>
                        {activeStgs.map((stg, i) => {
                          const done   = i < curPos
                          const active = i === curPos
                          const isLast = i === activeStgs.length - 1
                          return (
                            <div key={stg.key} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
                              <button
                                onClick={() => {
                                  if (active || stageSaving) return
                                  if (i < curPos) setConfirmBack(stg.key as LeadStatus)
                                }}
                                title={stg.label}
                                style={{
                                  width: active ? 16 : 10, height: active ? 16 : 10,
                                  borderRadius: '50%', flexShrink: 0, padding: 0,
                                  background: active ? stg.color : done ? stg.color : (dk ? '#334155' : '#E2E8F0'),
                                  border: active ? `2.5px solid white` : 'none',
                                  boxShadow: active ? `0 0 0 2.5px ${stg.color}` : 'none',
                                  cursor: i < curPos ? 'pointer' : 'default',
                                  transition: 'all 0.25s',
                                }}
                              />
                              {!isLast && (
                                <div style={{
                                  flex: 1, height: 2, margin: '0 2px',
                                  background: done ? stg.color : (dk ? '#1E293B' : '#E2E8F0'),
                                  transition: 'background 0.3s',
                                }} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: stageObj?.color ?? '#0F766E' }}>
                          {stageObj?.label ?? currentStage}
                        </span>
                        {nextStage && (
                          <span style={{ fontSize: 12, color: ts }}>
                            Next: <span style={{ fontWeight: 600 }}>{nextStage.label}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── Move this job — opens valid-transitions sheet ────── */}
                    <div style={{ padding: '0 20px 18px' }}>
                      {(currentStage === 'job_won' || currentStage === 'unqualified') ? (
                        <div style={{ padding: '14px 20px', borderRadius: 12, textAlign: 'center',
                          background: currentStage === 'job_won'
                            ? 'linear-gradient(135deg, #065F46, #047857)'
                            : (dk ? '#1E293B' : '#F3F4F6'),
                          color: currentStage === 'job_won' ? 'white' : ts,
                          fontSize: 15, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          {currentStage === 'job_won' ? (
                            <>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                              Job Complete
                            </>
                          ) : 'Lead Unqualified'}
                        </div>
                      ) : (
                        <button onClick={() => setShowMoveSheet(true)} disabled={stageSaving}
                          style={{
                            width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
                            cursor: stageSaving ? 'wait' : 'pointer',
                            background: stageSaving ? (dk ? '#334155' : '#E5E7EB')
                              : 'linear-gradient(135deg, #0F766E, #0D9488)',
                            color: stageSaving ? ts : 'white',
                            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: stageSaving ? 'none' : '0 4px 16px rgba(15,118,110,0.28)',
                            transition: 'all 0.2s',
                          }}>
                          {stageSaving ? 'Updating...' : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                              </svg>
                              Move this job
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </>
                          )}
                        </button>
                      )}
                      {stageTip && currentStage !== 'job_won' && currentStage !== 'unqualified' && (
                        <div style={{ marginTop: 8, fontSize: 12, color: ts, textAlign: 'center', lineHeight: 1.4 }}>
                          💡 {stageTip}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Tabs — visible tab UI with background differentiation ── */}
                  <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12,
                    overflow: 'hidden', boxShadow: dk ? 'none' : '0 2px 10px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', background: dk ? '#111827' : '#F5F4F0',
                      borderBottom: `1px solid ${border}`, padding: '4px 4px 0' }}>
                      {tabs.map(tab => {
                        const active = activeTab === tab.key
                        return (
                          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                              flex: 1, padding: '10px 12px', fontSize: 13,
                              fontWeight: active ? 700 : 500,
                              color: active ? '#0F766E' : (dk ? '#64748B' : '#6B7280'),
                              background: active ? card : 'transparent',
                              border: 'none',
                              borderRadius: active ? '8px 8px 0 0' : '8px 8px 0 0',
                              borderBottom: active ? `none` : 'none',
                              boxShadow: active ? `0 -1px 0 ${border}, 1px 0 0 ${border}, -1px 0 0 ${border}` : 'none',
                              cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                              position: 'relative' as const,
                              zIndex: active ? 1 : 0,
                              marginBottom: active ? -1 : 0,
                            }}>
                            {tab.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* Tab: Job Details */}
                    {activeTab === 'details' && (
                      <div style={{ padding: '16px 18px' }}>
                        {/* Contact grid — alternating rows, visible borders, readable labels */}
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${border}`, marginBottom: 18 }}>
                          {[
                            { label: 'Phone',     value: fmtPhone(lead.contact_phone),                             copy: lead.contact_phone },
                            { label: 'Email',     value: lead.contact_email || '—',                                copy: lead.contact_email },
                            { label: 'Address',   value: (lead as any).property_address || locationStr || '—',      copy: null },
                            { label: 'Source',    value: (lead.lead_source || '—').replace(/_/g,' '),              copy: null },
                            { label: 'Job Date',  value: fmt(lead.scheduled_date),                                  copy: null },
                            { label: 'Follow-up', value: lead.follow_up_date
                              ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {fmt(lead.follow_up_date)}
                                  {overdueFU && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 600 }}>Overdue</span>}
                                </span>
                              : '—', copy: null },
                          ].reduce((rows: any[][], cell, i) => {
                            if (i % 2 === 0) rows.push([cell])
                            else rows[rows.length - 1].push(cell)
                            return rows
                          }, []).map((row, rowIdx) => (
                            <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                              background: rowIdx % 2 === 1 ? (dk ? '#111827' : '#F9F8F6') : card,
                              borderBottom: rowIdx < 2 ? `1px solid ${border}` : 'none' }}>
                              {row.map(cell => (
                                <div key={cell.label} style={{ padding: '13px 16px',
                                  borderRight: row.indexOf(cell) === 0 ? `1px solid ${border}` : 'none' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#64748B' : '#9CA3AF',
                                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                                    {cell.label}
                                  </div>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: tp,
                                    display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-word' }}>
                                    {cell.value}
                                    {cell.copy && typeof cell.copy === 'string' && <CopyBtn text={cell.copy} color={ts} />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        {isRoofingTrade && (
                          <InsuranceClaimFields
                            leadId={lead.id} proId={session!.id}
                            initial={(lead as any).insurance_data ?? {}}
                            darkMode={dk}
                            onSaved={(data) => setLead(l => l ? { ...l, insurance_data: data } as any : l)}
                          />
                        )}
                        <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${border}` }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: dk ? '#94A3B8' : '#4B5563',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Notes</div>
                          {lead.notes && (
                            <div style={{ fontSize: 14, color: tp, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 10,
                              padding: '10px 12px', background: t.cardBgAlt, borderRadius: 8, border: `1px solid ${border}` }}>
                              {lead.notes}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={composerText} onChange={e => setComposerText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && composerText.trim()) { e.preventDefault(); handleAddNote() } }}
                              placeholder="Add a note..."
                              style={{ flex: 1, fontSize: 14, padding: '9px 12px', borderRadius: 8,
                                border: `1px solid ${border}`, background: card, color: tp, outline: 'none', fontFamily: 'inherit' }} />
                            <button onClick={handleAddNote} disabled={savingNote || !composerText.trim()}
                              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0F766E',
                                color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !composerText.trim() ? 0.4 : 1 }}>
                              {savingNote ? '...' : 'Save'}
                            </button>
                          </div>
                        </div>
                        {lead.message && (
                          <div style={{ marginTop: 14, padding: '12px 14px', background: t.cardBgAlt, borderRadius: 8, border: `1px solid ${border}` }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: dk ? '#94A3B8' : '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Original message</div>
                            <div style={{ fontSize: 14, color: tp, lineHeight: 1.6, fontStyle: 'italic' }}>"{lead.message}"</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: Photos */}
                    {activeTab === 'photos' && isRoofingTrade && (
                      <div style={{ padding: '16px 18px' }}>
                        <JobPhotoLog leadId={lead.id} proId={session!.id} isRoofing={isRoofingTrade} darkMode={dk} />
                      </div>
                    )}

                    {/* Tab: Estimate */}
                    {activeTab === 'estimate' && (
                      <div style={{ padding: '16px 18px' }}>
                        {leadEstimate ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ padding: '16px 18px', borderRadius: 12, background: '#F0FDFA', border: '1px solid #CCFBF1',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Estimate</div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#0F766E', letterSpacing: '-0.03em' }}>
                                  ${leadEstimate.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                              <button onClick={() => router.push(`/dashboard/estimates/${leadEstimate.id}?from=pipeline&lead_id=${id}`)}
                                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                                Open #{leadEstimate.estimate_number}
                              </button>
                            </div>
                            {leadInvoice && (
                              <div style={{ padding: '14px 16px', borderRadius: 10, background: '#FFF7ED', border: '1px solid #FED7AA',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Invoice</div>
                                  <div style={{ fontSize: 18, fontWeight: 700, color: '#C2410C' }}>${leadInvoice.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}  due</div>
                                </div>
                                <button onClick={() => router.push(`/dashboard/invoices/${leadInvoice.id}?from=pipeline&lead_id=${id}`)}
                                  style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#C2410C', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                                  View Invoice
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '32px 0' }}>
                            <div style={{ fontSize: 14, color: ts, marginBottom: 16 }}>No estimate yet</div>
                            <button onClick={createEstimate} disabled={creatingEst}
                              style={{ padding: '11px 28px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: creatingEst ? 0.7 : 1 }}>
                              {creatingEst ? 'Creating...' : '+ Create Estimate'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: Activity */}
                    {activeTab === 'activity' && (
                      <div style={{ padding: '16px 18px' }}>
                        {activity.length === 0
                          ? <div style={{ textAlign: 'center', padding: '32px 0', color: ts, fontSize: 14 }}>No activity recorded yet.</div>
                          : activity.map((item, i) => {
                            const iconColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#3C3489' : '#0F766E'
                            const iconBg    = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEEDFE' : '#E1F5EE'
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Ic color={iconColor} size={14}>
                                    {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </Ic>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: tp }}>{item.title}</div>
                                  <div style={{ fontSize: 13, color: ts, marginTop: 2 }}>{item.sub}</div>
                                </div>
                                <div style={{ fontSize: 12, color: ts, flexShrink: 0 }}>
                                  {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            )
                          })
                        }
                      </div>
                    )}
                  </div>
                </div>{/* end left column */}

                {/* ── RIGHT COLUMN — Activity sidebar (desktop only) ─── */}
                <div className="hidden md:block">
                  <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12,
                    position: 'sticky', top: 16, maxHeight: 'calc(100vh - 120px)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: tp }}>Activity</div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                      {activity.length === 0 ? (
                        <div style={{ fontSize: 13, color: ts, textAlign: 'center', padding: '24px 0' }}>No activity yet</div>
                      ) : activity.map((item, i) => {
                        const iconColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#3C3489' : '#0F766E'
                        const iconBg    = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEEDFE' : '#E1F5EE'
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                            paddingBottom: 12, marginBottom: 12,
                            borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: iconBg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Ic color={iconColor} size={12}>
                                {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                              </Ic>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: tp }}>{item.title}</div>
                              <div style={{ fontSize: 12, color: ts, marginTop: 1, lineHeight: 1.4 }}>{item.sub}</div>
                              <div style={{ fontSize: 11, color: ts, opacity: 0.6, marginTop: 3 }}>
                                {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>{/* end right column */}

              </div>{/* end two-column grid */}
            </>
          )
        })()}

      </div>
    </DashboardShell>
  )
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <LeadDetailInner params={params} />
    </Suspense>
  )
}
