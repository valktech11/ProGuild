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

const STAGE_ORDER: Record<string, number> = {
  New: 0, Contacted: 1, Quoted: 2, Scheduled: 3, Completed: 4, Paid: 5,
  lead_in: 0, inspection_scheduled: 1, proposal_sent: 2, proposal_signed: 3,
  insurance_approved: 4, scheduled: 5, in_progress: 6, job_won: 7,
  lost: 8, unqualified: 9,
  new_call: 0, diagnosed: 1, quoted: 2, parts_ordered: 3,
}

const STAGE_ICON_PATHS: Record<string, string> = {
  lead_in:              'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  inspection_scheduled: '',
  proposal_sent:        'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
  proposal_signed:      'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
  insurance_approved:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  scheduled:            '',
  in_progress:          'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  job_won:              'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  lost:                 '',
  unqualified:          '',
  New:                  '',
  Contacted:            'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6',
  Quoted:               'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
  Scheduled:            '',
  Completed:            'M20 6 9 17 4 12',
  Paid:                 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
}

const SOURCE_OPTIONS = ['Profile Page','Job Post','Search Result','Direct','Registry Card','Phone Call','Facebook','Instagram','Referral','Website','Yard Sign','Walk In','Other','Insurance','Canvassing']

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
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color, opacity: copied ? 1 : 0.5, transition: 'opacity 0.15s' }}>
      <Ic color={color} size={13}>
        {copied ? <polyline points="20 6 9 17 4 12"/> : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>}
      </Ic>
    </button>
  )
}

function StageIconCircle({ stageKey, color, size = 28 }: { stageKey: string; color: string; size?: number }) {
  const isCalendar = ['inspection_scheduled', 'scheduled', 'Scheduled'].includes(stageKey)
  const isX        = ['lost', 'Lost'].includes(stageKey)
  const isSlash    = ['unqualified'].includes(stageKey)
  const isCrown    = ['job_won'].includes(stageKey)
  const path       = STAGE_ICON_PATHS[stageKey] ?? ''
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isCalendar && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
        {isX        && <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}
        {isSlash    && <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>}
        {isCrown    && <polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
        {!isCalendar && !isX && !isSlash && !isCrown && path && <path d={path}/>}
        {!isCalendar && !isX && !isSlash && !isCrown && !path && <circle cx="12" cy="12" r="10"/>}
      </svg>
    </div>
  )
}

const TAB_ICONS: Record<string, React.ReactNode> = {
  details:  <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  photos:   <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  estimate: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></>,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
}

function LeadDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const _from = searchParams.get('from')
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
  const [confirmBack, setConfirmBack] = useState<LeadStatus | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dPhone, setDPhone] = useState('')
  const [dEmail, setDEmail] = useState('')
  const [dCity, setDCity] = useState('')
  const [dState, setDState] = useState('')
  const [dSource, setDSource] = useState('')
  const [dScheduled, setDScheduled] = useState('')
  const [dScheduledTime, setDScheduledTime] = useState('')
  const [dFollowUp, setDFollowUp] = useState('')
  const [dNotes, setDNotes] = useState('')
  const [savingDrawer, setSavingDrawer] = useState(false)

  const [composerText, setComposerText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [toastSeq, setToastSeq] = useState(0)

  const [leadEstimate, setLeadEstimate] = useState<{ id: string; estimate_number: string; total: number; status: string } | null>(null)
  const [leadInvoice, setLeadInvoice] = useState<{ id: string; invoice_number: string; status: string; balance_due: number } | null>(null)
  const [creatingEst, setCreatingEst] = useState(false)
  const [creatingInv, setCreatingInv] = useState(false)
  const [warnScheduled, setWarnScheduled] = useState(false)
  const [warnCompleted, setWarnCompleted] = useState(false)
  const [warnNewEstimate, setWarnNewEstimate] = useState(false)

  type DetailTab = 'details' | 'photos' | 'estimate' | 'activity'
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  const [showWarranty, setShowWarranty] = useState(false)
  const isRoofingTrade = ['roofing-contractor','roofing','roofer'].includes(session?.trade_slug ?? '')

  useEffect(() => {
    if (typeof window !== 'undefined') setDk(localStorage.getItem('pg_darkmode') === '1')
  }, [])

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/leads/${id}?pro_id=${session.id}`)
      .then(r => { if (r.status === 404) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(data => { if (!data) return; const l = data.lead as LeadWithLocation; setLead(l); setCurrentStage(l.lead_status as LeadStatus); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, id, router])

  useEffect(() => {
    if (!session || !lead) return
    fetch(`/api/estimates?pro_id=${session.id}`).then(r => r.json()).then(d => {
      const arr = (d.estimates || []).filter((e: any) => e.lead_id === lead.id && !['void','declined'].includes(e.status))
      if (!arr.length) return
      const priority = ['invoiced','approved','paid','sent','viewed','draft']
      const best = arr.sort((a: any, b: any) => priority.indexOf(a.status) < priority.indexOf(b.status) ? -1 : 1)[0]
      if (best) setLeadEstimate(best)
    }).catch(() => {})
    fetch(`/api/invoices?pro_id=${session.id}&lead_id=${lead.id}`).then(r => r.json()).then(d => {
      const inv = (d.invoices || []).find((i: any) => i.status !== 'void')
      if (inv) setLeadInvoice(inv)
    }).catch(() => {})
  }, [session, lead])

  function openDrawer() {
    if (!lead) return
    setDPhone(lead.contact_phone || ''); setDEmail(lead.contact_email || '')
    setDCity(lead.contact_city || ''); setDState(lead.contact_state || '')
    setDSource((lead.lead_source || '').replace(/_/g,' '))
    setDScheduled(lead.scheduled_date || ''); setDScheduledTime((lead as any).scheduled_time || '')
    setDFollowUp(lead.follow_up_date || ''); setDNotes(lead.notes || '')
    setDrawerOpen(true)
  }

  function addToast(message: string, type: ToastItem['type'] = 'success', prevStage?: LeadStatus) {
    const tid = toastSeq + 1; setToastSeq(tid)
    setToasts(t => [...t, { id: tid, message, type, prevStage }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 5000)
  }
  function dismissToast(tid: number) { setToasts(t => t.filter(x => x.id !== tid)) }

  const patchLead = useCallback(async (fields: Record<string, unknown>) => {
    if (!session) return false
    const res = await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, ...fields }) })
    return res.ok
  }, [session, id])

  async function handleStageClick(stage: LeadStatus) {
    if (stage === currentStage || stageSaving) return
    if (STAGE_ORDER[stage] < STAGE_ORDER[currentStage]) { setConfirmBack(stage); return }
    if (stage === 'Scheduled' && !leadEstimate) { setWarnScheduled(true); return }
    if (stage === 'Completed' && !leadInvoice) { setWarnCompleted(true); return }
    const prev = currentStage; setCurrentStage(stage); setStageSaving(true)
    const ok = await patchLead({ lead_status: stage }); setStageSaving(false)
    if (ok) {
      setLead(l => l ? { ...l, lead_status: stage } : l)
      addToast(`Moved to ${stage.replace(/_/g,' ')}`, 'success', prev)
      if (stage === 'job_won' && isRoofingTrade) setShowWarranty(true)
    } else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function handleConfirmBack() {
    if (!confirmBack) return
    const stage = confirmBack; const prev = currentStage
    setConfirmBack(null); setCurrentStage(stage); setStageSaving(true)
    const ok = await patchLead({ lead_status: stage }); setStageSaving(false)
    if (ok) { setLead(l => l ? { ...l, lead_status: stage } : l); addToast(`Moved back to ${stage.replace(/_/g,' ')}`, 'success', prev) }
    else { setCurrentStage(prev); addToast('Failed to update stage', 'error') }
  }

  async function handleUndo(tid: number, prevStage: LeadStatus) {
    dismissToast(tid); const from = currentStage; setCurrentStage(prevStage); setStageSaving(true)
    const ok = await patchLead({ lead_status: prevStage }); setStageSaving(false)
    if (!ok) { setCurrentStage(from); addToast('Undo failed', 'error') }
  }

  async function handleSaveDrawer() {
    setSavingDrawer(true)
    const ok = await patchLead({
      contact_phone: dPhone || null, contact_email: dEmail || null,
      contact_city: dCity || null, contact_state: dState || null,
      lead_source: dSource.replace(/ /g,'_') || null,
      scheduled_date: dScheduled || null, scheduled_time: dScheduledTime || null,
      follow_up_date: dFollowUp || null, notes: dNotes || null,
    })
    setSavingDrawer(false)
    if (ok) {
      setLead(l => l ? { ...l, contact_phone: dPhone || null, contact_email: dEmail || null, contact_city: dCity || null, contact_state: dState || null, lead_source: dSource.replace(/ /g,'_') as any || null, scheduled_date: dScheduled || null, follow_up_date: dFollowUp || null, notes: dNotes || null } : l)
      setDrawerOpen(false); addToast('Lead updated')
    } else addToast('Failed to save', 'error')
  }

  async function handleAddNote() {
    if (!composerText.trim()) return; setSavingNote(true)
    const newNotes = lead?.notes ? `${lead.notes}\n\n${composerText.trim()}` : composerText.trim()
    const ok = await patchLead({ notes: newNotes }); setSavingNote(false)
    if (ok) { setLead(l => l ? { ...l, notes: newNotes } : l); setComposerText(''); addToast('Note saved') }
    else addToast('Failed to save note', 'error')
  }

  const createEstimate = async () => {
    if (!lead || !session || creatingEst) return
    if (lead.lead_status === 'New') { setWarnNewEstimate(true); return }
    setCreatingEst(true)
    try {
      const r = await fetch('/api/estimates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, lead_id: lead.id, lead_name: lead.contact_name, lead_source: lead.lead_source || '', trade: session.trade || '', state: session.state || '', contact_phone: lead.contact_phone || '', contact_email: lead.contact_email || '' }) })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${id}`)
    } catch { setCreatingEst(false) }
  }

  const createInvoice = async () => {
    if (!lead || !session || creatingInv) return
    if (leadInvoice) { router.push(`/dashboard/invoices/${leadInvoice.id}`); return }
    setCreatingInv(true)
    try {
      const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, lead_id: lead.id, estimate_id: leadEstimate?.id, lead_name: lead.contact_name, trade: session.trade || '', contact_name: lead.contact_name, contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '' }) })
      const d = await r.json()
      if (d.invoice?.id) router.push(`/dashboard/invoices/${d.invoice.id}`)
    } catch {} finally { setCreatingInv(false) }
  }

  function getActivity() {
    if (!lead) return []
    const items: { date: string; title: string; sub: string; type: string }[] = []
    items.push({ date: lead.created_at, title: 'Lead created', sub: `From ${(lead.lead_source || 'unknown').replace(/_/g,' ')}${lead.message ? ` · "${lead.message.slice(0,60)}${lead.message.length > 60 ? '…' : ''}"` : ''}`, type: 'created' })
    if (lead.quoted_amount != null) items.push({ date: lead.updated_at || lead.created_at, title: 'Quote amount set', sub: `$${Number(lead.quoted_amount).toLocaleString()}`, type: 'quote' })
    if (lead.scheduled_date) items.push({ date: lead.updated_at || lead.created_at, title: 'Job scheduled', sub: fmt(lead.scheduled_date), type: 'scheduled' })
    if (lead.notes) { lead.notes.split(/\n\n+/).filter(Boolean).forEach(n => { items.push({ date: lead.updated_at || lead.created_at, title: 'Note added', sub: n.slice(0,100) + (n.length > 100 ? '…' : ''), type: 'note' }) }) }
    return items.reverse()
  }

  function getInsights(lead: LeadWithLocation) {
    const insights: { icon: React.ReactNode; title: string; body: string; sub: string; color: string }[] = []
    const minsAgo = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000)
    if (minsAgo <= 30) {
      insights.push({ icon: <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>, title: 'High close probability', body: `Lead responded within ${minsAgo < 1 ? '1' : minsAgo} min${minsAgo !== 1 ? 's' : ''}`, sub: 'Call now — hot lead', color: '#10B981' })
    }
    const hour = new Date().getHours()
    const bestWindow = hour < 17 ? '5:00 PM – 7:00 PM' : hour < 20 ? 'Now is best time' : '10:00 AM – 12:00 PM'
    insights.push({ icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, title: 'Best callback window', body: bestWindow, sub: 'Today', color: '#6366F1' })
    if (isRoofingTrade) {
      insights.push({ icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>, title: 'Roof size likely', body: '28 – 34 SQ', sub: 'Based on satellite scan', color: '#F59E0B' })
    }
    return insights
  }

  const t = theme(dk)
  const bg      = t.pageBg; const card = t.cardBg; const border = t.cardBorder
  const tp      = t.textPri; const ts   = t.textMuted; const inputBg = t.cardBgAlt
  const inputStyle = { fontSize: 15, padding: '8px 10px', borderRadius: T.radSm, border: `1px solid ${border}`, background: inputBg, color: tp, width: '100%', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  if (!session) return null

  const activity = getActivity()
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E1F5EE', '#0F6E56']

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={() => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }}>
      <div style={{ background: bg, minHeight: '100vh', padding: '12px 16px 80px', overflowX: 'hidden' }}>

        {/* Toasts */}
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 400, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', alignItems: 'center' }}>
          {toasts.map(toast => (
            <div key={toast.id} style={{ pointerEvents: 'all', background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', border: `1.5px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`, borderRadius: 12, padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 500, color: toast.type === 'error' ? '#991B1B' : '#166534', minWidth: 280, maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
              <span style={{ flex: 1 }}>{toast.message}</span>
              {toast.prevStage && toast.type === 'success' && <button onClick={() => handleUndo(toast.id, toast.prevStage!)} style={{ fontSize: 15, color: '#0F766E', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Undo</button>}
              <button onClick={() => dismissToast(toast.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>

        {/* Confirm back modal */}
        {confirmBack && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConfirmBack(null)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 16, fontWeight: 600, color: tp, marginBottom: 8 }}>Move back to {String(confirmBack).replace(/_/g,' ')}?</p>
              <p style={{ fontSize: 14, color: ts, marginBottom: 20 }}>Currently <strong>{String(currentStage).replace(/_/g,' ')}</strong>. Moving backward is tracked.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmBack(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={handleConfirmBack} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Move back</button>
              </div>
            </div>
          </div>
        )}

        {/* Warn modals */}
        {warnScheduled && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setWarnScheduled(false)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tp, marginBottom: 6 }}>No approved estimate</p>
              <p style={{ fontSize: 14, color: ts, marginBottom: 16 }}>This lead hasn't been quoted yet.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setWarnScheduled(false); createEstimate() }} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Create Estimate First</button>
                <button onClick={async () => { setWarnScheduled(false); const prev = currentStage; setCurrentStage('Scheduled' as LeadStatus); setStageSaving(true); const ok = await patchLead({ lead_status: 'Scheduled' }); setStageSaving(false); if (ok) { setLead(l => l ? { ...l, lead_status: 'Scheduled' } : l); addToast('Moved to Scheduled', 'success', prev) } else { setCurrentStage(prev) } }} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14 }}>Schedule Anyway</button>
              </div>
            </div>
          </div>
        )}
        {warnCompleted && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setWarnCompleted(false)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tp, marginBottom: 6 }}>No invoice created</p>
              <p style={{ fontSize: 14, color: ts, marginBottom: 16 }}>Create an invoice before marking complete.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setWarnCompleted(false); createInvoice() }} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Create Invoice First</button>
                <button onClick={async () => { setWarnCompleted(false); const prev = currentStage; setCurrentStage('Completed' as LeadStatus); setStageSaving(true); const ok = await patchLead({ lead_status: 'Completed' }); setStageSaving(false); if (ok) { setLead(l => l ? { ...l, lead_status: 'Completed' } : l); addToast('Moved to Completed', 'success', prev) } else { setCurrentStage(prev) } }} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14 }}>Mark Complete Anyway</button>
              </div>
            </div>
          </div>
        )}
        {warnNewEstimate && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setWarnNewEstimate(false)}>
            <div style={{ background: card, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tp, marginBottom: 6 }}>Lead not yet contacted</p>
              <p style={{ fontSize: 14, color: ts, marginBottom: 16 }}>Sending an estimate before contact has lower acceptance rates.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setWarnNewEstimate(false); handleStageClick('Contacted' as LeadStatus) }} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Contact First</button>
                <button onClick={() => { setWarnNewEstimate(false); createEstimate() }} style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 14 }}>Send Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Drawer */}
        {drawerOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setDrawerOpen(false)} />
            <div className="md:top-0 md:bottom-0 md:left-auto md:right-0 md:w-[420px] md:max-h-none md:rounded-none" style={{ position: 'fixed', zIndex: 501, background: card, display: 'flex', flexDirection: 'column', bottom: 0, left: 0, right: 0, maxHeight: '92dvh', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', borderLeft: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
              <div className="md:hidden" style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: border }} />
              </div>
              <div style={{ padding: '12px 20px 14px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: tp }}>Edit Lead</div><div style={{ fontSize: 14, color: ts, marginTop: 2 }}>{capName(lead?.contact_name || 'Unknown')}</div></div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ts, fontSize: 22, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</label><input value={dPhone} onChange={e => setDPhone(e.target.value)} style={inputStyle} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label><input value={dEmail} onChange={e => setDEmail(e.target.value)} style={inputStyle} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>City</label><input value={dCity} onChange={e => setDCity(e.target.value)} placeholder="Jacksonville" style={inputStyle} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>State</label><select value={dState} onChange={e => setDState(e.target.value)} style={inputStyle}><option value="">—</option>{US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select></div>
                  </div>
                  <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scheduled date &amp; time</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input type="date" value={dScheduled} onChange={e => setDScheduled(e.target.value)} style={{ ...inputStyle, colorScheme: dk ? 'dark' : 'light' }} /><input type="time" value={dScheduledTime} onChange={e => setDScheduledTime(e.target.value)} style={{ ...inputStyle, colorScheme: dk ? 'dark' : 'light' }} /></div></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Follow-up date</label><input type="date" value={dFollowUp} onChange={e => setDFollowUp(e.target.value)} style={{ ...inputStyle, colorScheme: dk ? 'dark' : 'light' }} /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</label><select value={dSource} onChange={e => setDSource(e.target.value)} style={inputStyle}>{SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
                  {leadEstimate && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: dk ? '#0f172a' : '#F0FDFA', border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div><div style={{ fontSize: 11, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Estimate Value</div><div style={{ fontSize: 18, fontWeight: 800, color: '#0F766E' }}>${leadEstimate.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                      <button onClick={() => router.push(`/dashboard/estimates/${leadEstimate.id}?from=pipeline&lead_id=${id}`)} style={{ fontSize: 13, color: '#0F766E', background: 'white', border: '1px solid #CCFBF1', borderRadius: 8, cursor: 'pointer', padding: '6px 12px', fontWeight: 600 }}>#{leadEstimate.estimate_number} →</button>
                    </div>
                  )}
                  <div><label style={{ fontSize: 12, fontWeight: 600, color: ts, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</label><textarea value={dNotes} onChange={e => setDNotes(e.target.value)} rows={4} maxLength={500} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 90 }} /><div style={{ fontSize: 12, color: ts, textAlign: 'right', marginTop: 3 }}>{dNotes.length}/500</div></div>
                </div>
              </div>
              <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: `1px solid ${border}`, background: card, paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button onClick={() => setDrawerOpen(false)} style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${border}`, background: t.cardBgAlt, color: tp, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Cancel</button>
                  <button onClick={handleSaveDrawer} disabled={savingDrawer} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: 'white', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>{savingDrawer ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 15 }}>Loading...</div>}
        {notFound && <div style={{ textAlign: 'center', padding: 80, color: ts, fontSize: 15 }}>Lead not found.</div>}

        {!loading && !notFound && lead && (() => {
          const stages     = getPipelineStages(session?.trade_slug)
          const stageObj   = stages.find(s => s.key === currentStage)
          const activeStgs = stages.filter(s => !s.terminal)
          const curPos     = activeStgs.findIndex(s => s.key === currentStage)
          const nextStage  = activeStgs[curPos + 1] ?? null
          const isTerminal = currentStage === 'job_won' || currentStage === 'unqualified' || currentStage === 'lost'

          const validKeys = isRoofingTrade
            ? (ROOFING_VALID_TRANSITIONS[currentStage as keyof typeof ROOFING_VALID_TRANSITIONS] ?? [])
            : stages.filter(s => s.key !== currentStage).map(s => s.key)
          const validStages = validKeys.map(k => stages.find(s => s.key === k)).filter(Boolean) as typeof stages
          const curPos2     = stages.findIndex(s => s.key === currentStage)
          const fwdStages   = validStages.filter(s => !s.terminal && stages.findIndex(s2 => s2.key === s.key) > curPos2)
          const termStages  = validStages.filter(s => s.terminal)
          const bwdStages   = validStages.filter(s => !s.terminal && stages.findIndex(s2 => s2.key === s.key) < curPos2)

          const TIPS: Record<string, string> = {
            lead_in: 'Call within 1 hour — response rate drops 80% after 24hrs.',
            inspection_scheduled: 'Confirm appointment the evening before. Bring a moisture meter.',
            proposal_sent: 'Follow up in 48hrs if no response. Most jobs are won on the follow-up.',
            proposal_signed: 'Collect deposit now — 25–33% is standard.',
            insurance_approved: 'Order materials within 24hrs to lock price.',
            scheduled: 'Send job start reminder to homeowner 48hrs before crew arrives.',
            in_progress: 'Take photos at each phase: decking, installation, completion.',
            job_won: 'Request a Google review within 24hrs — 70% response rate.',
          }
          const stageTip = TIPS[currentStage] ?? ''

          const tabs: { key: DetailTab; label: string }[] = [
            { key: 'details', label: 'Job Details' },
            ...(isRoofingTrade ? [{ key: 'photos' as DetailTab, label: 'Photos' }] : []),
            { key: 'estimate', label: 'Estimate' },
            { key: 'activity', label: 'Activity' },
          ]

          const insights = getInsights(lead)

          // Primary: address > name; subtitle: phone • source
          const primaryLabel = lead.property_address ? lead.property_address.replace(/, USA$/, '') : capName(lead.contact_name)
          const hasAddress = !!lead.property_address
          const subtitleParts = [lead.contact_phone ? fmtPhone(lead.contact_phone) : null, lead.lead_source ? lead.lead_source.replace(/_/g,' ') : null].filter(Boolean)
          const subtitle = subtitleParts.join(' • ')

          const daysOld = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
          const isHealthy = daysOld <= 7 && !isOverdue(lead.follow_up_date)

          const createdFmt = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' + new Date(lead.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

          function StagePanelRow({ stg, isNext, isBackward, isTerminalRow }: { stg: typeof stages[0]; isNext?: boolean; isBackward?: boolean; isTerminalRow?: boolean }) {
            const dotColor = isTerminalRow ? '#EF4444' : isBackward ? '#94A3B8' : stg.color
            const rowBg    = isNext ? (dk ? `${stg.color}12` : stg.bg) : isTerminalRow ? (dk ? 'rgba(239,68,68,0.06)' : '#FFF5F5') : (dk ? '#0F172A' : 'white')
            return (
              <button onClick={() => { if (isBackward || isTerminalRow) setConfirmBack(stg.key as LeadStatus); else handleStageClick(stg.key as LeadStatus) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: isNext ? '10px 12px' : '9px 12px', borderRadius: isNext ? 10 : 8, border: `${isNext ? '1.5' : '1'}px solid ${isNext ? stg.color + '40' : (dk ? '#1E293B' : '#EEF0F3')}`, background: rowBg, cursor: 'pointer', textAlign: 'left', boxShadow: isNext ? `0 2px 8px ${stg.color}18` : 'none', marginBottom: 4, transition: 'all 0.12s', opacity: isBackward ? 0.8 : 1 }}>
                <StageIconCircle stageKey={stg.key} color={dotColor} size={isNext ? 30 : 26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: isNext ? 13 : 12, fontWeight: isNext ? 700 : 600, color: isTerminalRow ? '#EF4444' : isBackward ? ts : stg.color }}>{stg.label}</span>
                    {isNext && <span style={{ fontSize: 9, fontWeight: 700, color: stg.color, background: dk ? `${stg.color}20` : stg.bg, padding: '1px 6px', borderRadius: 20, border: `1px solid ${stg.color}30` }}>Recommended</span>}
                  </div>
                  <div style={{ fontSize: 11, color: ts, marginTop: 1 }}>{stg.subLabel}</div>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.5 }}>
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            )
          }

          return (
            <>
              {showWarranty && isRoofingTrade && (
                <WarrantyRecord leadId={lead.id} proId={session!.id} propertyId={null} darkMode={dk}
                  onSaved={() => { setShowWarranty(false); addToast('Warranty recorded') }}
                  onDismiss={() => setShowWarranty(false)} />
              )}

              {/* Back nav */}
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => router.push(backNav().href)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: ts, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Ic color={ts}><polyline points="15 18 9 12 15 6"/></Ic>
                  {backNav().label}
                </button>
              </div>

              {/* ── 3-column grid — using Tailwind lg: classes ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px_260px] gap-4">

                {/* ══ MAIN COLUMN ══ */}
                <div style={{ minWidth: 0 }}>

                  {/* HERO CARD */}
                  <div style={{ background: card, borderRadius: 16, marginBottom: 12, overflow: 'hidden', border: `1px solid ${border}`, boxShadow: dk ? 'none' : '0 4px 20px rgba(0,0,0,0.07)' }}>

                    {/* Identity */}
                    <div style={{ padding: '20px 20px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        {/* Left: avatar + name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                          <div style={{ width: 50, height: 50, borderRadius: 14, background: avBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: avFg, flexShrink: 0, letterSpacing: '-0.02em' }}>
                            {initials(lead.contact_name)}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 19, fontWeight: 800, color: tp, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{primaryLabel}</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isHealthy ? '#DCFCE7' : '#FEE2E2', color: isHealthy ? '#166534' : '#991B1B', flexShrink: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isHealthy ? '#16A34A' : '#DC2626', display: 'inline-block' }} />
                                {isHealthy ? 'Healthy' : 'At Risk'}
                              </span>
                            </div>
                            {/* Subtitle: if address shown, show name as secondary; otherwise phone • source */}
                            <div style={{ fontSize: 13, color: ts, marginTop: 3 }}>
                              {hasAddress ? capName(lead.contact_name) + (subtitle ? ' • ' + subtitle : '') : subtitle}
                            </div>
                          </div>
                        </div>
                        {/* Right: action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {lead.contact_phone && (
                            <a href={`tel:${lead.contact_phone.replace(/\D/g,'')}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: tp, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
                              <Ic color={tp} size={13}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Ic>
                              Call
                            </a>
                          )}
                          <button onClick={openDrawer} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </button>
                        </div>
                      </div>
                      {/* Stage + timestamp */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: stageObj?.bg ?? '#F0FDFA', color: stageObj?.color ?? '#0F766E' }}>{stageObj?.label ?? currentStage}</span>
                        <span style={{ fontSize: 12, color: ts }}>{createdFmt}</span>
                        {lead.quoted_amount != null && <span style={{ fontSize: 13, fontWeight: 700, color: '#0F766E', marginLeft: 'auto' }}>${Number(lead.quoted_amount).toLocaleString()}</span>}
                      </div>
                    </div>

                    {/* Progress tracker */}
                    <div style={{ borderTop: `1px solid ${border}`, padding: '16px 20px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                        {activeStgs.map((stg, i) => {
                          const done = i < curPos; const active = i === curPos; const isLast = i === activeStgs.length - 1
                          return (
                            <div key={stg.key} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : 1 }}>
                              <button onClick={() => { if (done && !stageSaving) setConfirmBack(stg.key as LeadStatus) }} title={stg.label} style={{ width: active ? 22 : done ? 20 : 12, height: active ? 22 : done ? 20 : 12, borderRadius: '50%', flexShrink: 0, padding: 0, background: done ? stg.color : active ? stg.color : (dk ? '#2D3748' : '#E2E8F0'), border: active ? '3px solid white' : 'none', boxShadow: active ? `0 0 0 3px ${stg.color}, 0 4px 14px ${stg.color}55` : done ? `0 2px 6px ${stg.color}40` : 'none', cursor: done ? 'pointer' : 'default', transition: 'all 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </button>
                              {!isLast && <div style={{ flex: 1, height: 2, margin: '0 2px', background: done ? `linear-gradient(90deg, ${stg.color}, ${activeStgs[i+1]?.color ?? stg.color})` : (dk ? '#1E293B' : '#E8ECEF'), transition: 'background 0.3s' }} />}
                            </div>
                          )
                        })}
                      </div>
                      {/* All stage labels */}
                      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                        {activeStgs.map((stg, i) => {
                          const done = i < curPos; const active = i === curPos; const isLast = i === activeStgs.length - 1
                          return (
                            <div key={stg.key} style={{ flex: isLast ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, lineHeight: 1.3, color: active ? stg.color : done ? (dk ? '#6B7280' : '#9CA3AF') : (dk ? '#374151' : '#CBD5E1'), maxWidth: '100%', textAlign: 'center', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {active ? stg.label : done ? '✓' : stg.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Mobile-only: move button */}
                    {!isTerminal && nextStage && (
                      <div className="lg:hidden" style={{ padding: '0 20px 18px' }}>
                        <button onClick={() => handleStageClick(nextStage.key as LeadStatus)} disabled={stageSaving} style={{ width: '100%', padding: '13px 20px', borderRadius: 12, border: 'none', cursor: stageSaving ? 'wait' : 'pointer', background: stageSaving ? (dk ? '#334155' : '#E5E7EB') : 'linear-gradient(135deg, #0F766E, #0D9488)', color: stageSaving ? ts : 'white', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: stageSaving ? 'none' : '0 4px 16px rgba(15,118,110,0.28)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M8 6l6 6-6 6"/></svg>
                          {stageSaving ? 'Updating...' : `Move to ${nextStage.label}`}
                        </button>
                        {stageTip && <div style={{ marginTop: 8, fontSize: 12, color: ts, textAlign: 'center', lineHeight: 1.4 }}>💡 {stageTip}</div>}
                      </div>
                    )}
                    {isTerminal && (
                      <div className="lg:hidden" style={{ padding: '0 20px 18px' }}>
                        <div style={{ padding: '14px 20px', borderRadius: 12, textAlign: 'center', background: currentStage === 'job_won' ? 'linear-gradient(135deg, #065F46, #047857)' : (dk ? '#1E293B' : '#F3F4F6'), color: currentStage === 'job_won' ? 'white' : ts, fontSize: 15, fontWeight: 700 }}>
                          {currentStage === 'job_won' ? '🏆 Job Complete' : currentStage === 'lost' ? 'Job Lost' : 'Lead Unqualified'}
                        </div>
                      </div>
                    )}
                  </div>{/* end hero card */}

                  {/* TABS */}
                  <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? 'none' : '0 2px 10px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', background: dk ? '#111827' : '#F5F4F0', borderBottom: `1px solid ${border}`, padding: '4px 4px 0' }}>
                      {tabs.map(tab => {
                        const isActive = activeTab === tab.key
                        return (
                          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, padding: '9px 8px', fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? '#0F766E' : (dk ? '#64748B' : '#6B7280'), background: isActive ? card : 'transparent', border: 'none', borderRadius: '8px 8px 0 0', boxShadow: isActive ? `0 -1px 0 ${border}, 1px 0 0 ${border}, -1px 0 0 ${border}` : 'none', cursor: 'pointer', whiteSpace: 'nowrap', position: 'relative', zIndex: isActive ? 1 : 0, marginBottom: isActive ? -1 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#0F766E' : (dk ? '#64748B' : '#9CA3AF')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              {TAB_ICONS[tab.key]}
                            </svg>
                            {tab.label}
                          </button>
                        )
                      })}
                    </div>

                    {activeTab === 'details' && (
                      <div style={{ padding: '16px 18px' }}>
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${border}`, marginBottom: 18 }}>
                          {[
                            { label: 'PHONE',     value: fmtPhone(lead.contact_phone),                                         copy: lead.contact_phone },
                            { label: 'EMAIL',     value: lead.contact_email || '—',                                             copy: lead.contact_email },
                            { label: 'ADDRESS',   value: (lead as any).property_address || [lead.contact_city, lead.contact_state].filter(Boolean).join(', ') || '—', copy: null },
                            { label: 'SOURCE',    value: (lead.lead_source || '—').replace(/_/g,' '),                          copy: null },
                            { label: 'JOB DATE',  value: fmt(lead.scheduled_date),                                              copy: null },
                            { label: 'FOLLOW-UP', value: lead.follow_up_date ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{fmt(lead.follow_up_date)}{isOverdue(lead.follow_up_date) && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 600 }}>Overdue</span>}</span> : '—', copy: null },
                          ].reduce((rows: any[][], cell, i) => { if (i % 2 === 0) rows.push([cell]); else rows[rows.length-1].push(cell); return rows }, []).map((row, rowIdx) => (
                            <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: rowIdx % 2 === 1 ? (dk ? '#111827' : '#F9F8F6') : card, borderBottom: rowIdx < 2 ? `1px solid ${border}` : 'none' }}>
                              {row.map((cell: any) => (
                                <div key={cell.label} style={{ padding: '13px 16px', borderRight: row.indexOf(cell) === 0 ? `1px solid ${border}` : 'none' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: dk ? '#64748B' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{cell.label}</div>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: tp, display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-word' }}>
                                    {cell.value}{cell.copy && typeof cell.copy === 'string' && <CopyBtn text={cell.copy} color={ts} />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        {isRoofingTrade && <InsuranceClaimFields leadId={lead.id} proId={session!.id} initial={(lead as any).insurance_data ?? {}} darkMode={dk} onSaved={(data) => setLead(l => l ? { ...l, insurance_data: data } as any : l)} />}
                        <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${border}` }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: dk ? '#94A3B8' : '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Notes</div>
                          {lead.notes && <div style={{ fontSize: 14, color: tp, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 10, padding: '10px 12px', background: t.cardBgAlt, borderRadius: 8, border: `1px solid ${border}` }}>{lead.notes}</div>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={composerText} onChange={e => setComposerText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && composerText.trim()) { e.preventDefault(); handleAddNote() } }} placeholder="Add a note..." style={{ flex: 1, fontSize: 14, padding: '9px 12px', borderRadius: 8, border: `1px solid ${border}`, background: card, color: tp, outline: 'none', fontFamily: 'inherit' }} />
                            <button onClick={handleAddNote} disabled={savingNote || !composerText.trim()} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !composerText.trim() ? 0.4 : 1 }}>{savingNote ? '...' : 'Save'}</button>
                          </div>
                        </div>
                        {lead.message && <div style={{ marginTop: 14, padding: '12px 14px', background: t.cardBgAlt, borderRadius: 8, border: `1px solid ${border}` }}><div style={{ fontSize: 11, fontWeight: 800, color: dk ? '#94A3B8' : '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Original message</div><div style={{ fontSize: 14, color: tp, lineHeight: 1.6, fontStyle: 'italic' }}>"{lead.message}"</div></div>}
                      </div>
                    )}

                    {activeTab === 'photos' && isRoofingTrade && <div style={{ padding: '16px 18px' }}><JobPhotoLog leadId={lead.id} proId={session!.id} isRoofing={isRoofingTrade} darkMode={dk} /></div>}

                    {activeTab === 'estimate' && (
                      <div style={{ padding: '16px 18px' }}>
                        {leadEstimate ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ padding: '16px 18px', borderRadius: 12, background: '#F0FDFA', border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div><div style={{ fontSize: 11, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Estimate</div><div style={{ fontSize: 24, fontWeight: 800, color: '#0F766E', letterSpacing: '-0.03em' }}>${leadEstimate.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                              <button onClick={() => router.push(`/dashboard/estimates/${leadEstimate.id}?from=pipeline&lead_id=${id}`)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Open #{leadEstimate.estimate_number}</button>
                            </div>
                            {leadInvoice && <div style={{ padding: '14px 16px', borderRadius: 10, background: '#FFF7ED', border: '1px solid #FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><div style={{ fontSize: 11, fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Invoice</div><div style={{ fontSize: 18, fontWeight: 700, color: '#C2410C' }}>${leadInvoice.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2 })} due</div></div><button onClick={() => router.push(`/dashboard/invoices/${leadInvoice.id}`)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#C2410C', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>View Invoice</button></div>}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '32px 0' }}>
                            <div style={{ fontSize: 14, color: ts, marginBottom: 16 }}>No estimate yet</div>
                            <button onClick={createEstimate} disabled={creatingEst} style={{ padding: '11px 28px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: creatingEst ? 0.7 : 1 }}>{creatingEst ? 'Creating...' : '+ Create Estimate'}</button>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'activity' && (
                      <div style={{ padding: '16px 18px' }}>
                        {activity.length === 0 ? <div style={{ textAlign: 'center', padding: '32px 0', color: ts, fontSize: 14 }}>No activity yet.</div>
                          : activity.map((item, i) => {
                            const iconColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#3C3489' : '#0F766E'
                            const iconBg    = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEEDFE' : '#E1F5EE'
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </svg>
                                </div>
                                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: tp }}>{item.title}</div><div style={{ fontSize: 13, color: ts, marginTop: 2 }}>{item.sub}</div></div>
                                <div style={{ fontSize: 12, color: ts, flexShrink: 0 }}>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>{/* end tabs card */}
                </div>{/* end main column */}

                {/* ══ INSIGHTS COLUMN (desktop only) ══ */}
                <div className="hidden lg:block">
                  <div style={{ position: 'sticky', top: 16 }}>
                    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? 'none' : '0 2px 10px rgba(0,0,0,0.05)' }}>
                      <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tp, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Insights</span>
                      </div>
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {insights.map((ins, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: ins.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ins.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ins.icon}</svg>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: tp }}>{ins.title}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: ins.color, marginTop: 1 }}>{ins.body}</div>
                              <div style={{ fontSize: 11, color: ts, marginTop: 1 }}>{ins.sub}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ══ MOVE THIS JOB PANEL (desktop only) ══ */}
                <div className="hidden lg:block">
                  <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>

                    {/* Activity compact */}
                    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? 'none' : '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${border}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: tp, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activity</div>
                      </div>
                      <div style={{ maxHeight: 160, overflowY: 'auto', padding: '10px 14px' }}>
                        {activity.length === 0
                          ? <div style={{ fontSize: 12, color: ts, textAlign: 'center', padding: '16px 0' }}>No activity yet</div>
                          : activity.map((item, i) => {
                            const iconColor = item.type === 'note' ? '#854F0B' : item.type === 'quote' ? '#6366F1' : '#0F766E'
                            const iconBg    = item.type === 'note' ? '#FAEEDA' : item.type === 'quote' ? '#EEF2FF' : '#E1F5EE'
                            return (
                              <div key={i} style={{ display: 'flex', gap: 8, paddingBottom: 10, marginBottom: i < activity.length - 1 ? 10 : 0, borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none' }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    {item.type === 'created'   && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type === 'note'      && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type === 'quote'     && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type === 'scheduled' && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: tp }}>{item.title}</div>
                                  <div style={{ fontSize: 11, color: ts, marginTop: 1, lineHeight: 1.3 }}>{item.sub}</div>
                                  <div style={{ fontSize: 10, color: ts, opacity: 0.5, marginTop: 2 }}>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>

                    {/* Move this job */}
                    {!isTerminal && (
                      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', boxShadow: dk ? 'none' : '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${border}` }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: tp, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Move this job</div>
                          <div style={{ fontSize: 11, color: ts, marginTop: 2 }}>Currently: <span style={{ fontWeight: 600, color: stageObj?.color ?? '#0F766E' }}>{stageObj?.label ?? currentStage}</span></div>
                        </div>
                        <div style={{ padding: '10px 12px 14px' }}>
                          {/* Next best step */}
                          {fwdStages.length > 0 && (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px 6px' }}>
                                <div style={{ width: 3, height: 10, borderRadius: 2, background: '#0F766E' }} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: dk ? '#CBD5E1' : '#1F2937', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Next best step</span>
                              </div>
                              <StagePanelRow stg={fwdStages[0]} isNext />
                            </>
                          )}
                          {/* All stages */}
                          {(fwdStages.length > 1 || termStages.length > 0 || bwdStages.length > 0) && (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 2px 6px', marginTop: 4 }}>
                                <div style={{ width: 3, height: 10, borderRadius: 2, background: '#94A3B8' }} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: dk ? '#CBD5E1' : '#1F2937', textTransform: 'uppercase', letterSpacing: '0.07em' }}>All stages</span>
                              </div>
                              {fwdStages.slice(1).map(stg => <StagePanelRow key={stg.key} stg={stg} />)}
                              {termStages.map(stg => <StagePanelRow key={stg.key} stg={stg} isTerminalRow />)}
                              {bwdStages.map(stg => <StagePanelRow key={stg.key} stg={stg} isBackward />)}
                            </>
                          )}
                          {stageTip && <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 8, background: dk ? '#0F172A' : '#F8FAFC', border: `1px solid ${border}`, fontSize: 11, color: ts, lineHeight: 1.5 }}>💡 {stageTip}</div>}
                          <button onClick={() => router.push(backNav().href)} style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 8, border: `1px solid ${border}`, background: 'none', color: ts, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>← Back to Pipeline</button>
                        </div>
                      </div>
                    )}

                    {isTerminal && (
                      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center', boxShadow: dk ? 'none' : '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>{currentStage === 'job_won' ? '🏆' : '🚫'}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: tp, marginBottom: 4 }}>{currentStage === 'job_won' ? 'Job Won!' : currentStage === 'lost' ? 'Job Lost' : 'Unqualified'}</div>
                        <div style={{ fontSize: 12, color: ts, lineHeight: 1.5, marginBottom: 12 }}>{currentStage === 'job_won' ? 'Request a Google review within 24hrs.' : 'This lead is closed.'}</div>
                        {currentStage !== 'job_won' && <button onClick={() => handleStageClick('lead_in' as LeadStatus)} style={{ fontSize: 12, color: '#0F766E', background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 8, cursor: 'pointer', padding: '7px 14px', fontWeight: 600 }}>Reopen Lead</button>}
                      </div>
                    )}
                  </div>
                </div>{/* end move panel */}

              </div>{/* end 3-col grid */}
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
