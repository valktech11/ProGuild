'use client'
import { useState, useEffect, use, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lead, Session, LeadStatus } from '@/types'
import { avatarColor, initials, capName, US_STATES } from '@/lib/utils'
import { theme, T, BRAND } from '@/lib/tokens'
import DashboardShell from '@/components/layout/DashboardShell'
import { getPipelineStages } from '@/components/ui/LeadPipeline'
import { ROOFING_VALID_TRANSITIONS } from '@/lib/trades/roofing/state-machine'
import InsuranceClaimFields from '@/components/roofing/InsuranceClaimFields'
import JobPhotoLog from '@/components/roofing/JobPhotoLog'
import WarrantyRecord from '@/components/roofing/WarrantyRecord'

// ── Stage ordering ────────────────────────────────────────────────────────────
const STAGE_ORDER: Record<string, number> = {
  New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5,
  lead_in: 0, inspection_scheduled: 1, proposal_sent: 2, proposal_signed: 3,
  insurance_approved: 4, scheduled: 5, in_progress: 6, job_won: 7,
  lost: 8, unqualified: 9,
  new_call: 0, diagnosed: 1, quoted: 2, parts_ordered: 3,
}

const SOURCE_OPTIONS = [
  'Profile Page','Job Post','Search Result','Direct','Registry Card',
  'Phone Call','Facebook','Instagram','Referral','Website',
  'Yard Sign','Walk In','Other','Insurance','Canvassing',
]

interface LeadWithLocation extends Lead {
  contact_city:  string | null
  contact_state: string | null
  updated_at:    string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtPhone(p: string | null): string {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p
}
function isOverdue(d: string | null) { return !!d && new Date(d) < new Date() }

interface Toast { id: number; msg: string; type: 'success' | 'error'; prev?: LeadStatus }

// ── Tiny SVG wrapper ──────────────────────────────────────────────────────────
function Svg({ size = 14, stroke = 'currentColor', children }: {
  size?: number; stroke?: string; children: React.ReactNode
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

function CopyBtn({ text, muted }: { text: string; muted: string }) {
  const [done, setDone] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }) }
  return (
    <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: muted, opacity: done ? 1 : 0.5, transition: 'opacity 0.15s', lineHeight: 1, display: 'flex' }}>
      <Svg size={13} stroke={muted}>
        {done ? <polyline points="20 6 9 17 4 12"/> : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>}
      </Svg>
    </button>
  )
}

