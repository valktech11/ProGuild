'use client'
import { useState, useEffect, use, useCallback, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lead, LeadStatus, isPaidPlan } from '@/types'
import { useProSession } from '@/lib/hooks/useProSession'
import { avatarColor, initials, capName, fmtPhone, US_STATES } from '@/lib/utils'
import { theme, T, BRAND } from '@/lib/tokens'
import DashboardShell from '@/components/layout/DashboardShell'
import { getPipelineStages, LostReasonSheet } from '@/components/ui/LeadPipeline'
import { getTradeConfig, getActiveStages, isRoofing as isRoofing_guard, isRoofing as _isRoofing, getStageAnchors } from '@/lib/trades/_registry'
import type { StagePlanEntry } from '@/lib/trades/roofing/stage-rules'
// Roofing components accessed via trade module path — not components/roofing
import InsuranceClaimFields from '@/lib/trades/roofing/components/InsuranceClaimFields'
import SupplementAssistant from '@/lib/trades/roofing/components/SupplementAssistant'
import JobPhotoLog from '@/lib/trades/roofing/components/JobPhotoLog'
import WarrantyRecord from '@/lib/trades/roofing/components/WarrantyRecord'

// Captures the last lead-PATCH error message so saveEdit can show it in the toast
let _lastPatchError = ''

// ─── Stage order map ──────────────────────────────────────────────────────────
// STAGE_ORDER and SOURCE_OPTIONS are derived inside the component from the trade plugin.
// This fallback is used for non-roofing trades until their configs define leadSources.
const FALLBACK_SOURCE_OPTIONS = [
  'Phone Call','Profile Page','Referral','Facebook','Instagram',
  'Yard Sign','Canvassing','Insurance','Website','Other',
]

interface LeadExt extends Lead {
  contact_city:  string | null
  contact_state: string | null
  client_id:     string | null
  updated_at:    string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}
function daysAgo(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}
function isOverdue(d: string | null) { return !!d && new Date(d) < new Date() }

interface Toast { id:number; msg:string; type:'success'|'error'|'info'|'warning'; prev?:LeadStatus }

// ─── SVG helper ───────────────────────────────────────────────────────────────
function Svg({ size=14, stroke='currentColor', sw=2, children }: {
  size?:number; stroke?:string; sw?:number; children:React.ReactNode
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

function CopyBtn({ text, color }: { text:string; color:string }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(()=>setOk(false),1500) }) }}
      style={{ background:'none', border:'none', cursor:'pointer', padding:'0 2px', color, opacity: ok?1:0.45, lineHeight:1, display:'flex', flexShrink:0 }}>
      <Svg size={13} stroke={color}>
        {ok ? <polyline points="20 6 9 17 4 12"/> : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>}
      </Svg>
    </button>
  )
}

// ─── Stage icon for dropdown rows ─────────────────────────────────────────────
function StageIcon({ k, color, size=24 }: { k:string; color:string; size?:number }) {
  const ic = size * 0.48
  const isDate = ['inspection_scheduled','scheduled','Scheduled'].some(x => x === k)
  const isDoc  = ['proposal_sent','proposal_signed','Quoted'].some(x => x === k)
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:color+'1A',
      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Svg size={ic} stroke={color}>
        {k==='lead_in'           && <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>}
        {isDate                  && <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
        {isDoc                   && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
        {k==='insurance_approved'&& <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
        {k==='in_progress'       && <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>}
        {k==='job_won'           && <polyline points="8 6 2 12 8 18"/>}
        {k==='lost'              && <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}
        {k==='unqualified'       && <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>}
        {/* Default icon for any stage key not matched above */}
        {!['lead_in','inspection_scheduled','scheduled','Scheduled',
           'proposal_sent','proposal_signed','Quoted','insurance_approved',
           'in_progress','job_won','lost','unqualified'].some(x => x === k) && <circle cx="12" cy="12" r="10"/>}
      </Svg>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function LeadDetailInner({ params }: { params: Promise<{ id:string }> }) {
  const { id }   = use(params)
  const router   = useRouter()
  const sp       = useSearchParams()
  const fromParam = sp.get('from')
  const fromEst   = sp.get('est_id')
  const appliedFromProMeasure = sp.get('applied') === '1' && fromParam === 'promeasure'

  function backNav() {
    // Trade label from plugin — no slug string comparisons
    const pipelineTerm = tradePlugin.labels.pipeline ?? 'Jobs'
    if (fromParam==='calendar')  return { label:'Back to Calendar',  href:'/dashboard/calendar' }
    if (fromParam==='clients')   return { label:'Back to Clients',   href:'/dashboard/clients' }
    if (fromParam==='estimates') return { label:'Back to Estimate',  href: fromEst?`/dashboard/estimates/${fromEst}`:'/dashboard/estimates' }
    return { label:`Back to ${pipelineTerm}`, href:'/dashboard/pipeline' }
  }

  // ── Session ─────────────────────────────────────────────────────────────
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState(false)
  useEffect(() => { if (typeof window!=='undefined') setDk(localStorage.getItem('pg_darkmode')==='1') }, [])

  const [isWide, setIsWide] = useState(false)

  // Responsive 2-col grid — pure JS, no Tailwind arbitrary values
  useEffect(() => {
    function check() { setIsWide(window.innerWidth >= 900) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const toggleDark = () => { const n=!dk; setDk(n); localStorage.setItem('pg_darkmode',n?'1':'0') }

  // ── Lead data ────────────────────────────────────────────────────────────
  const [lead,    setLead]    = useState<LeadExt|null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [stage,   setStage]   = useState<LeadStatus>('New')
  const [saving,  setSaving]  = useState(false)

  // ── UI state ─────────────────────────────────────────────────────────────
  type Tab = 'details'|'photos'|'estimate'|'activity'
  const [tab,          setTab]          = useState<Tab>('details')
  const [isEditing,    setIsEditing]    = useState(false)
  const [showPicker,   setShowPicker]   = useState(false)
  // Persistent info/warning popover anchored under the status dropdown (replaces
  // the transient toast for blocked/locked stage taps — stays until dismissed).
  const [stageNotice, setStageNotice] = useState<{ kind:'info'|'warning'; msg:string }|null>(null)
  const [showWarranty, setShowWarranty] = useState(false)
  const [confirmBack,  setConfirmBack]  = useState<LeadStatus|null>(null)
  // Canonical move rules for this lead — served by /api/roofing/stage-plan.
  const [stagePlan, setStagePlan] = useState<StagePlanEntry[]>([])
  const planFor = (k: string) => stagePlan.find(e => e.key === k)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showInspectionModal, setShowInspectionModal] = useState(false)
  const [inspDate, setInspDate] = useState('')
  const [schedDate,  setSchedDate]  = useState('')
  const [schedTime,  setSchedTime]  = useState('')

  // ── Edit fields ──────────────────────────────────────────────────────────
  const [eAddr,  setEAddr]  = useState('')
  const [eAddrPredictions, setEAddrPredictions] = useState<Array<{description:string;place_id:string}>>([])
  const [eAddrShowPred,    setEAddrShowPred]    = useState(false)
  const [eAddrLoading,     setEAddrLoading]     = useState(false)
  const [ePhone, setEPhone] = useState('')
  const [eEmail, setEEmail] = useState('')
  const [eCity,  setECity]  = useState('')
  const [eState, setEState] = useState('')
  const [eZip,   setEZip]   = useState('')
  const [eSrc,   setESrc]   = useState('')
  const [eDate,  setEDate]  = useState('')
  const [eTime,  setETime]  = useState('')
  const [eFU,    setEFU]    = useState('')
  const [eInsp,  setEInsp]  = useState('')
  const [eNotes, setENotes] = useState('')
  const [eSaving,setESaving]= useState(false)

  // ── Note ────────────────────────────────────────────────────────────────
  const [noteText,    setNoteText]    = useState('')
  const [savingNote,  setSavingNote]  = useState(false)
  const [qbGenerating,   setQbGenerating]   = useState(false)
  const [dsmRunning,     setDsmRunning]     = useState(false)
  const [reportRowId,    setReportRowId]    = useState<string|null>(null)
  const [pipelineEvents, setPipelineEvents] = useState<any[]>([])
  const [qbDone,         setQbDone]         = useState(false)
  const [qbError,        setQbError]        = useState('')
  const [showRemeasure,  setShowRemeasure]  = useState(false)

  // ── Estimate / invoice ───────────────────────────────────────────────────
  const [est, setEst] = useState<{id:string;estimate_number:string;total:number;status:string}|null>(null)
  // All non-void estimates for this lead (original + any revisions) — for stacked display
  const [estList, setEstList] = useState<{id:string;estimate_number:string;total:number;status:string;revision_of?:string|null;revision_number?:number}[]>([])
  // Superseded/voided estimates for this lead — for the history trail
  const [supersededList, setSupersededList] = useState<{id:string;estimate_number:string;total:number;status:string;void_reason?:string|null;voided_at?:string|null;revision_number?:number}[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [inv, setInv] = useState<{id:string;invoice_number:string;status:string;balance_due:number}|null>(null)
  const [creatingEst, setCreatingEst] = useState(false)
  const [photoCount, setPhotoCount]   = useState(0)

  // ── Toasts ───────────────────────────────────────────────────────────────
  const [toasts,   setToasts]   = useState<Toast[]>([])
  const [toastSeq, setToastSeq] = useState(0)
  const [showLostSheet, setShowLostSheet] = useState(false)
  function addToast(msg:string, type:Toast['type']='success', prev?:LeadStatus) {
    const tid=toastSeq+1; setToastSeq(tid)
    setToasts(t=>[...t,{id:tid,msg,type,prev}])
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==tid)),5000)
  }
  function killToast(tid:number) { setToasts(t=>t.filter(x=>x.id!==tid)) }

  async function shareStatus() {
    if (!session || !lead?.contact_email) {
      addToast('No email on file for this homeowner — add one in Edit', 'error')
      return
    }
    try {
      const r = await fetch('/api/leads/send-status-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: id, pro_id: session.id }),
      })
      const d = await r.json()
      if (!r.ok) { addToast(d.error || 'Failed to send', 'error'); return }
      addToast(`Status link sent to ${lead.contact_email}`, 'success')
    } catch { addToast('Failed to send status email', 'error') }
  }

  const tradePlugin = getTradeConfig(session?.trade_slug)
  const isRoofing = isRoofing_guard(tradePlugin)
  // isPro: hardcoded true until Stripe plan enforcement goes live
  const isPro = true

  // Derived from trade plugin — no hardcoded stage keys or source labels
  const STAGE_ORDER: Record<string, number> = Object.fromEntries(
    getActiveStages(session?.trade_slug).map((s, i) => [s.key, i])
  )
  const SOURCE_OPTIONS: { value: string; label: string }[] = isRoofing
    ? tradePlugin.leadSources.map((s: { value: string; label: string }) => ({ value: s.value, label: s.label }))
    : FALLBACK_SOURCE_OPTIONS.map(s => ({ value: s.replace(/ /g, '_'), label: s }))

  // ── Fetch lead ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    fetch(`/api/leads/${id}?pro_id=${session.id}`)
      .then(r => { if(r.status===404){setMissing(true);setLoading(false);return null}; return r.json() })
      .then(d => { if(!d) return; const l=d.lead as LeadExt; setLead(l); setStage(l.lead_status as LeadStatus); setLoading(false) })
      .catch(()=>setLoading(false))
    // Fetch stage transition history
    fetch(`/api/pipeline-events?lead_id=${id}&pro_id=${session.id}`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(d => setPipelineEvents(d.events || []))
      .catch(() => {})
  }, [session, id, router])

  // Re-fetch pipeline events (Activity tab) on demand — used after saves that write events
  const refreshEvents = useCallback(() => {
    if (!session) return
    fetch(`/api/pipeline-events?lead_id=${id}&pro_id=${session.id}`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(d => setPipelineEvents(d.events || []))
      .catch(() => {})
  }, [session, id])

  const refreshEst = useCallback(() => {
    if (!session||!lead) return
    fetch(`/api/estimates?pro_id=${session.id}`).then(r=>r.json()).then(d => {
      const arr=(d.estimates||[]).filter((e:any)=>e.lead_id===lead.id&&!['void','declined'].includes(e.status))
      if (!arr.length) { setEst(null); setEstList([]); return }
      const pri=['invoiced','approved','paid','sent','viewed','draft']
      const sorted=[...arr].sort((a:any,b:any)=>pri.indexOf(a.status)<pri.indexOf(b.status)?-1:1)
      setEst(sorted[0])
      // Stacked display: original first, then revisions in order (oldest → newest)
      const ordered=[...arr].sort((a:any,b:any)=>(a.revision_number??0)-(b.revision_number??0))
      setEstList(ordered)
      // History trail: voided estimates that were superseded (part of this lead's revision chain)
      const voided=(d.estimates||[]).filter((e:any)=>e.lead_id===lead.id&&e.status==='void')
        .sort((a:any,b:any)=>(a.revision_number??0)-(b.revision_number??0))
      setSupersededList(voided)
    }).catch(()=>{})
  }, [session, lead])

  // Re-fetch estimate on visibility change (tab switch) and on fromParam change
  // (covers returning from calculator/estimate editor via client-side nav)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshEst() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshEst])

  // The move sheet's single source of truth. Refetched whenever the inputs the
  // gates read can change (stage / estimate / invoice / lead fields).
  const refreshPlan = useCallback(() => {
    if (!session || !lead || !isRoofing) return
    fetch(`/api/roofing/stage-plan?lead_id=${lead.id}&pro_id=${session.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stages) setStagePlan(d.stages as StagePlanEntry[]) })
      .catch(() => {})
  }, [session, lead, isRoofing])

  useEffect(() => { refreshPlan() }, [refreshPlan, stage, est, inv])

  useEffect(() => {
    refreshEst()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromParam])

  useEffect(() => {
    if (!session||!lead) return
    refreshEst()
    fetch(`/api/invoices?pro_id=${session.id}&lead_id=${lead.id}`).then(r=>r.json()).then(d => {
      const i=(d.invoices||[]).find((x:any)=>x.status!=='void'); if(i) setInv(i)
    }).catch(()=>{})
    // Eagerly fetch photo count so Photos tab label shows correct number on first render
    if (isRoofing) {
      fetch(`/api/leads/${lead.id}/photos?pro_id=${session.id}`).then(r=>r.json()).then(d => {
        if (d?.photos?.length) setPhotoCount(d.photos.length)
      }).catch(()=>{})
    }
  }, [session, lead])

  // When returning from ProMeasure with measurements applied:
  // re-fetch the lead so roofing_job_data is fresh in state before UI renders pills
  useEffect(() => {
    if (!appliedFromProMeasure || !session || !lead) return
    fetch(`/api/leads/${lead.id}?pro_id=${session.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.lead) {
          setLead(d.lead)
          setStage(d.lead.lead_status)
        }
        addToast('Measurements applied to lead', 'success')
        // Strip ?from=promeasure&applied=1 so toast never re-fires on back-nav or re-render
        router.replace(`/dashboard/pipeline/${lead.id}`)
      })
      .catch(() => addToast('Measurements applied to lead', 'success'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFromProMeasure, lead?.id])

  // ── Patch ────────────────────────────────────────────────────────────────
  const patch = useCallback(async (fields:Record<string,unknown>) => {
    if (!session) return false
    // Route lead_status changes through /stage endpoint so pipeline_events are written
    if ('lead_status' in fields) {
      const r = await fetch(`/api/leads/${id}/stage`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          pro_id: session.id,
          stage: fields.lead_status,
          ...(fields.lost_reason ? { lost_reason: fields.lost_reason } : {}),
        }),
      })
      // If stage route succeeds, also patch any other fields in the payload
      const otherFields = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'lead_status'))
      if (Object.keys(otherFields).length > 0 && r.ok) {
        await fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ pro_id: session.id, ...otherFields }),
        })
      }
      return r.ok
    }
    const r = await fetch(`/api/leads/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,...fields})})
    if (!r.ok) {
      try {
        const body = await r.json()
        _lastPatchError = body?.error || `HTTP ${r.status}`
      } catch { _lastPatchError = `HTTP ${r.status}` }
    }
    return r.ok
  }, [session, id])

  // ── Stage move ───────────────────────────────────────────────────────────
  // Move rules come entirely from the server plan (/api/roofing/stage-plan, via
  // planFor). No gate logic lives in this client anymore.
  async function moveStage(s:LeadStatus, force=false) {
    if (s===stage||saving) return
    if (STAGE_ORDER[s]<STAGE_ORDER[stage]) { setConfirmBack(s); return }   // backward → confirm

    if (!force) {
      const lostKey = getStageAnchors(session?.trade_slug)?.lost ?? 'lost'
      const entry   = planFor(s)

      // Blocked or locked — the plan says why. Surface it; no manual override.
      // Auto stages advance by their action (send / sign / claim approved /
      // payment), never by a chip flip, so there is no "do it anyway".
      if (entry && !entry.allowed) {
        // Persistent popover under the dropdown — auto stage = info, gated manual = warning.
        setShowPicker(false)
        setStageNotice({ kind: entry.kind === 'auto' ? 'info' : 'warning', msg: entry.reason ?? 'This stage advances automatically' })
        return
      }

      // Allowed — collect any required input first (prompt comes from the plan).
      if (s === lostKey || s === 'lost') { setShowLostSheet(true); return }
      if (s === 'scheduled' || entry?.prompt === 'datetime') {
        setSchedDate(lead?.scheduled_date || '')
        setSchedTime((lead as any)?.scheduled_time || '')
        setShowScheduleModal(true)
        return
      }
      if (s === 'inspection_scheduled' || entry?.prompt === 'date') {
        setInspDate((lead as any)?.inspection_date || '')
        setShowInspectionModal(true)
        return
      }
    }

    const prev=stage; setStage(s); setSaving(true)
    const ok = await patch({lead_status:s}); setSaving(false)
    if (ok) {
      setLead(l=>l?{...l,lead_status:s}:l)
      addToast(`Moved to ${s.replace(/_/g,' ')}`,'success',prev)
      refreshPlan()
      if(tradePlugin && _isRoofing(tradePlugin) && s===((tradePlugin as any).stageAnchors?.warrantyTrigger ?? getStageAnchors(session?.trade_slug).won)) setShowWarranty(true)
    }
    else { setStage(prev); addToast('Failed to update stage','error') }
  }

  async function doConfirmBack() {
    if (!confirmBack) return
    const s=confirmBack; const prev=stage
    setConfirmBack(null); setStage(s); setSaving(true)
    const ok=await patch({lead_status:s}); setSaving(false)
    if (ok) { setLead(l=>l?{...l,lead_status:s}:l); addToast(`Moved to ${s.replace(/_/g,' ')}`,'success',prev) }
    else { setStage(prev); addToast('Failed','error') }
  }

  async function undoMove(tid:number, prev:LeadStatus) {
    killToast(tid); const from=stage; setStage(prev); setSaving(true)
    const ok=await patch({lead_status:prev}); setSaving(false)
    if (!ok) { setStage(from); addToast('Undo failed','error') }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  function startEdit() {
    if (!lead) return
    setEAddr((lead as any).property_address||'')
    setEPhone(lead.contact_phone||'')
    setEEmail(lead.contact_email||'')
    setECity(lead.contact_city||'')
    setEState(lead.contact_state||'')
    setEZip((lead as any).contact_zip||'')
    setESrc(lead.lead_source||'')
    setEDate(lead.scheduled_date||'')
    setETime((lead as any).scheduled_time||'')
    setEFU(lead.follow_up_date||'')
    setEInsp((lead as any).inspection_date||'')
    setENotes(lead.notes||'')
    setTab('details'); setIsEditing(true)
  }
  // ── Address autocomplete for edit form ──────────────────────────────────
  useEffect(() => {
    if (!eAddrLoading || eAddr.length < 3) { setEAddrPredictions([]); setEAddrShowPred(false); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(eAddr)}`)
        const data = res.ok ? await res.json() : {}
        setEAddrPredictions(data.predictions || [])
        setEAddrShowPred((data.predictions || []).length > 0)
      } catch { setEAddrPredictions([]) }
    }, 280)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eAddr, eAddrLoading])

  async function selectEAddrPrediction(pred: {description:string;place_id:string}) {
    setEAddrShowPred(false)
    setEAddrLoading(false)
    try {
      const res = await fetch(`/api/places/details?place_id=${pred.place_id}`)
      const data = res.ok ? await res.json() : {}
      const comps: any[] = data.result?.address_components || []
      let streetNum='', route='', city='', state='', zip=''
      for (const comp of comps) {
        const types: string[] = comp.types || []
        if (types.includes('street_number'))              streetNum = comp.long_name
        if (types.includes('route'))                      route     = comp.long_name
        if (types.includes('locality'))                   city      = comp.long_name
        if (!city && types.includes('sublocality_level_1')) city    = comp.long_name
        if (types.includes('administrative_area_level_1')) state    = comp.short_name
        if (types.includes('postal_code'))                zip       = comp.long_name
      }
      const street = `${streetNum} ${route}`.trim() || pred.description.split(',')[0].trim()
      // Full address string = "street, city, state zip"
      const full = [street, city, state, zip].filter(Boolean).join(', ')
      setEAddr(full)
      setECity(city || eCity)
      setEState(state || eState)
      setEZip(zip || eZip)
    } catch {
      setEAddr(pred.description)
    }
  }

  async function saveEdit() {
    setESaving(true)
    const ok = await patch({
      property_address: eAddr||null,
      contact_phone: ePhone||null, contact_email: eEmail||null,
      contact_city: eCity||null, contact_state: eState||null, contact_zip: eZip||null,
      lead_source: eSrc||null,
      scheduled_date: eDate||null, scheduled_time: eTime||null,
      ...(eInsp ? { inspection_date: eInsp } : {}),
      follow_up_date: eFU||null, notes: eNotes||null,
    })
    setESaving(false)
    if (ok) {
      setLead(l=>l?{...l,
        property_address: eAddr||null,
        contact_phone: ePhone||null, contact_email: eEmail||null,
        contact_city: eCity||null, contact_state: eState||null, contact_zip: eZip||null,
        lead_source: eSrc as any||null,
        scheduled_date: eDate||null, follow_up_date: eFU||null, ...(eInsp ? { inspection_date: eInsp } : {}), notes: eNotes||null,
      }:l)
      setIsEditing(false); addToast('Saved')
    } else addToast('Failed to save: ' + (_lastPatchError || 'unknown error'), 'error')
  }

  // ── Note ─────────────────────────────────────────────────────────────────
  async function saveNote() {
    if (!noteText.trim()) return; setSavingNote(true)
    const newNotes = lead?.notes ? `${lead.notes}\n\n${noteText.trim()}` : noteText.trim()
    const ok = await patch({notes:newNotes}); setSavingNote(false)
    if (ok) { setLead(l=>l?{...l,notes:newNotes}:l); setNoteText(''); addToast('Note saved') }
    else addToast('Failed','error')
  }

  // ── Estimate / invoice create ─────────────────────────────────────────────
  async function createEst() {
    if (!lead||!session||creatingEst) return
    setCreatingEst(true)
    try {
      // Re-fetch lead to get the latest contact_name + roofing_job_data
      // (measurements may have just been applied from Quick Bid Report or ProMeasure)
      const freshRes = await fetch(`/api/leads/${lead.id}?pro_id=${session.id}`)
      const freshData = freshRes.ok ? await freshRes.json() : null
      const freshLead = freshData?.lead ?? lead
      // Update local state so UI also reflects fresh data
      setLead(freshLead)
      const rjd = (freshLead as any)?.roofing_job_data

      const r=await fetch('/api/estimates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        pro_id:           session.id,
        lead_id:          freshLead.id,
        lead_name:        freshLead.contact_name,
        lead_source:      freshLead.lead_source||'',
        trade:            session.trade||'',
        trade_slug:       session.trade_slug||'',
        state:            session.state||'',
        contact_phone:    freshLead.contact_phone||'',
        contact_email:    freshLead.contact_email||'',
        property_address: ((freshLead as any).property_address||'').replace(/, USA$/i,'').trim(),
        // Include measurements from roofing_job_data if present
        square_count:     rjd?.square_count  ?? null,
        pitch:            rjd?.pitch         ?? null,
        waste_pct:        rjd?.waste_pct     ?? null,
        // Insurance claims use standard estimates — carrier approves a fixed scope, not tiers
        estimate_type:    rjd?.insurance_claim ? 'standard' : undefined,
      })})
      const d=await r.json(); if(d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${id}`)
    } catch { setCreatingEst(false) }
  }

  // ── Activity ──────────────────────────────────────────────────────────────
  function activity() {
    if (!lead) return []
    const items:{date:string;title:string;sub:string;type:string;warn?:boolean}[] = []
    items.push({date:lead.created_at,title:'Lead created',sub:`From ${(lead.lead_source||'unknown').replace(/_/g,' ')}${lead.message?` · "${lead.message.slice(0,60)}${lead.message.length>60?'…':''}"`:``}`,type:'created'})
    if (lead.quoted_amount!=null) items.push({date:lead.updated_at||lead.created_at,title:'Quote set',sub:`$${Number(lead.quoted_amount).toLocaleString()}`,type:'quote'})
    if ((lead as any).inspection_date) items.push({date:lead.updated_at||lead.created_at,title:'Inspection scheduled',sub:fmt((lead as any).inspection_date),type:'scheduled'})
    if (lead.scheduled_date) items.push({date:lead.updated_at||lead.created_at,title:'Job scheduled',sub:fmt(lead.scheduled_date),type:'scheduled'})
    if (lead.notes) lead.notes.split(/\n\n+/).filter(Boolean).forEach(n=>items.push({date:lead.updated_at||lead.created_at,title:'Note added',sub:n.slice(0,100)+(n.length>100?'…':''),type:'note'}))
    // Estimate events — pull from linked estimate timestamps
    if (est) {
      if ((est as any).created_at) items.push({date:(est as any).created_at,title:`Estimate created`,sub:`#${est.estimate_number} · $${Number(est.total||0).toLocaleString()}`,type:'estimate'})
      if ((est as any).sent_at) {
        const bounced = (est as any).email_status === 'bounced'
        const toEmail = (est as any).sent_to_email ? ` → ${(est as any).sent_to_email}` : ''
        const bounceNote = bounced ? ` · Bounced: ${((est as any).email_bounce_reason||'recipient not found').slice(0,50)}` : ''
        items.push({date:(est as any).sent_at,title:`Proposal sent`,sub:`#${est.estimate_number}${toEmail}${bounceNote}`,type:'estimate_sent',warn:bounced})
      }
      if ((est as any).viewed_at) {
        const count = (est as any).viewed_count > 1 ? ` · ${(est as any).viewed_count}× views` : ''
        items.push({date:(est as any).viewed_at,title:`Proposal viewed`,sub:`#${est.estimate_number}${count}`,type:'estimate_viewed'})
      }
      if ((est as any).approved_at) items.push({date:(est as any).approved_at,title:`Proposal approved`,sub:`#${est.estimate_number}`,type:'estimate_approved'})
    }
    // Superseded versions — show the supersede in the audit trail
    for (const sv of supersededList) {
      if ((sv as any).voided_at) {
        items.push({
          date: (sv as any).voided_at,
          title: `Estimate superseded`,
          sub: `#${sv.estimate_number}${sv.revision_number?` (Rev ${sv.revision_number})`:''} · ${sv.void_reason||'Replaced by a newer version'}`,
          type: 'estimate',
        })
      }
    }
    // Merge pipeline_events (stage transitions from DB)
    const stageLabels: Record<string,string> = {
      lead_in:'Lead In', inspection_scheduled:'Inspection Scheduled',
      insurance_approved:'Insurance Approved', proposal_sent:'Proposal Sent',
      proposal_signed:'Proposal Signed', scheduled:'Scheduled',
      in_progress:'In Progress', job_won:'Job Won', lost:'Lost',
    }
    for (const ev of pipelineEvents) {
      if (ev.event_type === 'stage_changed' && ev.event_data) {
        const from = stageLabels[ev.event_data.from] || ev.event_data.from
        const to   = stageLabels[ev.event_data.to]   || ev.event_data.to
        items.push({
          date:  ev.created_at,
          title: `Stage moved to ${to}`,
          sub:   `From ${from}`,
          type:  'stage',
        })
      }
      if (ev.event_type === 'invoice_sent' && ev.event_data) {
        items.push({
          date:  ev.created_at,
          title: `Invoice sent`,
          sub:   ev.event_data.email ? `→ ${ev.event_data.email}` : '',
          type:  'invoice_sent',
        })
      }
      if (ev.event_type === 'invoice_viewed' && ev.event_data) {
        items.push({
          date:  ev.created_at,
          title: `Invoice viewed`,
          sub:   ev.event_data.invoice_number ? `#${ev.event_data.invoice_number}` : '',
          type:  'invoice_viewed',
        })
      }
      if (ev.event_type === 'payment_received' && ev.event_data) {
        const amt = Number(ev.event_data.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
        const bal = Number(ev.event_data.balance_due)
        items.push({
          date:  ev.created_at,
          title: `Payment received — ${amt}`,
          sub:   `${ev.event_data.milestone} · ${ev.event_data.method}${bal <= 0 ? ' · Paid in full' : ` · Balance: ${Number(bal).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}`}`,
          type:  'payment_received',
        })
      }
      if (ev.event_type === 'supplement_filed' && ev.event_data) {
        items.push({
          date:  ev.created_at,
          title: 'Supplement filed',
          sub:   (ev.event_data as any).note ?? '',
          type:  'stage',
        })
      }
      if (ev.event_type === 'insurance_auto_approved') {
        items.push({
          date:  ev.created_at,
          title: 'Pipeline advanced to Insurance Approved',
          sub:   'Auto-advanced when claim marked Approved',
          type:  'stage',
        })
      }
    }
    return items.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime())
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  const t   = theme(dk)
  const pg  = t.pageBg; const card=t.cardBg; const bdr=t.cardBorder
  const tp  = t.textPri; const tb=t.textBody; const ts=t.textMuted; const tsu=t.textSubtle

  const inputCls: React.CSSProperties = {
    fontSize:T.fontBody, padding:'9px 11px', borderRadius:T.radSm,
    border:`1px solid ${t.inputBorder}`, background:t.inputBg,
    color:tp, width:'100%', fontFamily:'inherit', outline:'none', boxSizing:'border-box',
  }
  const labelCls: React.CSSProperties = {
    fontSize:10, fontWeight:700, color:tsu, display:'block',
    marginBottom:5, textTransform:'uppercase', letterSpacing:'0.07em',
  }

  if (!session) return null

  const acts = activity()
  const [avBg, avFg] = lead ? avatarColor(lead.contact_name) : ['#E1F5EE','#0F6E56']

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={()=>{}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{background:pg,minHeight:'100vh',padding:'16px 20px 80px',boxSizing:'border-box'}}>

        {/* ── Toasts — rendered via portal to escape any transform stacking context ── */}
        {typeof window !== 'undefined' && toasts.length > 0 && createPortal(
          <div style={{position:'fixed',top:80,left:'50%',transform:'translateX(-50%)',zIndex:9999,display:'flex',flexDirection:'column',gap:10,pointerEvents:'none',alignItems:'center'}}>
            {toasts.map(toast=>{
              const cfg = ({
                success: { accent:'#059669', title:'Done',     icon:<path d="M20 6 9 17l-5-5"/> },
                error:   { accent:'#DC2626', title:'Error',    icon:<><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></> },
                warning: { accent:'#D97706', title:'Not yet',  icon:<><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></> },
                info:    { accent:BRAND.teal, title:'Heads up', icon:<><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></> },
              } as const)[toast.type]
              return (
                <div key={toast.id} style={{pointerEvents:'all',background:card,border:`1px solid ${bdr}`,borderLeft:`4px solid ${cfg.accent}`,borderRadius:14,padding:'13px 14px',display:'flex',alignItems:'flex-start',gap:12,minWidth:300,maxWidth:440,boxShadow:dk?'0 16px 40px rgba(0,0,0,0.5)':'0 16px 40px rgba(15,23,42,0.18)'}}>
                  <div style={{width:28,height:28,borderRadius:9,background:cfg.accent+'1A',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={cfg.accent} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">{cfg.icon}</svg>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:800,color:cfg.accent,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>{cfg.title}</div>
                    <div style={{fontSize:13.5,fontWeight:500,color:tp,lineHeight:1.35}}>{toast.msg}</div>
                  </div>
                  {toast.prev&&toast.type==='success'&&<button onClick={()=>undoMove(toast.id,toast.prev!)} style={{fontSize:T.fontBody,color:BRAND.teal,fontWeight:700,background:'none',border:'none',cursor:'pointer',padding:'2px 4px',alignSelf:'center'}}>Undo</button>}
                  <button onClick={()=>killToast(toast.id)} style={{background:'none',border:'none',cursor:'pointer',color:ts,fontSize:18,lineHeight:1,padding:0,opacity:0.55,alignSelf:'flex-start'}}>×</button>
                </div>
              )
            })}
          </div>,
          document.body
        )}

        {/* ── Modals ─────────────────────────────────────────────────────── */}
        {confirmBack&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:T.sp4}} onClick={()=>setConfirmBack(null)}>
            <div style={{background:card,borderRadius:T.radLg,padding:T.sp6,maxWidth:360,width:'100%',border:`1px solid ${bdr}`}} onClick={e=>e.stopPropagation()}>
              <p style={{fontSize:T.fontLabel,fontWeight:600,color:tp,marginBottom:T.sp2}}>Move back to {String(confirmBack).replace(/_/g,' ')}?</p>
              <p style={{fontSize:T.fontBody,color:tb,marginBottom:T.sp5}}>Currently <strong>{String(stage).replace(/_/g,' ')}</strong>. Moving backward is tracked.</p>
              <div style={{display:'flex',gap:T.sp2,justifyContent:'flex-end'}}>
                <button onClick={()=>setConfirmBack(null)} style={{padding:'8px 16px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,cursor:'pointer',fontSize:T.fontBody}}>Cancel</button>
                <button onClick={doConfirmBack} style={{padding:'8px 16px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',cursor:'pointer',fontSize:T.fontBody,fontWeight:600}}>Move back</button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Inspection Modal */}
        {showInspectionModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:T.sp4}}
            onClick={()=>setShowInspectionModal(false)}>
            <div style={{background:card,borderRadius:T.radLg,padding:T.sp6,maxWidth:400,width:'100%',border:`1px solid ${bdr}`}}
              onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:17,fontWeight:800,color:tp,marginBottom:4}}>Schedule Inspection</div>
              <div style={{fontSize:13,color:tb,marginBottom:20}}>Set the inspection date to add it to your calendar.</div>
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.08em',color:ts,marginBottom:6}}>Inspection Date</div>
                <input type="date" value={inspDate} onChange={e=>setInspDate(e.target.value)}
                  style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${inspDate?BRAND.teal:bdr}`,borderRadius:T.radSm,fontSize:14,outline:'none',boxSizing:'border-box' as const,colorScheme:dk?'dark':'light'}} />
              </div>
              <div style={{display:'flex',gap:T.sp2,justifyContent:'flex-end',marginTop:20}}>
                <button onClick={()=>{setShowInspectionModal(false);moveStage('inspection_scheduled' as LeadStatus,true)}}
                  style={{padding:'9px 16px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,cursor:'pointer',fontSize:T.fontBody}}>
                  Skip for now
                </button>
                <button
                  disabled={!inspDate}
                  onClick={async ()=>{
                    setShowInspectionModal(false)
                    if (inspDate) {
                      await patch({ inspection_date: inspDate })
                      setLead(l => l ? { ...l, inspection_date: inspDate } as any : l)
                    }
                    moveStage('inspection_scheduled' as LeadStatus, true)
                  }}
                  style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',background:inspDate?BRAND.teal:'#E2E8F0',color:inspDate?'#fff':'#94A3B8',cursor:inspDate?'pointer':'not-allowed',fontSize:T.fontBody,fontWeight:700}}>
                  Schedule Inspection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Job Modal */}
        {showScheduleModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:T.sp4}}
            onClick={()=>setShowScheduleModal(false)}>
            <div style={{background:card,borderRadius:T.radLg,padding:T.sp6,maxWidth:400,width:'100%',border:`1px solid ${bdr}`}}
              onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:17,fontWeight:800,color:tp,marginBottom:4}}>Schedule Job</div>
              <div style={{fontSize:13,color:tb,marginBottom:20}}>Set the job date to add this to your calendar.</div>
              <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.08em',color:ts,marginBottom:6}}>Job Date</div>
                  <input type="date" value={schedDate} onChange={e=>setSchedDate(e.target.value)}
                    style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${schedDate?BRAND.teal:bdr}`,borderRadius:T.radSm,
                      fontSize:14,outline:'none',boxSizing:'border-box' as const,colorScheme:dk?'dark':'light'}} />
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.08em',color:ts,marginBottom:6}}>Start Time <span style={{fontWeight:400,opacity:0.6}}>(optional)</span></div>
                  <input type="time" value={schedTime} onChange={e=>setSchedTime(e.target.value)}
                    style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${bdr}`,borderRadius:T.radSm,
                      fontSize:14,outline:'none',boxSizing:'border-box' as const,colorScheme:dk?'dark':'light'}} />
                </div>
              </div>
              <div style={{display:'flex',gap:T.sp2,justifyContent:'flex-end',marginTop:20}}>
                <button onClick={()=>setShowScheduleModal(false)}
                  style={{padding:'9px 16px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,cursor:'pointer',fontSize:T.fontBody}}>
                  Cancel
                </button>
                <button
                  disabled={!schedDate}
                  onClick={async ()=>{
                    setShowScheduleModal(false)
                    // Save date+time then move stage
                    if (schedDate) {
                      await patch({ scheduled_date: schedDate, scheduled_time: schedTime||null })
                      setLead(l => l ? { ...l, scheduled_date: schedDate, scheduled_time: schedTime||null } as any : l)
                    }
                    moveStage('scheduled' as LeadStatus, true)
                  }}
                  style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',
                    background:schedDate?BRAND.teal:'#E2E8F0',color:schedDate?'#fff':'#94A3B8',
                    cursor:schedDate?'pointer':'not-allowed',fontSize:T.fontBody,fontWeight:700}}>
                  Schedule Job
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading / not found ──────────────────────────────────────────── */}
        {loading  && <div style={{textAlign:'center',padding:80,color:ts,fontSize:T.fontBody}}>Loading...</div>}
        {missing  && <div style={{textAlign:'center',padding:80,color:ts,fontSize:T.fontBody}}>Lead not found.</div>}

        {!loading&&!missing&&lead&&(()=>{
          const stages   = getPipelineStages(session?.trade_slug)
          const stgObj   = stages.find(s=>s.key===stage)
          const active   = stages.filter(s=>!s.terminal)
          const curPos   = active.findIndex(s=>s.key===stage)
          const anchors2   = getStageAnchors(session?.trade_slug)
          const termKeys   = tradePlugin.stages.filter(s => s.terminal).map(s => s.key)
          const isTerminal = stage === anchors2.won || termKeys.some(k => k === stage)

          // stagesWithTerminal includes Lost/Unqualified so the picker CLOSED group renders them
          const terminalPipelineStages = tradePlugin.stages
            .filter((s: any) => s.terminal)
            .map((s: any) => ({
              key:       s.key      as string,
              label:     s.label    as string,
              color:     (s.color   as string) ?? '#6B7280',
              bg:        (s.bg      as string) ?? '#F3F4F6',
              subLabel:  (s.subLabel  as string | undefined) ?? 'Did not proceed',
              nextLabel: (s.nextLabel as string | undefined) ?? 'Reopen',
              terminal:  true as const,
            }))
          const stagesWithTerminal = [...stages, ...terminalPipelineStages]

          // Stage tips — roofing-specific content gated by isRoofing
          // Generic tip shown for all trades; trade-specific tips only for roofing
          const ROOFING_TIPS:Record<string,string> = {
            lead_in:              'Call within 1 hour — response rate drops 80% after 24hrs.',
            inspection_scheduled: 'Confirm the night before. Bring a moisture meter.',
            proposal_sent:        'Follow up in 48hrs. Most jobs are won on the follow-up.',
            proposal_signed:      'Collect deposit now — 25–33% is standard.',
            insurance_approved:   'Order materials within 24hrs to lock price.',
            scheduled:            'Send reminder to homeowner 48hrs before crew arrives.',
            in_progress:          'Take photos at each phase: decking, install, completion.',
            job_won:              'Request a Google review within 24hrs — 70% response rate.',
          }
          const GENERIC_TIPS:Record<string,string> = {
            [getStageAnchors(session?.trade_slug).entry]: 'Call within 1 hour — response rate drops 80% after 24hrs.',
            [getStageAnchors(session?.trade_slug).won]:   'Request a Google review within 24hrs — 70% response rate.',
          }
          const TIPS = isRoofing ? ROOFING_TIPS : GENERIC_TIPS

          const isRoofingGroups = isRoofing
          const pickerGroups = isRoofingGroups
            ? [
                {label:'SALES',      keys:['lead_in','inspection_scheduled','proposal_sent','proposal_signed']},
                {label:'OPERATIONS', keys:['insurance_approved','scheduled','in_progress']},
                {label:'CLOSED',     keys:['job_won','lost','unqualified']},
              ]
            : [
                {label:'ACTIVE', keys: tradePlugin.stages.filter(s => !s.terminal && s.key !== getStageAnchors(session?.trade_slug).won).map(s => s.key)},
                {label:'CLOSED', keys: [getStageAnchors(session?.trade_slug).won, ...tradePlugin.stages.filter(s => s.terminal).map(s => s.key)]},
              ]

          // ── Identity ────────────────────────────────────────────────────
          const addr        = (lead as any).property_address as string|null|undefined
          const heroLabel   = addr ? addr.replace(/, USA$/,'') : capName(lead.contact_name)
          const heroSub     = addr
            ? [capName(lead.contact_name), lead.contact_phone?fmtPhone(lead.contact_phone):null].filter(Boolean).join(' · ')
            : [lead.contact_phone?fmtPhone(lead.contact_phone):null, lead.contact_email||null].filter(Boolean).join(' · ')

          const tabs: {key:Tab;label:string;icon:React.ReactNode}[] = [
            {key:'details', label:'Job Details', icon:<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>},
            ...(isRoofing?[{key:'photos' as Tab, label:photoCount>0?`Photos (${photoCount})`:'Photos', icon:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>}]:[]),
            {key:'estimate',label:'Estimate',   icon:<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></>},
            {key:'activity',label:acts.length>0?`Activity (${acts.length})`:'Activity', icon:<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>},
          ]

          return (
            <>
              {showWarranty&&isRoofing&&(
                <div style={{
                  position:'fixed', inset:0, zIndex:60,
                  background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)',
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16,
                }} onClick={()=>setShowWarranty(false)}>
                  <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:480 }}>
                    <WarrantyRecord leadId={lead.id} proId={session!.id} propertyId={(lead as any).property_id ?? null} darkMode={dk}
                      onSaved={()=>{setShowWarranty(false);addToast('Warranty recorded')}}
                      onDismiss={()=>setShowWarranty(false)}/>
                  </div>
                </div>
              )}

              {/* back nav */}
              <div style={{marginBottom:T.sp4}}>
                <button onClick={()=>router.push(backNav().href)}
                  style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:T.fontBody,color:ts,background:'none',border:'none',cursor:'pointer',padding:0}}>
                  <Svg size={14} stroke={ts}><polyline points="15 18 9 12 15 6"/></Svg>
                  {backNav().label}
                </button>
              </div>

              {/* ── 2-col grid ─────────────────────────────────────────── */}
              <div style={{maxWidth:1400,margin:'0 auto',width:'100%'}}>
              <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 300px':'1fr',gap:16}}>

                {/* ══ LEFT ══════════════════════════════════════════════ */}
                <div style={{minWidth:0}}>

                  {/* ─── HERO CARD ─────────────────────────────────────── */}
                  <div style={{background:card,borderRadius:T.radLg,marginBottom:12,border:`1px solid ${bdr}`,boxShadow:dk?'none':'0 2px 8px rgba(0,0,0,0.08)',position:'relative'}}>
                    {/* Teal accent bar — stage color top strip, uses borderRadius to match card */}
                    <div style={{height:4,background:`linear-gradient(90deg,${stgObj?.color??BRAND.teal},${stgObj?.color??BRAND.teal}66)`,borderRadius:`${T.radLg} ${T.radLg} 0 0`}}/>

                    {/* Identity row */}
                    <div style={{padding:'20px 24px 16px'}}>
                      <div style={{display:'flex',flexDirection:isWide?'row':'column',alignItems:isWide?'flex-start':'stretch',justifyContent:'space-between',gap:12}}>
                        <div style={{display:'flex',alignItems:'flex-start',gap:14,minWidth:0,flex:1}}>
                          <div style={{width:52,height:52,borderRadius:12,background:avBg,color:avFg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,fontWeight:800,flexShrink:0,letterSpacing:'-0.02em'}}>
                            {initials(lead.contact_name)}
                          </div>
                          <div style={{minWidth:0,flex:1,paddingTop:2}}>
                            <div style={{fontSize:24,fontWeight:800,color:tp,letterSpacing:'-0.03em',lineHeight:1.15,marginBottom:6}}>
                              {heroLabel}
                            </div>
                            <div style={{fontSize:13,color:tsu,lineHeight:1.5}}>
                              {heroSub||'No contact info'}
                            </div>
                            {/* Stage + timestamp inline */}
                            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,flexWrap:'wrap'}}>
                              <span style={{fontSize:13,fontWeight:700,padding:'4px 10px',borderRadius:20,background:stgObj?.color??BRAND.teal,color:'#fff',letterSpacing:'-0.01em'}}>
                                {stgObj?.label??stage}
                              </span>
                              <span style={{fontSize:12,color:tsu}}>
                                {stage==='inspection_scheduled'&&(lead as any)?.inspection_date
                                  ? <><span style={{fontWeight:700,color:'#4F46E5'}}>{'• Inspection '}{fmt((lead as any).inspection_date)}</span></>
                                  : stage==='scheduled'&&lead?.scheduled_date
                                  ? <><span style={{fontWeight:700,color:tp}}>{'• Job '}{fmt(lead.scheduled_date)}</span></>
                                  : <>
                                      {'• since '}{new Date((lead as any).lead_status_changed_at||(est as any)?.approved_at||lead.updated_at||lead.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                                      {' at '}
                                      {new Date((lead as any).lead_status_changed_at||(est as any)?.approved_at||lead.updated_at||lead.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                                    </>}
                              </span>
                              {lead.quoted_amount!=null&&(
                                <span style={{fontSize:14,fontWeight:700,color:BRAND.teal,marginLeft:'auto'}}>
                                  ${Number(lead.quoted_amount).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0,flexWrap:'wrap',justifyContent:isWide?'flex-end':'flex-start',paddingLeft:isWide?0:66}}>
                          {lead.contact_phone&&(
                            <a href={`tel:${lead.contact_phone.replace(/\D/g,'')}`}
                              style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:card,color:tp,fontSize:13,textDecoration:'none',fontWeight:600,whiteSpace:'nowrap'}}>
                              <Svg size={13} stroke={tp}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Svg>
                              Call
                            </a>
                          )}
                          <button onClick={startEdit}
                            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                            <Svg size={13} stroke={ts}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>
                            Edit
                          </button>
                          <button onClick={shareStatus} title="Email homeowner their project status link"
                            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                            <Svg size={13} stroke={ts}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></Svg>
                            Send Status
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ─── Progress bar ───────────────────────────────── */}
                    <div style={{borderTop:`1px solid ${bdr}`,padding:'16px 24px 0px',overflowX:isWide?'visible':'auto',WebkitOverflowScrolling:'touch'}}>
                      <div style={{minWidth:isWide?'auto':active.length*72}}>
                      <div style={{position:'relative',display:'flex',alignItems:'flex-end',height:28}}>
                        {/* Track: grey base + colored progress overlay */}
                        <div style={{position:'absolute',top:5,zIndex:0,left:`${100/active.length/2}%`,right:`${100/active.length/2}%`,height:2,background:dk?'#1E293B':'#E5E7EB',borderRadius:2}}/>
                        {curPos>0&&(
                          <div style={{position:'absolute',top:5,zIndex:0,left:`${100/active.length/2}%`,width:`${(curPos/(active.length-1))*100*(1-1/active.length)}%`,height:2,background:`linear-gradient(to right,${active[0]?.color??BRAND.teal},${stgObj?.color??BRAND.teal})`,borderRadius:2,transition:'width 0.4s ease'}}/>
                        )}
                        {active.map((stg,i)=>{
                          const done  = i<curPos
                          const isAct = i===curPos
                          const skipped = stg.key==='insurance_approved' && !(lead as any).roofing_job_data?.insurance_claim && (done || isAct)
                          const sz    = isAct?22:done?20:12
                          const rad   = done||isAct?'50%':'3px'
                          const bg    = skipped?(dk?'#334155':'#CBD5E1'):done?stg.color:isAct?stg.color:(dk?'#374151':'#E5E7EB')
                          const bdr2  = isAct?`2.5px solid ${card}`:'none'
                          const shd   = isAct?`0 0 0 2.5px ${stg.color},0 2px 8px ${stg.color}40`:done&&!skipped?`0 1px 4px ${stg.color}30`:'none'
                          return (
                            <div key={stg.key} style={{flex:1,display:'flex',justifyContent:'center',position:'relative',zIndex:1}} title={skipped?'Skipped — retail job (no insurance claim)':undefined}>
                              <div style={{width:sz,height:sz,borderRadius:rad,background:bg,border:bdr2,boxShadow:shd,display:'flex',alignItems:'center',justifyContent:'center',opacity:skipped?0.6:1}}>
                                {skipped?<Svg size={9} stroke="#fff" sw={3}><line x1="5" y1="12" x2="19" y2="12"/></Svg>:done&&<Svg size={9} stroke="#fff" sw={3}><polyline points="20 6 9 17 4 12"/></Svg>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Label row — separate, always same height, always aligned under dots */}
                      <div style={{display:'flex',marginTop:6,marginBottom:0}}>
                        {active.map((stg,i)=>{
                          const done  = i<curPos
                          const isAct = i===curPos
                          const skipped = stg.key==='insurance_approved' && !(lead as any).roofing_job_data?.insurance_claim && (done || isAct)
                          const lc    = skipped?(dk?'#475569':'#CBD5E1'):isAct?stg.color:done?(dk?'#4B5563':'#9CA3AF'):(dk?'#374151':'#CBD5E1')
                          return (
                            <div key={stg.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
                              <span style={{fontSize:isAct?11:done?9:9,fontWeight:isAct?800:done?500:400,color:lc,textAlign:'center',lineHeight:1.3,wordBreak:'break-word',maxWidth:'100%',display:'block',padding:'0 2px',textDecoration:skipped?'line-through':'none'}}>
                                {stg.label}
                              </span>
                              {/* Active stage: downward caret pointing to status row below */}
                              {isAct&&(
                                <svg width="10" height="6" viewBox="0 0 10 6" style={{marginTop:4,flexShrink:0}} fill={stg.color}>
                                  <path d="M5 6L0 0h10L5 6z"/>
                                </svg>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      </div>{/* end min-width track */}
                    </div>

                    {/* ─── Status row ─────────────────────────────────── */}
                    <div style={{borderTop:`1px solid ${bdr}`,padding:'16px 24px'}}>
                      <div style={{display:'grid',gridTemplateColumns:isWide?'auto 1fr auto':'1fr',gap:isWide?32:18,alignItems:'start'}}>

                        {/* Left: status picker — compact inline pill */}
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Current Status</div>
                          <div style={{position:'relative',display:'inline-block'}}>
                            <button
                              onClick={()=>{setStageNotice(null);setShowPicker(v=>!v)}}
                              disabled={saving}
                              style={{
                                display:'inline-flex',alignItems:'center',gap:8,
                                padding:'10px 14px',borderRadius:T.radMd,
                                border:'none',
                                background:stgObj?.color??BRAND.teal,
                                cursor:saving?'wait':'pointer',
                                boxShadow:showPicker?`0 0 0 4px ${stgObj?.color??BRAND.teal}30`:`0 2px 8px ${stgObj?.color??BRAND.teal}40`,
                                transition:'box-shadow 0.15s',
                                whiteSpace:'nowrap',
                              }}>
                              <div style={{textAlign:'left'}}>
                                <div style={{fontSize:14,fontWeight:700,color:'#fff',lineHeight:1.2}}>
                                  {saving?'Updating...':(stgObj?.label??stage)}
                                </div>
                                <div style={{fontSize:11,color:'rgba(255,255,255,0.75)',marginTop:1}}>{stgObj?.subLabel}</div>
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{transform:showPicker?'rotate(180deg)':'rotate(0deg)',transition:'transform 0.2s',flexShrink:0}}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>

                            {/* ── Dropdown — position:absolute, attached directly below pill ── */}
                            {showPicker&&(
                              <>
                                <div style={{position:'fixed',inset:0,zIndex:199}} onClick={()=>setShowPicker(false)}/>
                                <div style={{
                                  position:'absolute',
                                  top:'calc(100% + 6px)',
                                  left:0,
                                  zIndex:200,
                                  background:card,
                                  border:`1px solid ${bdr}`,
                                  borderRadius:T.radMd,
                                  boxShadow:'0 12px 40px rgba(0,0,0,0.18)',
                                  minWidth:'100%',
                                  width:300,
                                  overflow:'hidden',
                                }}>
                                  {/* ── CURRENT ── */}
                                  <div style={{padding:'8px 14px 6px',fontSize:10,fontWeight:800,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',background:t.cardBgAlt}}>Current</div>
                                  <div style={{padding:'8px 14px 10px',background:stgObj?.bg??'#F0FDFA',borderBottom:`1px solid ${bdr}`}}>
                                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                                      <div style={{width:20,height:20,borderRadius:'50%',background:stgObj?.color??BRAND.teal,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                        <Svg size={11} stroke="#fff" sw={2.5}><polyline points="20 6 9 17 4 12"/></Svg>
                                      </div>
                                      <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:14,fontWeight:700,color:stgObj?.color??BRAND.teal,lineHeight:1.2}}>{stgObj?.label??stage}</div>
                                        <div style={{fontSize:11,color:tsu,marginTop:1}}>{stgObj?.subLabel}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* ── CHANGE TO ── */}
                                  <div style={{padding:'8px 14px 4px',fontSize:10,fontWeight:800,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',background:t.cardBgAlt,borderBottom:`1px solid ${bdr}`}}>Change To</div>
                                  {pickerGroups.map((grp,gi)=>{
                                    const gStages=stagesWithTerminal.filter(s=>grp.keys.includes(s.key)&&s.key!==stage)
                                    if(!gStages.length) return null
                                    return (
                                      <div key={grp.label}>
                                        {/* Group label */}
                                        <div style={{padding:'7px 14px 2px',fontSize:9,fontWeight:800,color:tsu,textTransform:'uppercase',letterSpacing:'0.08em'}}>{grp.label}</div>
                                        {gStages.map(stg=>{
                                          const dc=stg.terminal?t.accentRed:stg.color
                                          return (
                                            <button key={stg.key}
                                              onClick={()=>{setShowPicker(false);moveStage(stg.key as LeadStatus)}}
                                              style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'7px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}
                                              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background=dk?'#1F2937':'#F8FAFC'}}
                                              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}}>
                                              {/* Small icon — no circle background, just the icon */}
                                              <div style={{width:32,height:32,borderRadius:8,background:dc+'14',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                                <StageIcon k={stg.key} color={dc} size={22}/>
                                              </div>
                                              <div style={{flex:1,minWidth:0}}>
                                                <div style={{fontSize:13,fontWeight:500,color:tp,lineHeight:1.2}}>{stg.label}</div>
                                                <div style={{fontSize:11,color:tsu,marginTop:1}}>{stg.subLabel}</div>
                                              </div>
                                            </button>
                                          )
                                        })}
                                        {gi<pickerGroups.length-1&&<div style={{height:1,background:bdr,margin:'4px 0'}}/>}
                                      </div>
                                    )
                                  })}
                                  <div style={{height:8}}/>
                                </div>
                              </>
                            )}

                            {stageNotice&&(()=>{
                              const isWarn = stageNotice.kind==='warning'
                              const accent = isWarn ? '#D97706' : BRAND.teal
                              const title  = isWarn ? 'Action needed' : 'Information'
                              return (
                                <>
                                  <div style={{position:'fixed',inset:0,zIndex:199}} onClick={()=>setStageNotice(null)}/>
                                  <div style={{position:'absolute',top:'calc(100% + 8px)',left:0,zIndex:200,width:330,maxWidth:'90vw',background:card,border:`1px solid ${bdr}`,borderLeft:`4px solid ${accent}`,borderRadius:14,boxShadow:dk?'0 18px 44px rgba(0,0,0,0.55)':'0 18px 44px rgba(15,23,42,0.20)',padding:'15px 16px'}}>
                                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:9}}>
                                      <div style={{width:30,height:30,borderRadius:9,background:accent+'1A',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                          {isWarn
                                            ? <><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>
                                            : <><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>}
                                        </svg>
                                      </div>
                                      <div style={{fontSize:13.5,fontWeight:800,color:accent}}>{title}</div>
                                    </div>
                                    <div style={{fontSize:13.5,fontWeight:500,color:tp,lineHeight:1.45,marginBottom:14}}>{stageNotice.msg}</div>
                                    <div style={{display:'flex',justifyContent:'flex-end'}}>
                                      <button onClick={()=>setStageNotice(null)} style={{padding:'8px 20px',borderRadius:9,border:'none',background:accent,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Got it</button>
                                    </div>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </div>

                        {/* Middle: status since — flat */}
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Status Since</div>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{width:34,height:34,borderRadius:9,background:t.cardBgAlt,border:`1px solid ${bdr}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              <Svg size={16} stroke={ts}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Svg>
                            </div>
                            <div>
                              <div style={{fontSize:14,fontWeight:600,color:tp}}>
                                {new Date((lead as any).lead_status_changed_at||lead.updated_at||lead.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                              </div>
                              <div style={{fontSize:12,color:tsu,marginTop:1}}>
                                {daysAgo((lead as any).lead_status_changed_at||lead.updated_at||lead.created_at)===0?'Today':`${daysAgo((lead as any).lead_status_changed_at||lead.updated_at||lead.created_at)} days in stage`}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: owner */}
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Owner</div>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{width:32,height:32,borderRadius:'50%',background:avBg,color:avFg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>
                              {initials(session?.name||'SA')}
                            </div>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:tp}}>{session?.name||'Pro'}</div>
                              <div style={{fontSize:11,color:tsu,marginTop:1,textTransform:'capitalize'}}>{session?.trade||'Roofer'}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stage tip — amber card */}
                      {TIPS[stage]&&(
                        <div style={{marginTop:14,padding:'10px 14px',borderRadius:T.radMd,background:'#FFFBEB',border:'1px solid #FDE68A',display:'flex',alignItems:'flex-start',gap:8}}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}>
                            <path d="M12 3a6 6 0 00-6 6c0 3 1.5 5 3 7h6c1.5-2 3-4 3-7a6 6 0 00-6-6z"/>
                            <line x1="8.5" y1="19" x2="15.5" y2="19"/><line x1="9" y1="22" x2="15" y2="22"/>
                          </svg>
                          <span style={{fontSize:12,fontWeight:500,color:'#92400E',lineHeight:1.5}}>{TIPS[stage]}</span>
                        </div>
                      )}
                      {isTerminal&&(
                        <div style={{marginTop:12,padding:'10px 14px',borderRadius:T.radSm,textAlign:'center',background:stage===getStageAnchors(session?.trade_slug).won?'linear-gradient(135deg,#065F46,#047857)':t.cardBgAlt,color:stage===getStageAnchors(session?.trade_slug).won?'#fff':ts,fontSize:14,fontWeight:700}}>
                          {stage===getStageAnchors(session?.trade_slug).won?'🏆 Job Complete':stage===getStageAnchors(session?.trade_slug).lost?'Job Lost':'Lead Unqualified'}
                        </div>
                      )}
                      {stage===getStageAnchors(session?.trade_slug).won&&isRoofing&&(
                        <button onClick={()=>setShowWarranty(true)} style={{marginTop:8,width:'100%',padding:'10px 14px',borderRadius:T.radSm,background:t.cardBgAlt,color:BRAND.teal,border:`1px solid ${BRAND.teal}`,fontSize:13,fontWeight:700,cursor:'pointer'}}>+ Record Warranty</button>
                      )}
                    </div>
                  </div>{/* end hero */}

                  {/* ─── TABS CARD ───────────────────────────────────────── */}
                  <div style={{background:card,borderRadius:T.radLg,border:`1px solid ${bdr}`,overflow:'hidden',boxShadow:dk?'none':'0 1px 4px rgba(0,0,0,0.05)'}}>

                    {/* Tab strip — underline style, clean */}
                    <div style={{display:'flex',borderBottom:`1px solid ${bdr}`,paddingLeft:4,paddingRight:4,overflowX:isWide?'visible':'auto',WebkitOverflowScrolling:'touch'}}>
                      {tabs.map(tb2=>{
                        const isAct=tab===tb2.key
                        return (
                          <button key={tb2.key}
                            onClick={()=>{setTab(tb2.key);if(isEditing&&tb2.key!=='details')setIsEditing(false)}}
                            style={{
                              display:'flex',alignItems:'center',gap:6,
                              padding:'11px 14px 10px',
                              border:'none',
                              borderBottom:isAct?`2.5px solid ${BRAND.teal}`:'2.5px solid transparent',
                              background:isAct?(dk?'rgba(20,184,166,0.08)':'rgba(15,118,110,0.05)'):'transparent',
                              cursor:'pointer',
                              color:isAct?BRAND.teal:ts,
                              fontWeight:isAct?800:500,
                              fontSize:13,whiteSpace:'nowrap',
                              marginBottom:-1,
                              transition:'all 0.15s',
                            }}>
                            <Svg size={13} stroke={isAct?BRAND.teal:tsu}>{tb2.icon}</Svg>
                            {tb2.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* ── Details tab ──────────────────────────────────── */}
                    {tab==='details'&&(
                      <div style={{padding:'18px 20px'}}>
                        {!isEditing&&(
                          <>
                            {/* Fields grid — teal icon circles */}
                            <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 1fr':'1fr',gap:1,background:bdr,border:`1px solid ${bdr}`,borderRadius:T.radMd,overflow:'hidden',marginBottom:16}}>
                              {([
                                {label:'Phone',    color:'#0F766E', icon:<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>, val:fmtPhone(lead.contact_phone), copy:lead.contact_phone},
                                {label:'Email',    color:'#0F766E', icon:<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>, val:lead.contact_email||'—', copy:lead.contact_email},
                                {label:'Address',  color:'#0F766E', icon:<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>, val:<span style={{display:'flex',flexDirection:'column',gap:3}}><span>{(lead as any).property_address||[lead.contact_city,lead.contact_state].filter(Boolean).join(', ')||'—'}</span>{!lead.client_id&&lead.contact_name&&<button onClick={async(e)=>{e.stopPropagation();if(!session)return;const r=await fetch('/api/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,full_name:lead.contact_name,phone:lead.contact_phone||null,email:lead.contact_email||null,address_line1:((lead as any).property_address||'').split(',')[0]?.trim()||null,city:lead.contact_city||null,state:lead.contact_state||null})});const d=await r.json();if(d.client?.id){await fetch('/api/leads/'+lead.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,client_id:d.client.id})});setLead(l=>l?{...l,client_id:d.client.id}:l);addToast('Saved as property','success')}}} style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'#F0FDFA',color:'#0F766E',border:'1px solid #CCFBF1',cursor:'pointer',alignSelf:'flex-start'}}>+ Save as Property</button>}{lead.client_id&&<button onClick={e=>{e.stopPropagation();router.push('/dashboard/clients/'+lead.client_id)}} style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'#F0FDFA',color:'#0F766E',border:'1px solid #CCFBF1',cursor:'pointer',alignSelf:'flex-start'}}>View Property →</button>}</span>, copy:null},
                                {label:'Source',   color:'#64748B', icon:<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>, val:(lead.lead_source||'—').replace(/_/g,' '), copy:null},
                                {label:'Inspection',color:'#4F46E5', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></>, val:fmt((lead as any).inspection_date), copy:null},
                                {label:'Job Date', color:'#64748B', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>, val:fmt(lead.scheduled_date), copy:null},
                                {label:'Follow-up',color:'#64748B', icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, val:lead.follow_up_date
                                  ?<span style={{display:'flex',alignItems:'center',gap:5}}>{fmt(lead.follow_up_date)}{isOverdue(lead.follow_up_date)&&<span style={{fontSize:11,padding:'1px 6px',borderRadius:20,background:t.dangerBg,color:'#A32D2D',fontWeight:600}}>Overdue</span>}</span>
                                  :'—', copy:null},
                              ] as {label:string;color:string;icon:React.ReactNode;val:React.ReactNode;copy:string|null}[]).map((cell,ci)=>(
                                <div key={cell.label} style={{padding:'16px 18px',background:card,display:'flex',alignItems:'flex-start',gap:13}}>
                                  {/* Icon circle */}
                                  <div style={{width:36,height:36,borderRadius:9,background:cell.color+'12',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cell.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{cell.icon}</svg>
                                  </div>
                                  <div style={{minWidth:0,flex:1}}>
                                    <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{cell.label}</div>
                                    <div style={{fontSize:14,fontWeight:600,color:tp,display:'flex',alignItems:'center',gap:4,wordBreak:'break-word',lineHeight:1.4}}>
                                      {cell.val}
                                      {cell.copy&&cell.val!=='—'&&<CopyBtn text={cell.copy} color={ts}/>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {isRoofing&&(
                              <InsuranceClaimFields key={(lead as any).roofing_job_data?.claim_number ?? lead.id} leadId={lead.id} proId={session!.id} initial={(lead as any).roofing_job_data??{}} darkMode={dk} propertyState={lead.contact_state} locked={stage==='job_won'||stage==='lost'}
                                onSaved={(data)=>{
                                  // Optimistic update first so UI feels instant
                                  setLead(l=>l?{...l,roofing_job_data:{...((l as any).roofing_job_data??{}),...data}} as any:l)
                                  // Re-fetch after a short delay to pick up any hook side-effects
                                  // (stage auto-advance, activity events) without requiring a manual refresh
                                  setTimeout(()=>{
                                    fetch(`/api/leads/${lead.id}?pro_id=${session!.id}`)
                                      .then(r=>r.json())
                                      .then(d=>{
                                        if(d?.lead){
                                          setLead(d.lead as LeadExt)
                                          setStage((d.lead as LeadExt).lead_status as LeadStatus)
                                        }
                                      }).catch(()=>{})
                                    refreshEvents()   // also refresh Activity tab
                                  }, 400)
                                }}/>
                            )}

                            {isRoofing&&(lead as any).roofing_job_data?.insurance_claim&&(lead as any).roofing_job_data?.claim_status==='Denied'&&(
                              <div style={{marginTop:12,padding:'14px 16px',borderRadius:12,background:dk?'rgba(220,38,38,0.10)':'#FEF2F2',border:'1px solid #FECACA'}}>
                                <div style={{fontSize:13,fontWeight:800,color:'#DC2626',marginBottom:4}}>Insurance claim denied</div>
                                <div style={{fontSize:12,color:dk?'#FCA5A5':'#991B1B',lineHeight:1.5,marginBottom:12}}>This claim can&apos;t proceed on the insurance track. Convert to a retail job so the homeowner pays the full cost{stage==='insurance_approved'?' — this moves the lead back to Inspection Scheduled':''}, or mark the lead lost. Claim details are preserved either way in case of an appeal.</div>
                                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                                  <button onClick={async()=>{const inApproved=stage==='insurance_approved';const ok=await patch(inApproved?{insurance_claim:false,lead_status:'inspection_scheduled'}:{insurance_claim:false});if(ok){setLead(l=>l?{...l,lead_status:inApproved?('inspection_scheduled' as LeadStatus):l.lead_status,roofing_job_data:{...((l as any).roofing_job_data??{}),insurance_claim:false}} as any:l);if(inApproved)setStage('inspection_scheduled' as LeadStatus);addToast(inApproved?'Converted to retail — moved to Inspection Scheduled':'Converted to retail — homeowner pays full cost','success')}else{addToast('Failed to convert','error')}}}
                                    style={{padding:'8px 14px',borderRadius:8,border:'none',background:BRAND.teal,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Convert to Retail</button>
                                  <button onClick={()=>moveStage('lost' as LeadStatus)}
                                    style={{padding:'8px 14px',borderRadius:8,border:`1px solid ${dk?'#475569':'#CBD5E1'}`,background:'transparent',color:dk?'#E2E8F0':'#475569',fontSize:12,fontWeight:700,cursor:'pointer'}}>Mark Lost</button>
                                </div>
                              </div>
                            )}

                            {/* FL Supplement Assistant — only for FL insurance claims */}
                            {isRoofing&&(lead as any).roofing_job_data?.insurance_claim&&(
                              <div style={{marginTop:16}}>
                                <SupplementAssistant leadId={lead.id} proId={session!.id} propertyState={lead.contact_state} hasClaim={!!(lead as any).roofing_job_data?.insurance_claim} darkMode={dk}/>
                              </div>
                            )}

                            {/* Roofing measurement tools — 3-step flow */}
                            {isRoofing&&(
                              <div style={{marginTop:16,borderRadius:12,background:'#fff',border:'1px solid #E2E8F0',borderLeft:'4px solid #0F766E',overflow:'hidden'}}>
                                {(()=>{
                                  const rjd  = (lead as any)?.roofing_job_data
                                  const sq   = rjd?.square_count
                                  const pitch= rjd?.pitch
                                  const waste= rjd?.waste_pct
                                  const lf   = rjd?.linear_footage as any
                                  const hasLF= !!(lf?.ridge_ft)

                                  // ── Step states ──
                                  const step1Done = !!sq
                                  const step2Done = step1Done && hasLF
                                  const step2Running = step1Done && !hasLF && dsmRunning

                                  const stepIcon = (done:boolean, running:boolean, n:number) => {
                                    if (done) return (
                                      <div style={{width:24,height:24,borderRadius:'50%',background:'#059669',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      </div>
                                    )
                                    if (running) return (
                                      <div style={{width:24,height:24,borderRadius:'50%',border:'2.5px solid #0F766E',borderTopColor:'transparent',animation:'pg-spin 0.8s linear infinite',flexShrink:0}}/>
                                    )
                                    return (
                                      <div style={{width:24,height:24,borderRadius:'50%',background:'#F1F5F9',border:'1.5px solid #CBD5E1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,fontWeight:700,color:'#94A3B8'}}>{n}</div>
                                    )
                                  }

                                  return (
                                    <div>
                                      <div style={{padding:16,opacity:qbGenerating?0.5:1,pointerEvents:qbGenerating?'none' as const:'auto'}}>
                                      {/* Header */}
                                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                                        <span style={{fontSize:12,fontWeight:800,color:'#0F172A',textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>Roof Measurements</span>
                                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                                          {(lead as any).property_id && (
                                            <button onClick={()=>router.push(`/dashboard/roofing/property/${(lead as any).property_id}`)}
                                              style={{fontSize:12,color:'#0F766E',background:'transparent',border:'1.5px solid rgba(15,118,110,0.25)',borderRadius:6,cursor:'pointer',fontWeight:700,padding:'4px 10px',transition:'all 0.15s'}}>
                                              View property →
                                            </button>
                                          )}
                                          {step1Done && !qbGenerating && (
                                            <button onClick={()=>{setShowRemeasure(s=>!s);setQbError('')}}
                                              style={{fontSize:12,color:'#0F766E',background:'rgba(15,118,110,0.07)',border:'1.5px solid rgba(15,118,110,0.25)',borderRadius:6,cursor:'pointer',fontWeight:700,padding:'4px 10px',transition:'all 0.15s'}}>
                                              {showRemeasure?'Cancel ↩':'Re-measure ↻'}
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Retail fast-path — Quick Bid (only when not an insurance claim) */}
                                      {!rjd?.insurance_claim && (
                                        <button
                                          onClick={()=>{
                                            const street=((lead as any).property_address||'').replace(/, USA$/,'').trim()
                                            const params=new URLSearchParams()
                                            if(street) params.set('address', street)
                                            if(lead.contact_city)  params.set('city',  lead.contact_city)
                                            if(lead.contact_state)  params.set('state', lead.contact_state)
                                            if((lead as any).contact_zip) params.set('zip', (lead as any).contact_zip)
                                            if(lead.contact_name)  params.set('from',  lead.contact_name)
                                            if((lead as any).property_id) params.set('property_id', (lead as any).property_id)
                                            router.push(`/dashboard/roofing/quickbid?${params.toString()}`)
                                          }}
                                          style={{width:'100%',marginBottom:12,padding:'11px',borderRadius:10,border:'1.5px solid #0F766E',background:'rgba(15,118,110,0.06)',color:'#0F766E',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
                                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                          Quick Bid PDF — instant satellite estimate
                                        </button>
                                      )}

                                      {/* Step 1 — Roof Size */}
                                      <div style={{marginBottom:10,padding:'12px 14px',borderRadius:10,background:step1Done?'#F0FDF4':'#F8FAFC',border:`1.5px solid ${step1Done?'#BBF7D0':'#E2E8F0'}`}}>
                                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:step1Done?10:0}}>
                                          {stepIcon(step1Done, qbGenerating&&!step1Done, 1)}
                                          <div style={{flex:1}}>
                                            <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Roof Size</div>
                                            <div style={{fontSize:12,color:'#64748B',marginTop:2}}>
                                              {step1Done ? `${sq} sq · ${pitch} pitch · ${waste}% waste`
                                                : qbGenerating ? 'Measuring roof from satellite… (~30s)'
                                                : 'Satellite measures your roof in ~30 seconds'}
                                            </div>
                                            {step1Done && (lead as any)?.roofing_job_data?.report_url && (
                                              <a href={(lead as any).roofing_job_data.report_url} target="_blank" rel="noopener noreferrer"
                                                style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:12,fontWeight:700,color:'#0F766E',textDecoration:'none'}}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                View report PDF
                                              </a>
                                            )}
                                          </div>
                                          {!step1Done && !qbGenerating && !showRemeasure && (
                                            <button
                                              onClick={async ()=>{
                                                const street=((lead as any).property_address||'').replace(/, USA$/,'').trim()
                                                const city=lead.contact_city||''; const st=lead.contact_state||''; const zip=(lead as any).contact_zip||''
                                                const fullAddr=[street,city,st,zip].filter(Boolean).join(', ')
                                                if(!street){addToast('Add a property address first','error');return}
                                                if(!session)return
                                                setQbGenerating(true);setQbDone(false);setQbError('')
                                                try{
                                                  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),90000)
                                                  let res:Response
                                                  try{
                                                    res=await fetch('/api/roofing/report',{method:'POST',headers:{'Content-Type':'application/json'},
                                                      body:JSON.stringify({address:fullAddr,pro_id:session.id,
                                                        property_id:await(async()=>{try{const sr=await fetch(`/api/properties?pro_id=${session.id}&search=${encodeURIComponent(street.split(",")[0])}`);const sd=sr.ok?await sr.json():null;const match=(sd?.properties||[]).find((p:any)=>p.address_line1?.toLowerCase().includes(street.split(',')[0].toLowerCase()));return match?.id??null}catch{return null}})()
                                                      }),signal:ctrl.signal})
                                                  }finally{clearTimeout(timer)}
                                                  const d=await res.json().catch(()=>({}))
                                                  if(!res.ok){setQbError((d as any).error||'Report failed');return}
                                                  const meas=(d as any).measurements
                                                  const geocodedAddr=(d as any)?.debug?.formattedAddress?String((d as any).debug.formattedAddress).replace(', USA',''):fullAddr
                                                  if(meas){
                                                    const payload:Record<string,unknown>={squares:Number(meas.totalSquaresOrder)||0,pitch:meas.dominantPitch??'4/12',waste:Number(meas.wasteFactor)||12,source:'roof_report',address:geocodedAddr,storedAt:Date.now(),leadId:lead.id,ridgeLF:0,eaveLF:0,perimLF:0}
                                                    try{sessionStorage.setItem('pg_report_data',JSON.stringify(payload));sessionStorage.setItem('pg_promeasure',JSON.stringify(payload))}catch{}
                                                    const rowId=(d as any).reportRowId
                                                    if(rowId)setReportRowId(rowId)
                                                    fetch(`/api/leads/${lead.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,square_count:Number(meas.totalSquaresOrder)||null,pitch:meas.dominantPitch??null,waste_pct:Number(meas.wasteFactor)||null})})
                                                      .then(r=>r.ok?r.json():null).then(d=>{if(d?.lead)setLead(d.lead)}).catch(()=>{})
                                                  }
                                                  setQbDone(true);setShowRemeasure(false)
                                                }catch(err:unknown){
                                                  const isAbort=err instanceof Error&&err.name==='AbortError'
                                                  setQbError(isAbort?'Timed out — try again':'Network error')
                                                }finally{setQbGenerating(false)}
                                              }}
                                              style={{padding:'7px 14px',borderRadius:8,border:'none',background:'#0F766E',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' as const,flexShrink:0}}>
                                              Measure Roof
                                            </button>
                                          )}
                                        </div>
                                        {/* ProMeasure alternative — shown when unmeasured */}
                                        {!step1Done && !qbGenerating && (
                                          <div style={{marginTop:8,fontSize:11,color:'#94A3B8'}}>
                                            Prefer to draw manually?{' '}
                                            <span onClick={()=>{const street=((lead as any).property_address||'').replace(/, USA$/,'').trim();const city=lead.contact_city||'';const st=lead.contact_state||'';const zip=(lead as any).contact_zip||'';const fullAddr=[street,city,st,zip].filter(Boolean).join(', ')||((lead as any).property_address||'');router.push(fullAddr?`/dashboard/roofing/promeasure?lead_id=${lead.id}&address=${encodeURIComponent(fullAddr)}`:`/dashboard/roofing/promeasure?lead_id=${lead.id}`)}}
                                              style={{color:'#0F766E',fontWeight:700,cursor:'pointer',textDecoration:'underline'}}>Use ProMeasure</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Step 2 — Linear Footage */}
                                      <div style={{marginBottom:10,padding:'12px 14px',borderRadius:10,background:step2Done?'#F0FDF4':step2Running?'#FFFBEB':'#F8FAFC',border:`1.5px solid ${step2Done?'#BBF7D0':step2Running?'#FDE68A':'#E2E8F0'}`,opacity:step1Done?1:0.5}}>
                                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:step2Done?10:0}}>
                                          {stepIcon(step2Done, step2Running, 2)}
                                          <div style={{flex:1}}>
                                            <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Full Material Quantities</div>
                                            <div style={{fontSize:12,color:'#64748B',marginTop:2}}>
                                              {step2Done ? `Ridge ${Math.round(lf.ridge_ft)}ft · Hip ${Math.round(lf.hip_ft||0)}ft · Valley ${Math.round(lf.valley_ft||0)}ft · Rake ${Math.round(lf.rake_ft||0)}ft · Eave ${Math.round(lf.eave_ft||0)}ft`
                                                : step2Running ? 'Getting ridge, hip, valley, rake & eave lengths… (~30s)'
                                                : step1Done ? 'Ridge, hip, valley, rake & eave — needed to order materials precisely'
                                                : 'Runs after Step 1 — measure the roof first'}
                                            </div>
                                          </div>
                                        </div>
                                        {/* Full Material Quantities — Pro gate */}
                                        {step1Done && !step2Done && !step2Running && (
                                          isPro ? (
                                          <button
                                            onClick={async ()=>{
                                              if(!session)return
                                              setDsmRunning(true)
                                              try{
                                                const propId = (lead as any).property_id
                                                // Fetch reports for this property
                                                const rRes = await fetch(`/api/roofing/reports?pro_id=${session.id}${propId?`&property_id=${propId}`:''}`)
                                                const rData = rRes.ok ? await rRes.json() : null
                                                const reports = rData?.reports || []
                                                // Find best report: prefer one with LF already calculated
                                                const sq = (lead as any)?.roofing_job_data?.square_count
                                                const withLF = reports.find((r:any) => r.linear_footage?.ridge_ft)
                                                const sqMatch = sq ? reports.find((r:any) => Math.abs((r.total_squares_order||0)-sq)<1) : null
                                                const best = withLF ?? sqMatch ?? (reportRowId ? reports.find((r:any)=>r.id===reportRowId) : null) ?? reports[0]
                                                if(!best){addToast('Measure the roof first','error');setDsmRunning(false);return}
                                                if(best.linear_footage?.ridge_ft){
                                                  // LF already in report — just refresh lead (GET reads LF from roof_reports)
                                                  const lRes = await fetch(`/api/leads/${lead.id}?pro_id=${session.id}`)
                                                  const lData = lRes.ok ? await lRes.json() : null
                                                  if(lData?.lead) setLead(lData.lead)
                                                  addToast('Material lines loaded','success')
                                                } else {
                                                  // LF not calculated yet — trigger DSM, then refresh lead
                                                  const dsmRes = await fetch('/api/roofing/dsm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({report_id:best.id,pro_id:session.id})})
                                                  if(dsmRes.ok){
                                                    const lRes = await fetch(`/api/leads/${lead.id}?pro_id=${session.id}`)
                                                    const lData = lRes.ok ? await lRes.json() : null
                                                    if(lData?.lead) setLead(lData.lead)
                                                    addToast('Material lines calculated','success')
                                                  } else {
                                                    addToast('Could not calculate — try New Measurement','error')
                                                  }
                                                }
                                              }catch{addToast('Failed — try again','error')}
                                              finally{setDsmRunning(false)}
                                            }}
                                            style={{marginTop:8,width:'100%',padding:'9px',borderRadius:8,border:'none',background:'#0F766E',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                            Get Material Lines
                                          </button>
                                          ) : (
                                            <div style={{marginTop:8,padding:'10px 12px',borderRadius:8,background:'#F8FAFC',border:'1.5px solid #E2E8F0',display:'flex',alignItems:'center',gap:10}}>
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                              <div style={{flex:1}}>
                                                <div style={{fontSize:12,fontWeight:700,color:'#475569'}}>Pro feature — precise material quantities</div>
                                                <div style={{fontSize:11,color:'#94A3B8',marginTop:1}}>Upgrade to Pro to get ridge, hip, valley, rake & eave for material ordering</div>
                                              </div>
                                              <button onClick={()=>window.open('/dashboard/settings?upgrade=1','_self')} style={{padding:'6px 12px',borderRadius:7,border:'none',background:'#0F766E',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' as const,flexShrink:0}}>
                                                Upgrade
                                              </button>
                                            </div>
                                          )
                                        )}

                                        {step2Done && (
                                          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6}}>
                                            {[
                                              {label:'Ridge',  val:lf.ridge_ft,  color:'#7C3AED',bg:'#F5F3FF',border:'#DDD6FE'},
                                              {label:'Hip',    val:lf.hip_ft,    color:'#0891B2',bg:'#E0F2FE',border:'#BAE6FD'},
                                              {label:'Valley', val:lf.valley_ft, color:'#EA580C',bg:'#FFF7ED',border:'#FED7AA'},
                                              {label:'Rake',   val:lf.rake_ft,   color:'#B45309',bg:'#FFFBEB',border:'#FDE68A'},
                                              {label:'Eave',   val:lf.eave_ft,   color:'#059669',bg:'#F0FDF4',border:'#BBF7D0'},
                                            ].map(m=>(
                                              <div key={m.label} style={{padding:'8px 6px',borderRadius:8,background:m.bg,border:`1.5px solid ${m.border}`,textAlign:'center' as const}}>
                                                <div style={{fontSize:15,fontWeight:800,color:m.color,letterSpacing:'-0.02em',lineHeight:1}}>{Math.round(m.val||0)}<span style={{fontSize:10,fontWeight:600}}> ft</span></div>
                                                <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginTop:4}}>{m.label}</div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {/* Step 3 — Open Calculator */}
                                      <div style={{padding:'12px 14px',borderRadius:10,background:step2Done?`linear-gradient(135deg,#0F766E,#14B8A6)`:'#F8FAFC',border:`1.5px solid ${step2Done?'transparent':'#E2E8F0'}`,opacity:step2Done?1:0.5,cursor:step2Done?'pointer':'default'}}
                                        onClick={()=>{
                                          if(!step2Done)return
                                          try{
                                            const payload={squares:Number(sq)||0,pitch:pitch??'6/12',waste:Number(waste)||12,source:'roof_report',address:(lead as any).property_address||'',storedAt:Date.now(),leadId:lead.id,
                                              ...(lf?.ridge_ft?{ridgeLF:Math.round(lf.ridge_ft||0),eaveLF:Math.round(lf.eave_ft||0),perimLF:Math.round((lf.eave_ft||0)+(lf.rake_ft||0)),hipLF:Math.round(lf.hip_ft||0),valleyLF:Math.round(lf.valley_ft||0),rakeLF:Math.round(lf.rake_ft||0)}:{})}
                                            sessionStorage.setItem('pg_report_data',JSON.stringify(payload));sessionStorage.setItem('pg_promeasure',JSON.stringify(payload))
                                          }catch{}
                                          router.push(`/dashboard/roofing/calculator?lead_id=${lead.id}`)
                                        }}>
                                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                                          {step2Done
                                            ? <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>
                                              </div>
                                            : <div style={{width:24,height:24,borderRadius:'50%',background:'#F1F5F9',border:'1.5px solid #CBD5E1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,fontWeight:700,color:'#94A3B8'}}>3</div>
                                          }
                                          <div>
                                            <div style={{fontSize:14,fontWeight:700,color:step2Done?'#fff':'#0F172A'}}>Price This Job</div>
                                            <div style={{fontSize:12,color:step2Done?'rgba(255,255,255,0.8)':'#64748B',marginTop:2}}>
                                              {step2Done?'Squares + all material lines loaded — ready to price':'Complete Steps 1 & 2 first'}
                                            </div>
                                          </div>
                                          {step2Done && (
                                            <svg style={{marginLeft:'auto'}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                                          )}
                                        </div>
                                      </div>

                                      {/* Re-measure option — shown when measured */}
                                      {(showRemeasure) && (
                                        <div style={{marginTop:10,display:'grid',gridTemplateColumns:isWide?'1fr 1fr':'1fr',gap:8}}>
                                          <button
                                            disabled={qbGenerating}
                                            onClick={()=>{const street=((lead as any).property_address||'').replace(/, USA$/,'').trim();const city=lead.contact_city||'';const st=lead.contact_state||'';const zip=(lead as any).contact_zip||'';const fullAddr=[street,city,st,zip].filter(Boolean).join(', ')||((lead as any).property_address||'');router.push(fullAddr?`/dashboard/roofing/promeasure?lead_id=${lead.id}&address=${encodeURIComponent(fullAddr)}`:`/dashboard/roofing/promeasure?lead_id=${lead.id}`)}}
                                            style={{padding:'9px',borderRadius:8,border:`1.5px solid #0F766E`,background:'transparent',color:'#0F766E',fontSize:12,fontWeight:700,cursor:qbGenerating?'not-allowed':'pointer',opacity:qbGenerating?0.4:1,display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                            ProMeasure
                                          </button>
                                          <button
                                            disabled={qbGenerating}
                                            onClick={async ()=>{
                                              const street=((lead as any).property_address||'').replace(/, USA$/,'').trim()
                                              const city=lead.contact_city||'';const st=lead.contact_state||'';const zip=(lead as any).contact_zip||''
                                              const fullAddr=[street,city,st,zip].filter(Boolean).join(', ')
                                              if(!street){addToast('Add a property address first','error');return}
                                              if(!session)return
                                              setQbGenerating(true);setQbDone(false);setQbError('')
                                              try{
                                                const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),90000)
                                                let res:Response
                                                try{res=await fetch('/api/roofing/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:fullAddr,pro_id:session.id,property_id:await(async()=>{try{const sr=await fetch(`/api/properties?pro_id=${session.id}&search=${encodeURIComponent(street.split(",")[0])}`);const sd=sr.ok?await sr.json():null;const match=(sd?.properties||[]).find((p:any)=>p.address_line1?.toLowerCase().includes(street.split(',')[0].toLowerCase()));return match?.id??null}catch{return null}})()}),signal:ctrl.signal})}finally{clearTimeout(timer)}
                                                const d=await res.json().catch(()=>({}))
                                                if(!res.ok){setQbError((d as any).error||'Report failed');return}
                                                const meas=(d as any).measurements
                                                if(meas){
                                                  const payload:Record<string,unknown>={squares:Number(meas.totalSquaresOrder)||0,pitch:meas.dominantPitch??'4/12',waste:Number(meas.wasteFactor)||12,source:'roof_report',address:fullAddr,storedAt:Date.now(),leadId:lead.id,ridgeLF:0,eaveLF:0,perimLF:0}
                                                  try{sessionStorage.setItem('pg_report_data',JSON.stringify(payload));sessionStorage.setItem('pg_promeasure',JSON.stringify(payload))}catch{}
                                                  const rowId=(d as any).reportRowId
                                                  if(rowId&&session){
                                                    fetch('/api/roofing/dsm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({report_id:rowId,pro_id:session.id})})
                                                      .then(r=>r.ok?r.json():null)
                                                      .then(dsmData=>{
                                                        if(dsmData?.linear_footage){const lf=dsmData.linear_footage;try{const raw=sessionStorage.getItem('pg_report_data');if(raw){const ex=JSON.parse(raw);sessionStorage.setItem('pg_report_data',JSON.stringify({...ex,ridgeLF:Math.round(lf.ridge_ft||0),eaveLF:Math.round(lf.eave_ft||0),perimLF:Math.round((lf.eave_ft||0)+(lf.rake_ft||0)),hipLF:Math.round(lf.hip_ft||0),valleyLF:Math.round(lf.valley_ft||0),rakeLF:Math.round(lf.rake_ft||0)}))}}catch{};fetch(`/api/leads/${lead.id}?pro_id=${session.id}`).then(r=>r.ok?r.json():null).then(d=>{if(d?.lead)setLead(d.lead)}).catch(()=>{})}
                                                      }).catch(()=>{})
                                                  }
                                                  fetch(`/api/leads/${lead.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,square_count:Number(meas.totalSquaresOrder)||null,pitch:meas.dominantPitch??null,waste_pct:Number(meas.wasteFactor)||null})})
                                                    .then(r=>r.ok?r.json():null).then(d=>{if(d?.lead)setLead(d.lead)}).catch(()=>{})
                                                }
                                                setQbDone(true);setShowRemeasure(false)
                                                const newSq=Number(meas?.totalSquaresOrder)
                                                if(newSq>0)addToast(`Roof re-measured — ${newSq} sq updated`,'success')
                                              }catch(err:unknown){
                                                const isAbort=err instanceof Error&&err.name==='AbortError'
                                                setQbError(isAbort?'Timed out — try again':'Network error')
                                              }finally{setQbGenerating(false)}
                                            }}
                                            style={{padding:'9px',borderRadius:8,border:`1.5px solid #0F766E`,background:qbGenerating?'#0F766E':'transparent',color:qbGenerating?'#fff':'#0F766E',fontSize:12,fontWeight:700,cursor:qbGenerating?'wait':'pointer',display:'flex',alignItems:'center',gap:5,justifyContent:'center',opacity:qbGenerating?0.8:1}}>
                                            {qbGenerating
                                              ?<><div style={{width:10,height:10,borderRadius:'50%',border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',animation:'pg-spin 0.7s linear infinite'}}/>Measuring…</>
                                              :<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Re-measure from Satellite (~30s)</>
                                            }
                                          </button>
                                        </div>
                                      )}

                                      {qbError && (
                                        <div style={{marginTop:8,padding:'8px 12px',borderRadius:8,background:'#FEF2F2',border:'1px solid #FECACA',fontSize:12,color:'#DC2626'}}>
                                          {qbError} — check address or try again
                                        </div>
                                      )}
                                      </div>{/* end inner padding div */}
                                    </div>
                                  )
                                })()}
                              </div>
                            )}

                            {/* Notes */}
                            <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${bdr}`}}>
                              <div style={{fontSize:12,fontWeight:700,color:ts,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Notes</div>
                              {lead.notes&&(
                                <div style={{fontSize:14,color:tb,lineHeight:1.65,whiteSpace:'pre-wrap',marginBottom:10,padding:'10px 12px',background:t.cardBgAlt,borderRadius:T.radSm,border:`1px solid ${bdr}`}}>
                                  {lead.notes}
                                </div>
                              )}
                              <div style={{display:'flex',gap:8}}>
                                <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&noteText.trim()){e.preventDefault();saveNote()}}}
                                  placeholder="Add a note..."
                                  style={{flex:1,fontSize:14,padding:'9px 12px',borderRadius:T.radSm,border:`1px solid ${t.inputBorder}`,background:t.inputBg,color:tp,outline:'none',fontFamily:'inherit'}}/>
                                <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                                  style={{padding:'9px 18px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!noteText.trim()?0.4:1}}>
                                  {savingNote?'...':'Save'}
                                </button>
                              </div>
                            </div>

                            {lead.message&&(
                              <div style={{marginTop:10,padding:'11px 14px',background:t.cardBgAlt,borderRadius:T.radSm,border:`1px solid ${bdr}`}}>
                                <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Original Message</div>
                                <div style={{fontSize:14,color:tb,lineHeight:1.65,fontStyle:'italic'}}>"{lead.message}"</div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Edit mode */}
                        {isEditing&&(
                          <>
                            <div style={{display:'flex',flexDirection:'column',gap:14}}>
                              <div style={{position:'relative'}}>
                                <label style={labelCls}>Property Address</label>
                                <input
                                  value={eAddr}
                                  onChange={e=>{setEAddr(e.target.value);setEAddrLoading(true)}}
                                  onFocus={()=>eAddrPredictions.length>0&&setEAddrShowPred(true)}
                                  onBlur={()=>setTimeout(()=>setEAddrShowPred(false),180)}
                                  placeholder="123 Maple St, Jacksonville, FL 32207"
                                  style={inputCls}
                                  autoComplete="off"
                                />
                                {eAddrShowPred&&eAddrPredictions.length>0&&(
                                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1.5px solid #E2E8F0',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.10)',zIndex:500,maxHeight:220,overflowY:'auto'}}>
                                    {eAddrPredictions.map((pred)=>(
                                      <div key={pred.place_id}
                                        onMouseDown={()=>selectEAddrPrediction(pred)}
                                        style={{padding:'10px 14px',cursor:'pointer',fontSize:13,color:'#1E293B',borderBottom:'1px solid #F1F5F9'}}
                                        onMouseEnter={e=>(e.currentTarget.style.background='#F0FDFA')}
                                        onMouseLeave={e=>(e.currentTarget.style.background='')}>
                                        {pred.description}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 1fr':'1fr',gap:12}}>
                                <div><label style={labelCls}>Phone</label><input value={ePhone} onChange={e=>setEPhone(e.target.value)} style={inputCls}/></div>
                                <div><label style={labelCls}>Email</label><input value={eEmail} onChange={e=>setEEmail(e.target.value)} style={inputCls}/></div>
                              </div>
                              <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 1fr 90px':'1fr',gap:12}}>
                                <div><label style={labelCls}>City</label><input value={eCity} onChange={e=>setECity(e.target.value)} placeholder="Jacksonville" style={inputCls}/></div>
                                <div><label style={labelCls}>State</label>
                                  <select value={eState} onChange={e=>setEState(e.target.value)} style={inputCls}>
                                    <option value="">—</option>
                                    {US_STATES.map(([code,name])=><option key={code} value={code}>{code} — {name}</option>)}
                                  </select>
                                </div>
                                <div><label style={labelCls}>Zip</label><input value={eZip} onChange={e=>setEZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="32207" maxLength={5} inputMode="numeric" style={inputCls}/></div>
                              </div>
                              <div><label style={labelCls}>Source</label>
                                <select value={eSrc} onChange={e=>setESrc(e.target.value)} style={inputCls}>
                                  <option value="">— Select source —</option>
                                  {SOURCE_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                              </div>
                              <div><label style={labelCls}>Inspection Date</label>
                                <input type="date" value={eInsp} onChange={e=>setEInsp(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                              </div>
                              <div><label style={labelCls}>Job Date &amp; Time</label>
                                <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 1fr':'1fr',gap:8}}>
                                  <input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                                  <input type="time" value={eTime} onChange={e=>setETime(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                                </div>
                              </div>
                              <div><label style={labelCls}>Follow-up Date</label>
                                <input type="date" value={eFU} onChange={e=>setEFU(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                              </div>
                              <div><label style={labelCls}>Notes</label>
                                <textarea value={eNotes} onChange={e=>setENotes(e.target.value)} rows={4} maxLength={500}
                                  style={{...inputCls,resize:'vertical',lineHeight:1.6,minHeight:90}}/>
                                <div style={{fontSize:12,color:tsu,textAlign:'right',marginTop:3}}>{eNotes.length}/500</div>
                              </div>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 1fr':'1fr',gap:12,marginTop:16,paddingTop:16,borderTop:`1px solid ${bdr}`}}>
                              <button onClick={()=>setIsEditing(false)} style={{padding:'11px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:t.cardBgAlt,color:tp,cursor:'pointer',fontSize:14,fontWeight:600}}>Cancel</button>
                              <button onClick={saveEdit} disabled={eSaving} style={{padding:'11px',borderRadius:T.radSm,border:'none',background:`linear-gradient(135deg,${BRAND.teal},${BRAND.tealLight})`,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700}}>
                                {eSaving?'Saving…':'Save Changes'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Photos tab */}
                    {tab==='photos'&&isRoofing&&(
                      <div style={{padding:'18px 20px'}}>
                        <JobPhotoLog leadId={lead.id} proId={session!.id} isRoofing={isRoofing} darkMode={dk} onPhotosLoaded={(n:number)=>setPhotoCount(n)}/>
                      </div>
                    )}

                    {/* Estimate tab */}
                    {tab==='estimate'&&(
                      <div style={{padding:'18px 20px'}}>
                        {estList.length>0?(
                          <div style={{display:'flex',flexDirection:'column',gap:12}}>
                            {estList.map((e)=>{
                              const isRevision = !!e.revision_of
                              const statusLabel = e.status.charAt(0).toUpperCase()+e.status.slice(1)
                              return (
                                <div key={e.id} style={{padding:'16px 18px',borderRadius:T.radMd,background:t.successBg,border:`1px solid ${t.successBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                  <div>
                                    <div style={{fontSize:10,fontWeight:700,color:BRAND.teal,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                                      <span>Estimate #{e.estimate_number}</span>
                                      {isRevision&&<span style={{padding:'1px 7px',borderRadius:100,background:'rgba(15,118,110,0.12)',color:BRAND.teal,fontSize:9}}>Revision {e.revision_number??''}</span>}
                                      <span style={{padding:'1px 7px',borderRadius:100,background:t.cardBgAlt,color:ts,fontSize:9}}>{statusLabel}</span>
                                    </div>
                                    <div style={{fontSize:26,fontWeight:800,color:BRAND.teal,letterSpacing:'-0.03em'}}>{e.total > 0 ? `$${e.total.toLocaleString('en-US',{minimumFractionDigits:2})}` : 'Open to see total'}</div>
                                  </div>
                                  <button onClick={()=>router.push(`/dashboard/estimates/${e.id}?from=pipeline&lead_id=${id}`)}
                                    style={{padding:'10px 18px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                                    Open
                                  </button>
                                </div>
                              )
                            })}
                            {inv&&(
                              <div style={{padding:'14px 18px',borderRadius:T.radSm,background:t.warningBg,border:`1px solid ${t.warningBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                <div>
                                  <div style={{fontSize:10,fontWeight:700,color:'#B45309',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Invoice #{inv.invoice_number}</div>
                                  <div style={{fontSize:18,fontWeight:700,color:'#B45309'}}>${inv.balance_due.toLocaleString('en-US',{minimumFractionDigits:2})} due</div>
                                </div>
                                <button onClick={()=>router.push(`/dashboard/invoices/${inv.id}`)}
                                  style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',background:'#B45309',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                                  View
                                </button>
                              </div>
                            )}
                            {/* History trail: previous (superseded) versions, collapsed by default */}
                            {supersededList.length>0&&(
                              <div style={{borderRadius:T.radSm,border:`1px solid ${bdr}`,overflow:'hidden'}}>
                                <button onClick={()=>setShowHistory(h=>!h)}
                                  style={{width:'100%',padding:'11px 16px',background:t.cardBgAlt,border:'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:ts,fontSize:13,fontWeight:600}}>
                                  <span>Previous versions ({supersededList.length})</span>
                                  <span style={{fontSize:11,transform:showHistory?'rotate(180deg)':'none',transition:'transform 0.15s'}}>▼</span>
                                </button>
                                {showHistory&&(
                                  <div style={{padding:'4px 0'}}>
                                    {supersededList.map(sv=>(
                                      <div key={sv.id} style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:`1px solid ${bdr}`}}>
                                        <div style={{minWidth:0}}>
                                          <div style={{fontSize:12,fontWeight:600,color:ts,display:'flex',alignItems:'center',gap:6}}>
                                            <span>#{sv.estimate_number}</span>
                                            {sv.revision_number?<span style={{padding:'0px 6px',borderRadius:100,background:t.cardBgAlt,color:tsu,fontSize:9,fontWeight:700}}>Rev {sv.revision_number}</span>:null}
                                            <span style={{padding:'0px 6px',borderRadius:100,background:dk?'rgba(148,163,184,0.15)':'#F1F5F9',color:tsu,fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em'}}>Superseded</span>
                                          </div>
                                          <div style={{fontSize:11,color:tsu,marginTop:2}}>${Number(sv.total||0).toLocaleString('en-US',{minimumFractionDigits:2})} · {sv.void_reason||'Replaced by a newer version'}</div>
                                        </div>
                                        <button onClick={()=>router.push(`/dashboard/estimates/${sv.id}?from=pipeline&lead_id=${id}`)}
                                          style={{padding:'7px 14px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'transparent',color:ts,fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                                          View
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ):(
                          <div style={{textAlign:'center',padding:'40px 0'}}>
                            <div style={{fontSize:14,color:ts,marginBottom:16}}>No estimate yet</div>
                            <button onClick={createEst} disabled={creatingEst}
                              style={{padding:'11px 28px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',opacity:creatingEst?0.7:1}}>
                              {creatingEst?'Creating...':'+ Create Estimate'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Activity tab — full timeline */}
                    {tab==='activity'&&(
                      <div style={{padding:'18px 20px'}}>
                        {acts.length===0
                          ?<div style={{textAlign:'center',padding:'40px 0',color:ts,fontSize:14}}>No activity yet.</div>
                          :<div style={{position:'relative'}}>
                            {/* Vertical rail */}
                            <div style={{position:'absolute',left:15,top:16,bottom:16,width:1,background:bdr,zIndex:0}}/>
                            {acts.map((item,i)=>{
                              const warn=(item as any).warn===true
                              const ic=warn?'#EF4444':item.type==='stage'?'#7C3AED':item.type==='note'?'#854F0B':item.type==='quote'?'#0F766E':item.type==='scheduled'?'#64748B':item.type==='invoice_sent'?'#0F766E':item.type==='payment_received'?'#16A34A':item.type==='invoice_viewed'?'#0F766E':['estimate','estimate_sent','estimate_viewed','estimate_approved'].includes(item.type)?'#0F766E':BRAND.teal
                              const ib=warn?'#FEF2F2':item.type==='stage'?'#F5F3FF':item.type==='note'?'#FEF3C7':item.type==='quote'?'#EEF2FF':item.type==='scheduled'?'#FFFBEB':'#E1F5EE'
                              return (
                                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:14,paddingBottom:i<acts.length-1?18:0,position:'relative',zIndex:1}}>
                                  {/* Timeline dot */}
                                  <div style={{width:30,height:30,borderRadius:'50%',background:ib,border:`2px solid ${ic}25`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                    <Svg size={13} stroke={ic}>
                                      {item.type==='stage'            &&<><polyline points="9 18 15 12 9 6"/></>}
                                      {item.type==='note'             &&<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                      {item.type==='quote'            &&<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                      {item.type==='created'          &&<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                      {item.type==='scheduled'        &&<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                      {item.type==='estimate'         &&<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>}
                                      {item.type==='invoice_viewed'   &&<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}{item.type==='payment_received' &&<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}{item.type==='invoice_sent'    &&<><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="7" y1="15" x2="12" y2="15"/></>}{item.type==='estimate_sent'    &&<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>}
                                      {item.type==='estimate_viewed'  &&<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                                      {item.type==='estimate_approved'&&<><polyline points="20 6 9 17 4 12"/></>}
                                    </Svg>
                                  </div>
                                  <div style={{flex:1,paddingTop:3}}>
                                    <div style={{fontSize:14,fontWeight:600,color:warn?'#EF4444':tp,lineHeight:1.3}}>{item.title}</div>
                                    <div style={{fontSize:12,color:warn?'#EF4444':ts,marginTop:2,lineHeight:1.4}}>{item.sub}</div>
                                  </div>
                                  <div style={{fontSize:11,color:tsu,flexShrink:0,paddingTop:4,textAlign:'right',lineHeight:1.4}}>
                                    <div>{new Date(item.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                                    <div>{new Date(item.date).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        }
                      </div>
                    )}
                  </div>{/* end tabs card */}
                </div>{/* end left col */}

                {/* ══ RIGHT COLUMN ══════════════════════════════════════ */}
                <div style={{display:isWide?'block':'none'}}>
                  <div style={{position:'sticky',top:20,display:'flex',flexDirection:'column',gap:12}}>

                    {/* Insights — horizontal cards */}
                    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:T.radLg,overflow:'hidden',boxShadow:dk?'none':'0 1px 4px rgba(0,0,0,0.05)'}}>
                      <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${bdr}`,display:'flex',alignItems:'center',gap:7}}>
                        <Svg size={14} stroke="#1D4ED8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>
                        <span style={{fontSize:14,fontWeight:700,color:tp}}>Insights</span>
                      </div>
                      {/* Horizontal row of insight cards */}
                      <div style={{padding:'12px',display:'flex',gap:8}}>
                        {(()=>{
                          const mins=Math.floor((Date.now()-new Date(lead.created_at).getTime())/60000)
                          const hour=new Date().getHours()
                          const items=[
                            ...(mins<=30?[{color:'#059669',bg:'#ECFDF5',title:'High close probability',body:`Lead responded within ${mins<1?'1':mins} min`,icon:<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>}]:[]),
                            {color:'#1D4ED8',bg:'#EFF6FF',title:'Best callback window',body:hour<17?'5:00 PM – 7:00 PM':hour<20?'Right now':'10 AM – 12 PM',icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>},
                            ...(isRoofing&&(lead as any)?.roofing_job_data?.square_count?[{color:'#B45309',bg:'#FFFBEB',title:'Roof size measured',body:(()=>{
                              const sq=(lead as any).roofing_job_data.square_count
                              const pitch=(lead as any).roofing_job_data.pitch
                              return pitch ? `${sq} sq · ${pitch}` : `${sq} squares`
                            })(),icon:<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}]:[]),
                          ]
                          return items.map((ins,i)=>(
                            <div key={i} style={{flex:1,background:ins.bg,borderRadius:T.radMd,padding:'14px 12px',minWidth:0,border:`1px solid ${ins.color}22`}}>
                              <div style={{width:30,height:30,borderRadius:8,background:ins.color+'18',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8}}>
                                <Svg size={14} stroke={ins.color}>{ins.icon}</Svg>
                              </div>
                              <div style={{fontSize:10,fontWeight:700,color:ins.color,lineHeight:1.3,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>{ins.title}</div>
                              <div style={{fontSize:14,fontWeight:800,color:ins.color,lineHeight:1.2}}>{ins.body}</div>
                            </div>
                          ))
                        })()}
                      </div>
                    </div>

                    {/* Activity — timeline */}
                    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:T.radLg,overflow:'hidden',boxShadow:dk?'none':'0 1px 4px rgba(0,0,0,0.05)'}}>
                      <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span style={{fontSize:14,fontWeight:700,color:tp}}>Activity</span>
                        {acts.length>3&&(
                          <button onClick={()=>setTab('activity')} style={{fontSize:12,color:BRAND.teal,fontWeight:600,background:'none',border:'none',cursor:'pointer',padding:0}}>
                            View all →
                          </button>
                        )}
                      </div>
                      <div style={{padding:'14px 16px'}}>
                        {acts.length===0
                          ?<div style={{fontSize:13,color:tsu,textAlign:'center',padding:'10px 0'}}>No activity yet</div>
                          :<div style={{position:'relative'}}>
                            {/* Timeline rail */}
                            <div style={{position:'absolute',left:11,top:12,bottom:12,width:1,background:bdr,zIndex:0}}/>
                            {acts.slice(0,5).map((item,i)=>{
                              const ic=item.type==='stage'?'#7C3AED':item.type==='note'?'#854F0B':item.type==='quote'?'#0F766E':item.type==='scheduled'?'#64748B':BRAND.teal
                              const ib=item.type==='stage'?'#F5F3FF':item.type==='note'?'#FEF3C7':item.type==='quote'?'#EEF2FF':item.type==='scheduled'?'#FFFBEB':'#E1F5EE'
                              return (
                                <div key={i} style={{display:'flex',gap:10,paddingBottom:i<Math.min(acts.length,5)-1?14:0,position:'relative',zIndex:1}}>
                                  <div style={{width:22,height:22,borderRadius:'50%',background:ib,border:`1.5px solid ${ic}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                                    <Svg size={10} stroke={ic}>
                                      {item.type==='stage'    &&<><polyline points="9 18 15 12 9 6"/></>}
                                      {item.type==='created'  &&<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                      {item.type==='note'     &&<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                      {item.type==='quote'    &&<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                      {item.type==='scheduled'&&<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                    </Svg>
                                  </div>
                                  <div style={{flex:1,minWidth:0,paddingTop:1}}>
                                    <div style={{fontSize:13,fontWeight:600,color:tp,lineHeight:1.3}}>{item.title}</div>
                                    <div style={{fontSize:11,color:ts,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.sub}</div>
                                  </div>
                                  <div style={{fontSize:10,color:tsu,flexShrink:0,textAlign:'right',paddingTop:1,lineHeight:1.5}}>
                                    <div>{new Date(item.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                                    <div>{new Date(item.date).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        }
                      </div>
                    </div>

                  </div>
                </div>{/* end right col */}

              </div>{/* end grid */}
              </div>{/* end max-width wrapper */}
            </>
          )
        })()}
      </div>

      {/* Lost Reason Sheet */}
      {showLostSheet && lead && (
        <LostReasonSheet
          lead={lead}
          dk={dk}
          onCancel={() => setShowLostSheet(false)}
          onConfirm={async (reason) => {
            setShowLostSheet(false)
            const lostKey = (getStageAnchors(session?.trade_slug)?.lost ?? 'lost') as LeadStatus
            const prev = stage
            setStage(lostKey)
            setSaving(true)
            const ok = await patch({ lead_status: lostKey, lost_reason: reason })
            setSaving(false)
            if (ok) {
              setLead(l => l ? { ...l, lead_status: lostKey } : l)
              addToast('Lead marked as Lost', 'success', prev)
            } else {
              setStage(prev)
              addToast('Failed to update stage', 'error')
            }
          }}
        />
      )}
    </DashboardShell>
  )
}

export default function LeadDetailPage({ params }: { params: Promise<{ id:string }> }) {
  return (
    <Suspense fallback={null}>
      <LeadDetailInner params={params}/>
    </Suspense>
  )
}