// ── Stage icon SVG paths (for right panel rows) ───────────────────────────────
function StageIcon({ stageKey, color, size = 28 }: { stageKey: string; color: string; size?: number }) {
  const s = size * 0.46
  const isCalendar = ['inspection_scheduled','scheduled','Scheduled'].includes(stageKey)
  const isShield   = stageKey === 'insurance_approved'
  const isHammer   = stageKey === 'in_progress'
  const isTrophy   = stageKey === 'job_won'
  const isX        = ['lost','Lost'].includes(stageKey)
  const isSlash    = stageKey === 'unqualified'
  const isDoor     = stageKey === 'lead_in'
  const isDoc      = ['proposal_sent','proposal_signed','Quoted'].includes(stageKey)

  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color + '1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Svg size={s} stroke={color}>
        {isDoor     && <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>}
        {isCalendar && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
        {isDoc      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
        {isShield   && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
        {isHammer   && <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>}
        {isTrophy   && <><path d="M8 21h8M12 17v4M17 5H7l1 8a4 4 0 008 0z"/><path d="M17 5V3H7v2"/><path d="M5 5a3 3 0 000 6h2M19 5a3 3 0 010 6h-2"/></>}
        {isX        && <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}
        {isSlash    && <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>}
        {!isDoor && !isCalendar && !isDoc && !isShield && !isHammer && !isTrophy && !isX && !isSlash && <circle cx="12" cy="12" r="10"/>}
      </Svg>
    </div>
  )
}

// ── Tab icon paths ────────────────────────────────────────────────────────────
const TAB_ICON: Record<string, React.ReactNode> = {
  details:  <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  photos:   <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  estimate: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
}

// ── Main component ────────────────────────────────────────────────────────────
function LeadDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id }      = use(params)
  const router      = useRouter()
  const searchParams = useSearchParams()
  const fromParam   = searchParams.get('from')
  const fromEstId   = searchParams.get('est_id')

  function backNav() {
    if (fromParam === 'calendar')  return { label: 'Back to Calendar',  href: '/dashboard/calendar' }
    if (fromParam === 'clients')   return { label: 'Back to Clients',   href: '/dashboard/clients' }
    if (fromParam === 'estimates') return { label: 'Back to Estimate',  href: fromEstId ? `/dashboard/estimates/${fromEstId}` : '/dashboard/estimates' }
    return { label: 'Back to Pipeline', href: '/dashboard/pipeline' }
  }

  // ── Session ──────────────────────────────────────────────────────────────
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(false)
  useEffect(() => { if (typeof window !== 'undefined') setDk(localStorage.getItem('pg_darkmode') === '1') }, [])
  function toggleDark() { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }

  // ── Data ─────────────────────────────────────────────────────────────────
  const [lead,         setLead]         = useState<LeadWithLocation | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [notFound,     setNotFound]     = useState(false)
  const [currentStage, setCurrentStage] = useState<LeadStatus>('New')
  const [stageSaving,  setStageSaving]  = useState(false)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [confirmBack,      setConfirmBack]      = useState<LeadStatus | null>(null)
  const [warnScheduled,    setWarnScheduled]    = useState(false)
  const [warnCompleted,    setWarnCompleted]    = useState(false)
  const [warnNewEstimate,  setWarnNewEstimate]  = useState(false)
  const [drawerOpen,       setDrawerOpen]       = useState(false)
  const [showWarranty,     setShowWarranty]     = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)   // status dropdown
  type DetailTab = 'details' | 'photos' | 'estimate' | 'activity'
  const [activeTab, setActiveTab] = useState<DetailTab>('details')

  // ── Drawer form fields ────────────────────────────────────────────────────
  const [dPhone, setDPhone]           = useState('')
  const [dEmail, setDEmail]           = useState('')
  const [dCity,  setDCity]            = useState('')
  const [dState, setDState]           = useState('')
  const [dSource, setDSource]         = useState('')
  const [dScheduled, setDScheduled]   = useState('')
  const [dSchedTime, setDSchedTime]   = useState('')
  const [dFollowUp, setDFollowUp]     = useState('')
  const [dNotes, setDNotes]           = useState('')
  const [savingDrawer, setSavingDrawer] = useState(false)

  // ── Notes composer ────────────────────────────────────────────────────────
  const [noteText,  setNoteText]  = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // ── Toasts ────────────────────────────────────────────────────────────────
  const [toasts, setToasts]   = useState<Toast[]>([])
  const [toastSeq, setToastSeq] = useState(0)
  function addToast(msg: string, type: Toast['type'] = 'success', prev?: LeadStatus) {
    const tid = toastSeq + 1; setToastSeq(tid)
    setToasts(t => [...t, { id: tid, msg, type, prev }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 5000)
  }
  function killToast(tid: number) { setToasts(t => t.filter(x => x.id !== tid)) }

  // ── Estimate / Invoice ────────────────────────────────────────────────────
  const [leadEst, setLeadEst] = useState<{ id: string; estimate_number: string; total: number; status: string } | null>(null)
  const [leadInv, setLeadInv] = useState<{ id: string; invoice_number: string; status: string; balance_due: number } | null>(null)
  const [creatingEst, setCreatingEst] = useState(false)
  const [creatingInv, setCreatingInv] = useState(false)

  const isRoofing = ['roofing-contractor','roofing','roofer'].includes(session?.trade_slug ?? '')

  // ── Fetch lead ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/leads/${id}?pro_id=${session.id}`)
      .then(r => { if (r.status === 404) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(data => {
        if (!data) return
        const l = data.lead as LeadWithLocation
        setLead(l); setCurrentStage(l.lead_status as LeadStatus); setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, id, router])

  // ── Fetch estimate / invoice ──────────────────────────────────────────────
  useEffect(() => {
    if (!session || !lead) return
    fetch(`/api/estimates?pro_id=${session.id}`).then(r => r.json()).then(d => {
      const arr = (d.estimates || []).filter((e: any) => e.lead_id === lead.id && !['void','declined'].includes(e.status))
      if (!arr.length) return
      const priority = ['invoiced','approved','paid','sent','viewed','draft']
      const best = arr.sort((a: any, b: any) => priority.indexOf(a.status) < priority.indexOf(b.status) ? -1 : 1)[0]
      if (best) setLeadEst(best)
    }).catch(() => {})
    fetch(`/api/invoices?pro_id=${session.id}&lead_id=${lead.id}`).then(r => r.json()).then(d => {
      const inv = (d.invoices || []).find((i: any) => i.status !== 'void')
      if (inv) setLeadInv(inv)
    }).catch(() => {})
  }, [session, lead])

  // ── Patch lead ────────────────────────────────────────────────────────────
  const patchLead = useCallback(async (fields: Record<string, unknown>) => {
    if (!session) return false
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, ...fields }),
    })
    return res.ok
  }, [session, id])

  // ── Stage move ────────────────────────────────────────────────────────────
  async function moveToStage(stage: LeadStatus, skipWarnings = false) {
    if (stage === currentStage || stageSaving) return
    if (STAGE_ORDER[stage] < STAGE_ORDER[currentStage]) { setConfirmBack(stage); return }
    if (!skipWarnings) {
      if (stage === 'Scheduled' && !leadEst) { setWarnScheduled(true); return }
      if (stage === 'Completed' && !leadInv) { setWarnCompleted(true); return }
    }
    const prev = currentStage
    setCurrentStage(stage); setStageSaving(true)
    const ok = await patchLead({ lead_status: stage })
    setStageSaving(false)
    if (ok) {
      setLead(l => l ? { ...l, lead_status: stage } : l)
      addToast(`Moved to ${stage.replace(/_/g, ' ')}`, 'success', prev)
      if (stage === 'job_won' && isRoofing) setShowWarranty(true)
    } else {
      setCurrentStage(prev); addToast('Failed to update stage', 'error')
    }
  }

  async function confirmMoveBack() {
    if (!confirmBack) return
    const stage = confirmBack; const prev = currentStage
    setConfirmBack(null); setCurrentStage(stage); setStageSaving(true)
    const ok = await patchLead({ lead_status: stage })
    setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: stage } : l); addToast(`Moved back to ${stage.replace(/_/g,' ')}`, 'success', prev) }
    else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function undoMove(tid: number, prev: LeadStatus) {
    killToast(tid)
    const from = currentStage; setCurrentStage(prev); setStageSaving(true)
    const ok = await patchLead({ lead_status: prev })
    setStageSaving(false)
    if (!ok) { setCurrentStage(from); addToast('Undo failed', 'error') }
  }

  // ── Drawer ────────────────────────────────────────────────────────────────
  function openDrawer() {
    if (!lead) return
    setDPhone(lead.contact_phone || ''); setDEmail(lead.contact_email || '')
    setDCity(lead.contact_city || ''); setDState(lead.contact_state || '')
    setDSource((lead.lead_source || '').replace(/_/g, ' '))
    setDScheduled(lead.scheduled_date || ''); setDSchedTime((lead as any).scheduled_time || '')
    setDFollowUp(lead.follow_up_date || ''); setDNotes(lead.notes || '')
    setDrawerOpen(true)
  }
  async function saveDrawer() {
    setSavingDrawer(true)
    const ok = await patchLead({
      contact_phone: dPhone || null, contact_email: dEmail || null,
      contact_city:  dCity  || null, contact_state: dState || null,
      lead_source:   dSource.replace(/ /g, '_') || null,
      scheduled_date: dScheduled || null, scheduled_time: dSchedTime || null,
      follow_up_date: dFollowUp  || null, notes: dNotes || null,
    })
    setSavingDrawer(false)
    if (ok) {
      setLead(l => l ? { ...l,
        contact_phone: dPhone || null, contact_email: dEmail || null,
        contact_city:  dCity  || null, contact_state: dState || null,
        lead_source:   dSource.replace(/ /g, '_') as any || null,
        scheduled_date: dScheduled || null, follow_up_date: dFollowUp || null,
        notes: dNotes || null,
      } : l)
      setDrawerOpen(false); addToast('Lead updated')
    } else addToast('Failed to save', 'error')
  }

  // ── Note ─────────────────────────────────────────────────────────────────
  async function saveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const newNotes = lead?.notes ? `${lead.notes}\n\n${noteText.trim()}` : noteText.trim()
    const ok = await patchLead({ notes: newNotes })
    setSavingNote(false)
    if (ok) { setLead(l => l ? { ...l, notes: newNotes } : l); setNoteText(''); addToast('Note saved') }
    else addToast('Failed to save note', 'error')
  }

  // ── Estimate / Invoice creation ───────────────────────────────────────────
  async function createEstimate() {
    if (!lead || !session || creatingEst) return
    if (lead.lead_status === 'New') { setWarnNewEstimate(true); return }
    setCreatingEst(true)
    try {
      const r = await fetch('/api/estimates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, lead_id: lead.id, lead_name: lead.contact_name, lead_source: lead.lead_source || '', trade: session.trade || '', state: session.state || '', contact_phone: lead.contact_phone || '', contact_email: lead.contact_email || '' }) })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${id}`)
    } catch { setCreatingEst(false) }
  }
  async function createInvoice() {
    if (!lead || !session || creatingInv) return
    if (leadInv) { router.push(`/dashboard/invoices/${leadInv.id}`); return }
    setCreatingInv(true)
    try {
      const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, lead_id: lead.id, estimate_id: leadEst?.id, lead_name: lead.contact_name, trade: session.trade || '', contact_name: lead.contact_name, contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '' }) })
      const d = await r.json()
      if (d.invoice?.id) router.push(`/dashboard/invoices/${d.invoice.id}`)
    } catch {} finally { setCreatingInv(false) }
  }

  // ── Activity log ──────────────────────────────────────────────────────────
  function getActivity() {
    if (!lead) return []
    const items: { date: string; title: string; sub: string; type: string }[] = []
    items.push({ date: lead.created_at, title: 'Lead created', sub: `From ${(lead.lead_source || 'unknown').replace(/_/g,' ')}${lead.message ? ` · "${lead.message.slice(0,60)}${lead.message.length > 60 ? '…' : ''}"` : ''}`, type: 'created' })
    if (lead.quoted_amount != null) items.push({ date: lead.updated_at || lead.created_at, title: 'Quote amount set', sub: `$${Number(lead.quoted_amount).toLocaleString()}`, type: 'quote' })
    if (lead.scheduled_date) items.push({ date: lead.updated_at || lead.created_at, title: 'Job scheduled', sub: fmt(lead.scheduled_date), type: 'scheduled' })
    if (lead.notes) lead.notes.split(/\n\n+/).filter(Boolean).forEach(n => items.push({ date: lead.updated_at || lead.created_at, title: 'Note added', sub: n.slice(0,100) + (n.length > 100 ? '…' : ''), type: 'note' }))
    return items.reverse()
  }

  // ── Rule-based insights ───────────────────────────────────────────────────
  function getInsights() {
    if (!lead) return []
    const insights: { color: string; title: string; body: string; sub: string; icon: React.ReactNode }[] = []
    const mins = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000)
    if (mins <= 30) insights.push({ color: '#10B981', title: 'High close probability', body: `Responded within ${mins < 1 ? '1' : mins} min${mins !== 1 ? 's' : ''}`, sub: 'Call now — hot lead', icon: <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/> })
    const hour = new Date().getHours()
    insights.push({ color: '#6366F1', title: 'Best callback window', body: hour < 17 ? '5:00 PM – 7:00 PM' : hour < 20 ? 'Now is best time' : '10:00 AM – 12:00 PM', sub: 'Today', icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> })
    if (isRoofing) insights.push({ color: '#F59E0B', title: 'Roof size likely', body: '28 – 34 SQ', sub: 'Based on satellite scan', icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></> })
    return insights
  }

  // ── Stage tips ────────────────────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    lead_in:              'Call within 1 hour — response rate drops 80% after 24hrs.',
    inspection_scheduled: 'Confirm appointment the evening before. Bring a moisture meter.',
    proposal_sent:        'Follow up in 48hrs if no response. Most jobs are won on the follow-up.',
    proposal_signed:      'Collect deposit now — 25–33% is standard.',
    insurance_approved:   'Order materials within 24hrs to lock price.',
    scheduled:            'Send job start reminder to homeowner 48hrs before crew arrives.',
    in_progress:          'Take photos at each phase: decking, installation, completion.',
    job_won:              'Request a Google review within 24hrs — 70% response rate.',
  }

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const t      = theme(dk)
  const pg     = t.pageBg
  const card   = t.cardBg
  const border = t.cardBorder
  const tp     = t.textPri
  const tb     = t.textBody
  const ts     = t.textMuted
  const tsu    = t.textSubtle

  const inputStyle: React.CSSProperties = {
    fontSize: T.fontBody, padding: '8px 10px', borderRadius: T.radSm,
    border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: tp,
    width: '100%', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  if (!session) return null

  // ── Computed values that need lead ────────────────────────────────────────
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E1F5EE', '#0F6E56']
  const activity    = getActivity()
  const insights    = getInsights()

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: pg, minHeight: '100vh', padding: '16px 20px 80px', boxSizing: 'border-box' }}>

        {/* ── Toasts ───────────────────────────────────────────────────────── */}
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 400, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', alignItems: 'center' }}>
          {toasts.map(toast => (
            <div key={toast.id} style={{ pointerEvents: 'all', background: toast.type === 'error' ? t.dangerBg : t.successBg, border: `1.5px solid ${toast.type === 'error' ? t.dangerBorder : t.successBorder}`, borderRadius: T.radMd, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, fontSize: T.fontBody, fontWeight: 500, color: toast.type === 'error' ? '#991B1B' : '#166534', minWidth: 260, maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.10)' }}>
              <span style={{ flex: 1 }}>{toast.msg}</span>
              {toast.prev && toast.type === 'success' && <button onClick={() => undoMove(toast.id, toast.prev!)} style={{ fontSize: T.fontBody, color: BRAND.teal, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Undo</button>}
              <button onClick={() => killToast(toast.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>

        {/* ── Modals ───────────────────────────────────────────────────────── */}

        {/* Confirm move back */}
        {confirmBack && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp4 }} onClick={() => setConfirmBack(null)}>
            <div style={{ background: card, borderRadius: T.radLg, padding: T.sp6, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: T.fontLabel, fontWeight: 600, color: tp, marginBottom: T.sp2 }}>Move back to {String(confirmBack).replace(/_/g,' ')}?</p>
              <p style={{ fontSize: T.fontBody, color: tb, marginBottom: T.sp5 }}>Currently <strong>{String(currentStage).replace(/_/g,' ')}</strong>. Moving backward is tracked.</p>
              <div style={{ display: 'flex', gap: T.sp2, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmBack(null)} style={{ padding: '8px 16px', borderRadius: T.radSm, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: T.fontBody }}>Cancel</button>
                <button onClick={confirmMoveBack} style={{ padding: '8px 16px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', cursor: 'pointer', fontSize: T.fontBody, fontWeight: 600 }}>Move back</button>
              </div>
            </div>
          </div>
        )}

        {/* Warn: no estimate before Scheduled */}
        {warnScheduled && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp4 }} onClick={() => setWarnScheduled(false)}>
            <div style={{ background: card, borderRadius: T.radLg, padding: T.sp6, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: T.fontEmphasis, fontWeight: 700, color: tp, marginBottom: 6 }}>No approved estimate</p>
              <p style={{ fontSize: T.fontBody, color: tb, marginBottom: T.sp4 }}>This lead hasn't been quoted yet.</p>
              <div style={{ display: 'flex', gap: T.sp2, justifyContent: 'flex-end' }}>
                <button onClick={() => { setWarnScheduled(false); createEstimate() }} style={{ padding: '9px 16px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', cursor: 'pointer', fontSize: T.fontBody, fontWeight: 700 }}>Create Estimate First</button>
                <button onClick={() => { setWarnScheduled(false); moveToStage('Scheduled' as LeadStatus, true) }} style={{ padding: '9px 16px', borderRadius: T.radSm, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: T.fontBody }}>Schedule Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* Warn: no invoice before Completed */}
        {warnCompleted && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp4 }} onClick={() => setWarnCompleted(false)}>
            <div style={{ background: card, borderRadius: T.radLg, padding: T.sp6, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: T.fontEmphasis, fontWeight: 700, color: tp, marginBottom: 6 }}>No invoice created</p>
              <p style={{ fontSize: T.fontBody, color: tb, marginBottom: T.sp4 }}>Create an invoice before marking complete.</p>
              <div style={{ display: 'flex', gap: T.sp2, justifyContent: 'flex-end' }}>
                <button onClick={() => { setWarnCompleted(false); createInvoice() }} style={{ padding: '9px 16px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', cursor: 'pointer', fontSize: T.fontBody, fontWeight: 700 }}>Create Invoice First</button>
                <button onClick={() => { setWarnCompleted(false); moveToStage('Completed' as LeadStatus, true) }} style={{ padding: '9px 16px', borderRadius: T.radSm, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: T.fontBody }}>Mark Complete Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* Warn: estimate before contact */}
        {warnNewEstimate && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp4 }} onClick={() => setWarnNewEstimate(false)}>
            <div style={{ background: card, borderRadius: T.radLg, padding: T.sp6, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: T.fontEmphasis, fontWeight: 700, color: tp, marginBottom: 6 }}>Lead not yet contacted</p>
              <p style={{ fontSize: T.fontBody, color: tb, marginBottom: T.sp4 }}>Sending an estimate before contact has lower acceptance rates.</p>
              <div style={{ display: 'flex', gap: T.sp2, justifyContent: 'flex-end' }}>
                <button onClick={() => { setWarnNewEstimate(false); moveToStage('Contacted' as LeadStatus) }} style={{ padding: '9px 16px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', cursor: 'pointer', fontSize: T.fontBody, fontWeight: 700 }}>Contact First</button>
                <button onClick={() => { setWarnNewEstimate(false); createEstimate() }} style={{ padding: '9px 16px', borderRadius: T.radSm, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: T.fontBody }}>Send Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Drawer ───────────────────────────────────────────────────── */}
        {drawerOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setDrawerOpen(false)} />
            <div className="md:top-0 md:bottom-0 md:left-auto md:right-0 md:w-[420px] md:max-h-none md:rounded-none"
              style={{ position: 'fixed', zIndex: 501, background: card, display: 'flex', flexDirection: 'column', bottom: 0, left: 0, right: 0, maxHeight: '92dvh', borderRadius: `${T.radXl}px ${T.radXl}px 0 0`, boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', borderLeft: `1px solid ${border}` }}
              onClick={e => e.stopPropagation()}>
              <div className="md:hidden" style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: border }} />
              </div>
              <div style={{ padding: `${T.sp3}px ${T.sp5}px 14px`, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: T.fontHeading, fontWeight: 700, color: tp }}>Edit Lead</div>
                  <div style={{ fontSize: T.fontBody, color: ts, marginTop: 2 }}>{capName(lead?.contact_name || '')}</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 22, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `${T.sp4}px ${T.sp5}px ${T.sp3}px` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp3 + 2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp3 }}>
                    <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</label><input value={dPhone} onChange={e => setDPhone(e.target.value)} style={inputStyle} /></div>
                    <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label><input value={dEmail} onChange={e => setDEmail(e.target.value)} style={inputStyle} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp3 }}>
                    <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>City</label><input value={dCity} onChange={e => setDCity(e.target.value)} placeholder="Jacksonville" style={inputStyle} /></div>
                    <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>State</label>
                      <select value={dState} onChange={e => setDState(e.target.value)} style={inputStyle}><option value="">—</option>{US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select>
                    </div>
                  </div>
                  <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scheduled date &amp; time</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp2 }}>
                      <input type="date" value={dScheduled} onChange={e => setDScheduled(e.target.value)} style={{ ...inputStyle, colorScheme: dk ? 'dark' : 'light' }} />
                      <input type="time" value={dSchedTime} onChange={e => setDSchedTime(e.target.value)} style={{ ...inputStyle, colorScheme: dk ? 'dark' : 'light' }} />
                    </div>
                  </div>
                  <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Follow-up date</label><input type="date" value={dFollowUp} onChange={e => setDFollowUp(e.target.value)} style={{ ...inputStyle, colorScheme: dk ? 'dark' : 'light' }} /></div>
                  <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</label>
                    <select value={dSource} onChange={e => setDSource(e.target.value)} style={inputStyle}>{SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}</select>
                  </div>
                  {leadEst && (
                    <div style={{ padding: '10px 14px', borderRadius: T.radSm, background: t.successBg, border: `1px solid ${t.successBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div><div style={{ fontSize: T.fontBadge, fontWeight: 700, color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Estimate</div><div style={{ fontSize: T.fontHeading, fontWeight: 800, color: BRAND.teal }}>${leadEst.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                      <button onClick={() => router.push(`/dashboard/estimates/${leadEst.id}?from=pipeline&lead_id=${id}`)} style={{ fontSize: T.fontSub, color: BRAND.teal, background: '#fff', border: `1px solid ${t.successBorder}`, borderRadius: T.radSm, cursor: 'pointer', padding: '6px 12px', fontWeight: 600 }}>#{leadEst.estimate_number} →</button>
                    </div>
                  )}
                  <div><label style={{ fontSize: T.fontSub, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</label>
                    <textarea value={dNotes} onChange={e => setDNotes(e.target.value)} rows={4} maxLength={500} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 90 }} />
                    <div style={{ fontSize: T.fontSub, color: tsu, textAlign: 'right', marginTop: 3 }}>{dNotes.length}/500</div>
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, padding: `${T.sp3}px ${T.sp5}px`, borderTop: `1px solid ${border}`, background: card, paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp3 }}>
                  <button onClick={() => setDrawerOpen(false)} style={{ padding: '12px', borderRadius: T.radSm, border: `1px solid ${border}`, background: t.cardBgAlt, color: tp, cursor: 'pointer', fontSize: T.fontEmphasis, fontWeight: 600 }}>Cancel</button>
                  <button onClick={saveDrawer} disabled={savingDrawer} style={{ padding: '12px', borderRadius: T.radSm, border: 'none', background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.tealLight})`, color: '#fff', cursor: 'pointer', fontSize: T.fontEmphasis, fontWeight: 700 }}>{savingDrawer ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Mobile: All Stages bottom sheet */}
        {showStatusPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowStatusPicker(false)} />
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501, background: card, borderRadius: `${T.radXl}px ${T.radXl}px 0 0`, padding: `${T.sp5}px ${T.sp4}px`, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '80dvh', overflowY: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: T.sp4 }}><div style={{ width: 40, height: 4, borderRadius: 2, background: border, margin: '0 auto 16px' }} /></div>
              <div style={{ fontSize: T.fontLabel, fontWeight: 700, color: tp, marginBottom: T.sp3 }}>All Stages</div>
              {lead && (() => {
                const stages = getPipelineStages(session?.trade_slug)
                return stages.filter(s => s.key !== currentStage).map(stg => (
                  <button key={stg.key} onClick={() => { setShowStatusPicker(false); moveToStage(stg.key as LeadStatus) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: T.sp3, padding: '11px 14px', borderRadius: T.radSm, border: `1px solid ${border}`, borderLeft: `3px solid ${stg.terminal ? t.accentRed : stg.color}`, background: card, cursor: 'pointer', textAlign: 'left', marginBottom: T.sp2 }}>
                    <StageIcon stageKey={stg.key} color={stg.terminal ? t.accentRed : stg.color} size={30} />
                    <div><div style={{ fontSize: T.fontBody, fontWeight: 600, color: stg.terminal ? t.accentRed : stg.color }}>{stg.label}</div><div style={{ fontSize: T.fontSub, color: ts }}>{stg.subLabel}</div></div>
                  </button>
                ))
              })()}
            </div>
          </>
        )}

        {/* ── Loading / not found ──────────────────────────────────────────── */}
        {loading   && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: T.fontBody }}>Loading...</div>}
        {notFound  && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: T.fontBody }}>Lead not found.</div>}

        {!loading && !notFound && lead && (() => {
          const stages     = getPipelineStages(session?.trade_slug)
          const stageObj   = stages.find(s => s.key === currentStage)
          const activeStgs = stages.filter(s => !s.terminal)
          const curPos     = activeStgs.findIndex(s => s.key === currentStage)
          const nextStage  = activeStgs[curPos + 1] ?? null
          const isTerminal = currentStage === 'job_won' || currentStage === 'unqualified' || currentStage === 'lost'
          const stageTip   = TIPS[currentStage] ?? ''

          // Valid transitions for right panel
          const validKeys  = isRoofing
            ? (ROOFING_VALID_TRANSITIONS[currentStage as keyof typeof ROOFING_VALID_TRANSITIONS] ?? [])
            : stages.filter(s => s.key !== currentStage).map(s => s.key)
          const validStages = validKeys.map(k => stages.find(s => s.key === k)).filter(Boolean) as typeof stages
          const curPos2    = stages.findIndex(s => s.key === currentStage)
          const fwdStages  = validStages.filter(s => !s.terminal && stages.findIndex(x => x.key === s.key) > curPos2)
          const termStages = validStages.filter(s => s.terminal)
          const bwdStages  = validStages.filter(s => !s.terminal && stages.findIndex(x => x.key === s.key) < curPos2)

          const tabs: { key: DetailTab; label: string }[] = [
            { key: 'details',  label: 'Job Details' },
            ...(isRoofing ? [{ key: 'photos' as DetailTab, label: 'Photos' }] : []),
            { key: 'estimate', label: 'Estimate' },
            { key: 'activity', label: 'Activity' },
          ]

          // ── Identity ─────────────────────────────────────────────────────
          // Primary: property_address > contact_name
          const primaryLabel  = lead.property_address
            ? lead.property_address.replace(/, USA$/, '')
            : capName(lead.contact_name)
          const hasAddress = !!lead.property_address

          // Subtitle: always show contact name + phone + source
          const subtitleParts = [
            capName(lead.contact_name),
            lead.contact_phone ? fmtPhone(lead.contact_phone) : null,
            lead.lead_source   ? lead.lead_source.replace(/_/g, ' ') : null,
          ].filter(Boolean)
          const subtitleLine = subtitleParts.join(' • ')

          // Health: no overdue follow-up and < 7 days old
          const daysOld   = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
          const isHealthy = daysOld <= 7 && !isOverdue(lead.follow_up_date)

          // Created time
          const createdFmt = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            + ' at ' + new Date(lead.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

          // ── Right panel stage row component ──────────────────────────────
          function PanelRow({ stg, isNext, isBack, isTerm }: { stg: typeof stages[0]; isNext?: boolean; isBack?: boolean; isTerm?: boolean; key?: string }) {
            const dotColor = isTerm ? t.accentRed : isBack ? t.textSubtle : stg.color
            const rowBg    = isNext
              ? (dk ? stg.color + '12' : stg.bg)
              : isTerm
                ? (dk ? 'rgba(239,68,68,0.06)' : '#FFF5F5')
                : card
            const rowBorder = isNext
              ? `1.5px solid ${stg.color}45`
              : `1px solid ${border}`
            return (
              <button
                onClick={() => { isTerm || isBack ? setConfirmBack(stg.key as LeadStatus) : moveToStage(stg.key as LeadStatus) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: T.sp3, padding: `${isNext ? 11 : 9}px ${T.sp3}px`, borderRadius: isNext ? T.radMd : T.radSm, border: rowBorder, borderLeft: `3px solid ${dotColor}`, background: rowBg, cursor: 'pointer', textAlign: 'left', marginBottom: T.sp1 + 2, transition: 'all 0.12s', boxShadow: isNext ? `0 2px 8px ${stg.color}18` : 'none' }}>
                <StageIcon stageKey={stg.key} color={dotColor} size={isNext ? 30 : 26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: isNext ? T.fontBody : T.fontSub, fontWeight: isNext ? 700 : 600, color: isTerm ? t.accentRed : isBack ? ts : stg.color }}>{stg.label}</span>
                    {isNext && <span style={{ fontSize: 9, fontWeight: 700, color: stg.color, background: dk ? stg.color + '20' : stg.bg, padding: '2px 6px', borderRadius: 20 }}>Recommended</span>}
                  </div>
                  <div style={{ fontSize: T.fontBadge, color: tsu, marginTop: 2 }}>{stg.subLabel}</div>
                </div>
                <Svg size={11} stroke={dotColor}><path d="M5 12h14M12 5l7 7-7 7"/></Svg>
              </button>
            )
          }

          return (
            <>
              {showWarranty && isRoofing && (
                <WarrantyRecord leadId={lead.id} proId={session!.id} propertyId={null} darkMode={dk}
                  onSaved={() => { setShowWarranty(false); addToast('Warranty recorded') }}
                  onDismiss={() => setShowWarranty(false)} />
              )}

              {/* ── Back nav ──────────────────────────────────────────────── */}
              <div style={{ marginBottom: T.sp4 }}>
                <button onClick={() => router.push(backNav().href)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: T.fontBody, color: ts, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Svg size={14} stroke={ts}><polyline points="15 18 9 12 15 6"/></Svg>
                  {backNav().label}
                </button>
              </div>

              {/* ── Two-column grid ───────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: T.sp3 }}
                className="lg:grid-cols-[1fr_300px]">

                {/* ════ LEFT COLUMN ════════════════════════════════════════ */}
                <div style={{ minWidth: 0 }}>

                  {/* ── HERO CARD ──────────────────────────────────────────── */}
                  <div style={{ background: card, borderRadius: T.radLg, marginBottom: T.sp3, border: `1px solid ${border}`, boxShadow: dk ? 'none' : '0 4px 20px rgba(0,0,0,0.07)', overflow: 'hidden' }}>

                    {/* Identity row */}
                    <div style={{ padding: `${T.sp5}px ${T.sp5}px ${T.sp4}px` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: T.sp3 }}>

                        {/* Avatar + name */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp3, minWidth: 0, flex: 1 }}>
                          <div style={{ width: 50, height: 50, borderRadius: T.radMd, background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.fontLabel, fontWeight: 800, flexShrink: 0, letterSpacing: '-0.02em' }}>
                            {initials(lead.contact_name)}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {/* Primary: address or name */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontSize: 19, fontWeight: 800, color: tp, letterSpacing: '-0.025em', lineHeight: 1.2 }}>
                                {primaryLabel}
                              </span>
                              {/* Health badge */}
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.fontBadge, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isHealthy ? '#DCFCE7' : '#FEE2E2', color: isHealthy ? '#166534' : '#991B1B', flexShrink: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isHealthy ? '#16A34A' : '#DC2626', display: 'inline-block' }} />
                                {isHealthy ? 'Healthy' : 'At Risk'}
                              </span>
                            </div>
                            {/* Subtitle: name • phone • source — always visible */}
                            <div style={{ fontSize: T.fontSub, color: tsu, lineHeight: 1.5 }}>
                              {subtitleLine}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {lead.contact_phone && (
                            <a href={`tel:${lead.contact_phone.replace(/\D/g,'')}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: T.radSm, border: `1px solid ${border}`, background: card, color: tb, fontSize: T.fontSub, textDecoration: 'none', fontWeight: 600 }}>
                              <Svg size={13} stroke={tb}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Svg>
                              Call
                            </a>
                          )}
                          <button onClick={openDrawer}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: T.radSm, border: `1px solid ${border}`, background: 'none', color: ts, fontSize: T.fontSub, fontWeight: 600, cursor: 'pointer' }}>
                            <Svg size={13} stroke={ts}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>
                            Edit
                          </button>
                        </div>
                      </div>

                      {/* Stage chip + timestamp */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, marginTop: T.sp3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: T.fontSub, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: stageObj?.bg ?? '#F0FDFA', color: stageObj?.color ?? BRAND.teal }}>
                          {stageObj?.label ?? currentStage}
                        </span>
                        <span style={{ fontSize: T.fontSub, color: tsu }}>{createdFmt}</span>
                        {lead.quoted_amount != null && (
                          <span style={{ fontSize: T.fontBody, fontWeight: 700, color: BRAND.teal, marginLeft: 'auto' }}>
                            ${Number(lead.quoted_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── Progress tracker ──────────────────────────────────── */}
                    <div style={{ borderTop: `1px solid ${border}`, padding: `${T.sp4}px ${T.sp5}px ${T.sp4}px` }}>

                      {/* Dot + line track */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {activeStgs.map((stg, i) => {
                          const done   = i < curPos
                          const active = i === curPos
                          const isLast = i === activeStgs.length - 1
                          const nextColor = activeStgs[i + 1]?.color ?? stg.color

                          // Dot sizing and shape
                          const dotSize   = active ? 22 : done ? 20 : 12
                          // Future dots: rounded square (borderRadius 3), active/done: circle
                          const dotRadius = done || active ? '50%' : '3px'

                          return (
                            <div key={stg.key} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : 1 }}>
                              <button
                                onClick={undefined}
                                title={stg.label}
                                style={{
                                  width: dotSize, height: dotSize,
                                  borderRadius: dotRadius,
                                  flexShrink: 0, padding: 0,
                                  background: done ? stg.color : active ? stg.color : (dk ? '#374151' : '#E2E8F0'),
                                  border: active ? '3px solid ' + card : 'none',
                                  boxShadow: active
                                    ? `0 0 0 2px ${stg.color}, 0 4px 12px ${stg.color}50`
                                    : done
                                      ? `0 1px 4px ${stg.color}40`
                                      : 'none',
                                  cursor: 'default',
                                  transition: 'all 0.2s',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                {done && (
                                  <Svg size={10} stroke="#fff">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </Svg>
                                )}
                              </button>
                              {!isLast && (
                                <div style={{ flex: 1, height: 2, margin: '0 2px', background: done ? `linear-gradient(90deg, ${stg.color}, ${nextColor})` : (dk ? '#1E293B' : '#E2E8F0'), transition: 'background 0.3s' }} />
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Stage labels — fixed height row, no overflow clipping */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: T.sp2 }}>
                        {activeStgs.map((stg, i) => {
                          const done   = i < curPos
                          const active = i === curPos
                          const isLast = i === activeStgs.length - 1
                          return (
                            <div key={stg.key}
                              style={{
                                flex: isLast ? '0 0 auto' : 1,
                                display: 'flex',
                                justifyContent: 'center',
                                paddingTop: 4,
                                minWidth: 0,
                              }}>
                              <span style={{
                                fontSize: 9,
                                fontWeight: active ? 700 : 500,
                                color: active
                                  ? stg.color
                                  : done
                                    ? (dk ? '#4B5563' : '#9CA3AF')
                                    : (dk ? '#2D3748' : '#CBD5E1'),
                                textAlign: 'center',
                                lineHeight: 1.3,
                                // allow wrapping so text never clips
                                wordBreak: 'break-word',
                                maxWidth: '100%',
                                display: 'block',
                              }}>
                                {/* Show label for active and future; checkmark for done */}
                                {stg.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* ── Move button ───────────────────────────────────────── */}
                    {!isTerminal && (
                      <div style={{ padding: `0 ${T.sp5}px ${T.sp5}px` }}>
                        {nextStage ? (
                          <button
                            onClick={() => moveToStage(nextStage.key as LeadStatus)}
                            disabled={stageSaving}
                            style={{ width: '100%', padding: '13px 20px', borderRadius: T.radMd, border: 'none', cursor: stageSaving ? 'wait' : 'pointer', background: stageSaving ? t.cardBgAlt : `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.tealLight})`, color: stageSaving ? ts : '#fff', fontSize: T.fontEmphasis, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp2, boxShadow: stageSaving ? 'none' : '0 4px 16px rgba(15,118,110,0.25)', transition: 'all 0.2s' }}>
                            {stageSaving ? 'Updating...' : (
                              <>
                                <Svg size={14} stroke="#fff"><><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></></Svg>
                                Move to {nextStage.label}
                                {/* dropdown chevron — opens all stages on mobile */}
                                <span onClick={e => { e.stopPropagation(); setShowStatusPicker(true) }}
                                  style={{ marginLeft: 'auto', paddingLeft: T.sp2, borderLeft: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center' }} className="lg:hidden">
                                  <Svg size={14} stroke="#fff"><polyline points="6 9 12 15 18 9"/></Svg>
                                </span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button onClick={() => setShowStatusPicker(true)}
                            style={{ width: '100%', padding: '13px 20px', borderRadius: T.radMd, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.tealLight})`, color: '#fff', fontSize: T.fontEmphasis, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp2, boxShadow: '0 4px 16px rgba(15,118,110,0.25)' }}>
                            <Svg size={14} stroke="#fff"><path d="M5 12h14M12 5l7 7-7 7"/></Svg>
                            Move this job
                          </button>
                        )}
                        {stageTip && (
                          <p style={{ marginTop: T.sp2, fontSize: T.fontSub, color: tsu, textAlign: 'center', lineHeight: 1.5 }}>
                            💡 {stageTip}
                          </p>
                        )}
                      </div>
                    )}
                    {isTerminal && (
                      <div style={{ padding: `0 ${T.sp5}px ${T.sp5}px` }}>
                        <div style={{ padding: '14px 20px', borderRadius: T.radMd, textAlign: 'center', background: currentStage === 'job_won' ? 'linear-gradient(135deg, #065F46, #047857)' : t.cardBgAlt, color: currentStage === 'job_won' ? '#fff' : ts, fontSize: T.fontEmphasis, fontWeight: 700 }}>
                          {currentStage === 'job_won' ? '🏆 Job Complete' : currentStage === 'lost' ? 'Job Lost' : 'Lead Unqualified'}
                        </div>
                      </div>
                    )}
                  </div>{/* end hero card */}

                  {/* ── TABS CARD ────────────────────────────────────────────── */}
                  <div style={{ background: card, borderRadius: T.radLg, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: dk ? 'none' : '0 2px 10px rgba(0,0,0,0.05)' }}>

                    {/* Tab strip — stacked icon + label, teal underline */}
                    <div style={{ display: 'flex', background: t.cardBgAlt, borderBottom: `1px solid ${border}` }}>
                      {tabs.map(tab => {
                        const isActive = activeTab === tab.key
                        const iconColor = isActive ? BRAND.teal : (dk ? '#64748B' : '#94A3B8')
                        return (
                          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{ flex: 1, padding: '10px 8px 8px', border: 'none', borderBottom: isActive ? `2px solid ${BRAND.teal}` : '2px solid transparent', background: isActive ? card : 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s', marginBottom: -1 }}>
                            <div style={{ width: 30, height: 30, borderRadius: T.radXs, background: isActive ? BRAND.teal + '14' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Svg size={16} stroke={iconColor}>{TAB_ICON[tab.key]}</Svg>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? BRAND.teal : ts, whiteSpace: 'nowrap' }}>{tab.label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Tab: Job Details */}
                    {activeTab === 'details' && (
                      <div style={{ padding: `${T.sp4}px ${T.sp4 + 2}px` }}>
                        {/* Data grid */}
                        <div style={{ borderRadius: T.radSm, overflow: 'hidden', border: `1px solid ${border}`, marginBottom: T.sp4 + 2 }}>
                          {([
                            { label: 'PHONE',     value: fmtPhone(lead.contact_phone),                                                                copy: lead.contact_phone },
                            { label: 'EMAIL',     value: lead.contact_email || '—',                                                                   copy: lead.contact_email },
                            { label: 'ADDRESS',   value: (lead as any).property_address || [lead.contact_city, lead.contact_state].filter(Boolean).join(', ') || '—', copy: null },
                            { label: 'SOURCE',    value: (lead.lead_source || '—').replace(/_/g, ' '),                                                copy: null },
                            { label: 'JOB DATE',  value: fmt(lead.scheduled_date),                                                                    copy: null },
                            { label: 'FOLLOW-UP', value: lead.follow_up_date
                                ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{fmt(lead.follow_up_date)}{isOverdue(lead.follow_up_date) && <span style={{ fontSize: T.fontBadge, padding: '1px 6px', borderRadius: 20, background: t.dangerBg, color: '#A32D2D', fontWeight: 600 }}>Overdue</span>}</span>
                                : '—', copy: null },
                          ] as { label: string; value: React.ReactNode; copy: string | null }[]).reduce((rows: any[][], cell, i) => {
                            if (i % 2 === 0) rows.push([cell]); else rows[rows.length - 1].push(cell)
                            return rows
                          }, []).map((row, rowIdx) => (
                            <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: rowIdx % 2 === 1 ? t.tableRowAlt : card, borderBottom: rowIdx < 2 ? `1px solid ${border}` : 'none' }}>
                              {row.map((cell: any) => (
                                <div key={cell.label} style={{ padding: '13px 16px', borderRight: row.indexOf(cell) === 0 ? `1px solid ${border}` : 'none' }}>
                                  <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: tsu, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{cell.label}</div>
                                  <div style={{ fontSize: T.fontBody, fontWeight: 600, color: tp, display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-word' }}>
                                    {cell.value}
                                    {cell.copy && <CopyBtn text={cell.copy} muted={ts} />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        {isRoofing && (
                          <InsuranceClaimFields leadId={lead.id} proId={session!.id} initial={(lead as any).insurance_data ?? {}} darkMode={dk}
                            onSaved={(data) => setLead(l => l ? { ...l, insurance_data: data } as any : l)} />
                        )}

                        {/* Notes */}
                        <div style={{ marginTop: T.sp4 + 2, paddingTop: T.sp4 + 2, borderTop: `1px solid ${border}` }}>
                          <div style={{ fontSize: T.fontSub, fontWeight: 700, color: ts, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: T.sp3 }}>Notes</div>
                          {lead.notes && (
                            <div style={{ fontSize: T.fontBody, color: tb, lineHeight: T.lineRelaxed, whiteSpace: 'pre-wrap', marginBottom: T.sp3, padding: '10px 12px', background: t.cardBgAlt, borderRadius: T.radSm, border: `1px solid ${border}` }}>
                              {lead.notes}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: T.sp2 }}>
                            <input value={noteText} onChange={e => setNoteText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && noteText.trim()) { e.preventDefault(); saveNote() } }}
                              placeholder="Add a note..."
                              style={{ flex: 1, fontSize: T.fontBody, padding: '9px 12px', borderRadius: T.radSm, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: tp, outline: 'none', fontFamily: 'inherit' }} />
                            <button onClick={saveNote} disabled={savingNote || !noteText.trim()}
                              style={{ padding: '9px 16px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', fontSize: T.fontSub, fontWeight: 700, cursor: 'pointer', opacity: !noteText.trim() ? 0.4 : 1 }}>
                              {savingNote ? '...' : 'Save'}
                            </button>
                          </div>
                        </div>

                        {lead.message && (
                          <div style={{ marginTop: T.sp3, padding: '12px 14px', background: t.cardBgAlt, borderRadius: T.radSm, border: `1px solid ${border}` }}>
                            <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: tsu, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Original message</div>
                            <div style={{ fontSize: T.fontBody, color: tb, lineHeight: T.lineRelaxed, fontStyle: 'italic' }}>"{lead.message}"</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: Photos */}
                    {activeTab === 'photos' && isRoofing && (
                      <div style={{ padding: `${T.sp4}px ${T.sp4 + 2}px` }}>
                        <JobPhotoLog leadId={lead.id} proId={session!.id} isRoofing={isRoofing} darkMode={dk} />
                      </div>
                    )}

                    {/* Tab: Estimate */}
                    {activeTab === 'estimate' && (
                      <div style={{ padding: `${T.sp4}px ${T.sp4 + 2}px` }}>
                        {leadEst ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp3 }}>
                            <div style={{ padding: '16px 18px', borderRadius: T.radMd, background: t.successBg, border: `1px solid ${t.successBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Estimate</div>
                                <div style={{ fontSize: T.fontTitle, fontWeight: 800, color: BRAND.teal, letterSpacing: '-0.03em' }}>${leadEst.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                              </div>
                              <button onClick={() => router.push(`/dashboard/estimates/${leadEst.id}?from=pipeline&lead_id=${id}`)}
                                style={{ padding: '10px 18px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', fontSize: T.fontBody, fontWeight: 700, cursor: 'pointer' }}>
                                Open #{leadEst.estimate_number}
                              </button>
                            </div>
                            {leadInv && (
                              <div style={{ padding: '14px 16px', borderRadius: T.radSm, background: t.warningBg, border: `1px solid ${t.warningBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Invoice</div>
                                  <div style={{ fontSize: T.fontHeading, fontWeight: 700, color: '#B45309' }}>${leadInv.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2 })} due</div>
                                </div>
                                <button onClick={() => router.push(`/dashboard/invoices/${leadInv.id}`)}
                                  style={{ padding: '9px 16px', borderRadius: T.radSm, border: 'none', background: '#B45309', color: '#fff', fontSize: T.fontBody, fontWeight: 700, cursor: 'pointer' }}>
                                  View Invoice
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '32px 0' }}>
                            <div style={{ fontSize: T.fontBody, color: ts, marginBottom: T.sp4 }}>No estimate yet</div>
                            <button onClick={createEstimate} disabled={creatingEst}
                              style={{ padding: '11px 28px', borderRadius: T.radSm, border: 'none', background: BRAND.teal, color: '#fff', fontSize: T.fontBody, fontWeight: 700, cursor: 'pointer', opacity: creatingEst ? 0.7 : 1 }}>
                              {creatingEst ? 'Creating...' : '+ Create Estimate'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: Activity */}
                    {activeTab === 'activity' && (
                      <div style={{ padding: `${T.sp4}px ${T.sp4 + 2}px` }}>
                        {activity.length === 0
                          ? <div style={{ textAlign: 'center', padding: '32px 0', color: ts, fontSize: T.fontBody }}>No activity yet.</div>
                          : activity.map((item, i) => {
                            const iColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#3C3489' : BRAND.teal
                            const iBg    = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEEDFE' : '#E1F5EE'
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp3, padding: `${T.sp3}px 0`, borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: iBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Svg size={14} stroke={iColor}>
                                    {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </Svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: T.fontBody, fontWeight: 600, color: tp }}>{item.title}</div>
                                  <div style={{ fontSize: T.fontSub, color: ts, marginTop: 2 }}>{item.sub}</div>
                                </div>
                                <div style={{ fontSize: T.fontSub, color: tsu, flexShrink: 0 }}>
                                  {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            )
                          })
                        }
                      </div>
                    )}
                  </div>{/* end tabs card */}
                </div>{/* end left column */}

                {/* ════ RIGHT COLUMN (desktop only) ════════════════════════ */}
                <div className="hidden lg:block">
                  <div style={{ position: 'sticky', top: 20 }}>

                    {/* Single right-panel card: Insights + Move */}
                    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: T.radLg, overflow: 'hidden', boxShadow: dk ? 'none' : '0 4px 20px rgba(0,0,0,0.07)' }}>

                      {/* Activity — compact strip */}
                      <div style={{ padding: `${T.sp3}px ${T.sp4}px`, borderBottom: `1px solid ${border}` }}>
                        <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: tsu, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: T.sp2 }}>Activity</div>
                        {activity.length === 0
                          ? <div style={{ fontSize: T.fontSub, color: tsu, textAlign: 'center', padding: '8px 0' }}>No activity yet</div>
                          : activity.slice(0, 3).map((item, i) => {
                            const iColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#6366F1' : BRAND.teal
                            const iBg    = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEF2FF' : '#E1F5EE'
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp2, paddingBottom: T.sp2, marginBottom: i < Math.min(activity.length, 3) - 1 ? T.sp2 : 0, borderBottom: i < Math.min(activity.length, 3) - 1 ? `1px solid ${t.divider}` : 'none' }}>
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: iBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Svg size={10} stroke={iColor}>
                                    {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </Svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: T.fontSub, fontWeight: 600, color: tp }}>{item.title}</div>
                                  <div style={{ fontSize: T.fontBadge, color: tsu, marginTop: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>
                                </div>
                              </div>
                            )
                          })
                        }
                      </div>

                      {/* Insights */}
                      <div style={{ padding: `${T.sp3}px ${T.sp4}px`, borderBottom: `1px solid ${border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: T.sp3 }}>
                          <Svg size={13} stroke="#6366F1"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>
                          <span style={{ fontSize: T.fontBadge, fontWeight: 700, color: tsu, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Insights</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp3 }}>
                          {insights.map((ins, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp2 + 2 }}>
                              <div style={{ width: 28, height: 28, borderRadius: T.radXs, background: ins.color + '1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Svg size={13} stroke={ins.color}>{ins.icon}</Svg>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: tp }}>{ins.title}</div>
                                <div style={{ fontSize: T.fontBody, fontWeight: 600, color: ins.color, marginTop: 1 }}>{ins.body}</div>
                                <div style={{ fontSize: T.fontBadge, color: tsu, marginTop: 1 }}>{ins.sub}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Move this job */}
                      {!isTerminal && (
                        <div style={{ padding: `${T.sp3}px ${T.sp4}px ${T.sp4}px` }}>
                          <div style={{ marginBottom: T.sp3 }}>
                            <div style={{ fontSize: T.fontBadge, fontWeight: 700, color: tsu, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Move this job</div>
                            <div style={{ fontSize: T.fontSub, color: tsu, marginTop: 2 }}>
                              Currently: <span style={{ fontWeight: 600, color: stageObj?.color ?? BRAND.teal }}>{stageObj?.label ?? currentStage}</span>
                            </div>
                          </div>

                          {/* Next best step */}
                          {fwdStages.length > 0 && (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: T.sp1 + 2 }}>
                                <div style={{ width: 3, height: 10, borderRadius: 2, background: BRAND.teal }} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: tp, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Next best step</span>
                              </div>
                              <PanelRow stg={fwdStages[0]} isNext />
                            </>
                          )}

                          {/* All stages */}
                          {(fwdStages.length > 1 || termStages.length > 0 || bwdStages.length > 0) && (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: `${T.sp2}px 0 ${T.sp1 + 2}px` }}>
                                <div style={{ width: 3, height: 10, borderRadius: 2, background: t.textSubtle }} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: tp, textTransform: 'uppercase', letterSpacing: '0.07em' }}>All stages</span>
                              </div>
                              {fwdStages.slice(1).map(stg => <PanelRow key={stg.key} stg={stg} isNext={false} />)}
                              {termStages.map(stg => <PanelRow key={stg.key} stg={stg} isTerm={true} />)}
                              {bwdStages.map(stg => <PanelRow key={stg.key} stg={stg} isBack={true} />)}
                            </>
                          )}

                          {stageTip && (
                            <div style={{ marginTop: T.sp3, padding: '9px 12px', borderRadius: T.radSm, background: t.cardBgAlt, border: `1px solid ${border}`, fontSize: T.fontBadge, color: tsu, lineHeight: 1.5 }}>
                              💡 {stageTip}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Terminal state */}
                      {isTerminal && (
                        <div style={{ padding: `${T.sp5}px ${T.sp4}px`, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, marginBottom: T.sp2 }}>{currentStage === 'job_won' ? '🏆' : '🚫'}</div>
                          <div style={{ fontSize: T.fontBody, fontWeight: 700, color: tp, marginBottom: T.sp1 }}>{currentStage === 'job_won' ? 'Job Won!' : currentStage === 'lost' ? 'Job Lost' : 'Unqualified'}</div>
                          <div style={{ fontSize: T.fontSub, color: tsu, lineHeight: 1.5, marginBottom: T.sp3 }}>{currentStage === 'job_won' ? 'Request a Google review within 24hrs.' : 'This lead is closed.'}</div>
                          {currentStage !== 'job_won' && (
                            <button onClick={() => moveToStage('lead_in' as LeadStatus)} style={{ fontSize: T.fontSub, color: BRAND.teal, background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: T.radSm, cursor: 'pointer', padding: '7px 14px', fontWeight: 600 }}>
                              Reopen Lead
                            </button>
                          )}
                        </div>
                      )}

                    </div>{/* end right panel card */}
                  </div>
                </div>{/* end right column */}

              </div>{/* end 2-col grid */}
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
