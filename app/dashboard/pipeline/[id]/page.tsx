'use client'
import { useState, useEffect, use, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lead, Session, LeadStatus } from '@/types'
import { avatarColor, initials, capName, fmtPhone, US_STATES } from '@/lib/utils'
import { theme, T, BRAND } from '@/lib/tokens'
import DashboardShell from '@/components/layout/DashboardShell'
import { getPipelineStages } from '@/components/ui/LeadPipeline'
import InsuranceClaimFields from '@/components/roofing/InsuranceClaimFields'
import JobPhotoLog from '@/components/roofing/JobPhotoLog'
import WarrantyRecord from '@/components/roofing/WarrantyRecord'

// ─── Stage order map ──────────────────────────────────────────────────────────
const STAGE_ORDER: Record<string, number> = {
  New:0,Contacted:1,Quoted:2,Scheduled:3,Completed:4,Paid:5,
  lead_in:0,inspection_scheduled:1,proposal_sent:2,proposal_signed:3,
  insurance_approved:4,scheduled:5,in_progress:6,job_won:7,lost:8,unqualified:9,
  new_call:0,diagnosed:1,quoted:2,parts_ordered:3,
}

const SOURCE_OPTIONS = [
  'Phone Call','Profile Page','Job Post','Search Result','Direct',
  'Registry Card','Facebook','Instagram','Referral','Website',
  'Yard Sign','Walk In','Other','Insurance','Canvassing',
]

interface LeadExt extends Lead {
  contact_city:  string | null
  contact_state: string | null
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

interface Toast { id:number; msg:string; type:'success'|'error'; prev?:LeadStatus }

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
  const isDate = ['inspection_scheduled','scheduled','Scheduled'].includes(k)
  const isDoc  = ['proposal_sent','proposal_signed','Quoted'].includes(k)
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
        {!['lead_in','inspection_scheduled','scheduled','Scheduled',
           'proposal_sent','proposal_signed','Quoted','insurance_approved',
           'in_progress','job_won','lost','unqualified'].includes(k) && <circle cx="12" cy="12" r="10"/>}
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

  function backNav() {
    if (fromParam==='calendar')  return { label:'Back to Calendar',  href:'/dashboard/calendar' }
    if (fromParam==='clients')   return { label:'Back to Clients',   href:'/dashboard/clients' }
    if (fromParam==='estimates') return { label:'Back to Estimate',  href: fromEst?`/dashboard/estimates/${fromEst}`:'/dashboard/estimates' }
    return { label:'Back to Pipeline', href:'/dashboard/pipeline' }
  }

  // ── Session ─────────────────────────────────────────────────────────────
  const [session] = useState<Session|null>(() => {
    if (typeof window==='undefined') return null
    const s = sessionStorage.getItem('pg_pro'); return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(false)
  useEffect(() => { if (typeof window!=='undefined') setDk(localStorage.getItem('pg_darkmode')==='1') }, [])
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
  const [showWarranty, setShowWarranty] = useState(false)
  const [confirmBack,  setConfirmBack]  = useState<LeadStatus|null>(null)
  const [warnSched,    setWarnSched]    = useState(false)
  const [warnDone,     setWarnDone]     = useState(false)

  // ── Edit fields ──────────────────────────────────────────────────────────
  const [eAddr,  setEAddr]  = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eEmail, setEEmail] = useState('')
  const [eCity,  setECity]  = useState('')
  const [eState, setEState] = useState('')
  const [eSrc,   setESrc]   = useState('')
  const [eDate,  setEDate]  = useState('')
  const [eTime,  setETime]  = useState('')
  const [eFU,    setEFU]    = useState('')
  const [eNotes, setENotes] = useState('')
  const [eSaving,setESaving]= useState(false)

  // ── Note ────────────────────────────────────────────────────────────────
  const [noteText,  setNoteText]  = useState('')
  const [savingNote,setSavingNote]= useState(false)

  // ── Estimate / invoice ───────────────────────────────────────────────────
  const [est, setEst] = useState<{id:string;estimate_number:string;total:number;status:string}|null>(null)
  const [inv, setInv] = useState<{id:string;invoice_number:string;status:string;balance_due:number}|null>(null)
  const [creatingEst, setCreatingEst] = useState(false)
  const [creatingInv, setCreatingInv] = useState(false)

  // ── Toasts ───────────────────────────────────────────────────────────────
  const [toasts,   setToasts]   = useState<Toast[]>([])
  const [toastSeq, setToastSeq] = useState(0)
  function addToast(msg:string, type:Toast['type']='success', prev?:LeadStatus) {
    const tid=toastSeq+1; setToastSeq(tid)
    setToasts(t=>[...t,{id:tid,msg,type,prev}])
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==tid)),5000)
  }
  function killToast(tid:number) { setToasts(t=>t.filter(x=>x.id!==tid)) }

  const isRoofing = ['roofing-contractor','roofing','roofer'].includes(session?.trade_slug??'')

  // ── Fetch lead ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/leads/${id}?pro_id=${session.id}`)
      .then(r => { if(r.status===404){setMissing(true);setLoading(false);return null}; return r.json() })
      .then(d => { if(!d) return; const l=d.lead as LeadExt; setLead(l); setStage(l.lead_status as LeadStatus); setLoading(false) })
      .catch(()=>setLoading(false))
  }, [session, id, router])

  useEffect(() => {
    if (!session||!lead) return
    fetch(`/api/estimates?pro_id=${session.id}`).then(r=>r.json()).then(d => {
      const arr=(d.estimates||[]).filter((e:any)=>e.lead_id===lead.id&&!['void','declined'].includes(e.status))
      if (!arr.length) return
      const pri=['invoiced','approved','paid','sent','viewed','draft']
      setEst(arr.sort((a:any,b:any)=>pri.indexOf(a.status)<pri.indexOf(b.status)?-1:1)[0])
    }).catch(()=>{})
    fetch(`/api/invoices?pro_id=${session.id}&lead_id=${lead.id}`).then(r=>r.json()).then(d => {
      const i=(d.invoices||[]).find((x:any)=>x.status!=='void'); if(i) setInv(i)
    }).catch(()=>{})
  }, [session, lead])

  // ── Patch ────────────────────────────────────────────────────────────────
  const patch = useCallback(async (fields:Record<string,unknown>) => {
    if (!session) return false
    const r = await fetch(`/api/leads/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,...fields})})
    return r.ok
  }, [session, id])

  // ── Stage move ───────────────────────────────────────────────────────────
  async function moveStage(s:LeadStatus, force=false) {
    if (s===stage||saving) return
    if (STAGE_ORDER[s]<STAGE_ORDER[stage]) { setConfirmBack(s); return }
    if (!force) {
      if (s==='Scheduled'&&!est) { setWarnSched(true); return }
      if (s==='Completed'&&!inv) { setWarnDone(true); return }
    }
    const prev=stage; setStage(s); setSaving(true)
    const ok = await patch({lead_status:s}); setSaving(false)
    if (ok) { setLead(l=>l?{...l,lead_status:s}:l); addToast(`Moved to ${s.replace(/_/g,' ')}`,'success',prev); if(s==='job_won'&&isRoofing) setShowWarranty(true) }
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
    setESrc((lead.lead_source||'').replace(/_/g,' '))
    setEDate(lead.scheduled_date||'')
    setETime((lead as any).scheduled_time||'')
    setEFU(lead.follow_up_date||'')
    setENotes(lead.notes||'')
    setTab('details'); setIsEditing(true)
  }
  async function saveEdit() {
    setESaving(true)
    const ok = await patch({
      property_address: eAddr||null,
      contact_phone: ePhone||null, contact_email: eEmail||null,
      contact_city: eCity||null, contact_state: eState||null,
      lead_source: eSrc.replace(/ /g,'_')||null,
      scheduled_date: eDate||null, scheduled_time: eTime||null,
      follow_up_date: eFU||null, notes: eNotes||null,
    })
    setESaving(false)
    if (ok) {
      setLead(l=>l?{...l,
        property_address: eAddr||null,
        contact_phone: ePhone||null, contact_email: eEmail||null,
        contact_city: eCity||null, contact_state: eState||null,
        lead_source: eSrc.replace(/ /g,'_') as any||null,
        scheduled_date: eDate||null, follow_up_date: eFU||null, notes: eNotes||null,
      }:l)
      setIsEditing(false); addToast('Saved')
    } else addToast('Failed to save','error')
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
      const r=await fetch('/api/estimates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,lead_id:lead.id,lead_name:lead.contact_name,lead_source:lead.lead_source||'',trade:session.trade||'',state:session.state||'',contact_phone:lead.contact_phone||'',contact_email:lead.contact_email||''})})
      const d=await r.json(); if(d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}?from=pipeline&lead_id=${id}`)
    } catch { setCreatingEst(false) }
  }
  async function createInv() {
    if (!lead||!session||creatingInv) return
    if (inv) { router.push(`/dashboard/invoices/${inv.id}`); return }
    setCreatingInv(true)
    try {
      const r=await fetch('/api/invoices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro_id:session.id,lead_id:lead.id,estimate_id:est?.id,lead_name:lead.contact_name,trade:session.trade||'',contact_name:lead.contact_name,contact_email:lead.contact_email||'',contact_phone:lead.contact_phone||''})})
      const d=await r.json(); if(d.invoice?.id) router.push(`/dashboard/invoices/${d.invoice.id}`)
    } catch {} finally { setCreatingInv(false) }
  }

  // ── Activity ──────────────────────────────────────────────────────────────
  function activity() {
    if (!lead) return []
    const items:{date:string;title:string;sub:string;type:string}[] = []
    items.push({date:lead.created_at,title:'Lead created',sub:`From ${(lead.lead_source||'unknown').replace(/_/g,' ')}${lead.message?` · "${lead.message.slice(0,60)}${lead.message.length>60?'…':''}"`:``}`,type:'created'})
    if (lead.quoted_amount!=null) items.push({date:lead.updated_at||lead.created_at,title:'Quote set',sub:`$${Number(lead.quoted_amount).toLocaleString()}`,type:'quote'})
    if (lead.scheduled_date) items.push({date:lead.updated_at||lead.created_at,title:'Job scheduled',sub:fmt(lead.scheduled_date),type:'scheduled'})
    if (lead.notes) lead.notes.split(/\n\n+/).filter(Boolean).forEach(n=>items.push({date:lead.updated_at||lead.created_at,title:'Note added',sub:n.slice(0,100)+(n.length>100?'…':''),type:'note'}))
    return items.reverse()
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

        {/* ── Toasts ─────────────────────────────────────────────────────── */}
        <div style={{position:'fixed',bottom:32,left:'50%',transform:'translateX(-50%)',zIndex:400,display:'flex',flexDirection:'column',gap:10,pointerEvents:'none',alignItems:'center'}}>
          {toasts.map(toast=>(
            <div key={toast.id} style={{pointerEvents:'all',background:toast.type==='error'?t.dangerBg:t.successBg,border:`1.5px solid ${toast.type==='error'?t.dangerBorder:t.successBorder}`,borderRadius:T.radMd,padding:'12px 18px',display:'flex',alignItems:'center',gap:12,fontSize:T.fontBody,fontWeight:500,color:toast.type==='error'?'#991B1B':'#166534',minWidth:260,maxWidth:420,boxShadow:'0 4px 20px rgba(0,0,0,0.10)'}}>
              <span style={{flex:1}}>{toast.msg}</span>
              {toast.prev&&toast.type==='success'&&<button onClick={()=>undoMove(toast.id,toast.prev!)} style={{fontSize:T.fontBody,color:BRAND.teal,fontWeight:700,background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0}}>Undo</button>}
              <button onClick={()=>killToast(toast.id)} style={{background:'none',border:'none',cursor:'pointer',color:ts,fontSize:20,lineHeight:1,padding:0}}>×</button>
            </div>
          ))}
        </div>

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

        {warnSched&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:T.sp4}} onClick={()=>setWarnSched(false)}>
            <div style={{background:card,borderRadius:T.radLg,padding:T.sp6,maxWidth:360,width:'100%',border:`1px solid ${bdr}`}} onClick={e=>e.stopPropagation()}>
              <p style={{fontSize:T.fontEmphasis,fontWeight:700,color:tp,marginBottom:6}}>No estimate yet</p>
              <p style={{fontSize:T.fontBody,color:tb,marginBottom:T.sp4}}>Create an estimate before scheduling.</p>
              <div style={{display:'flex',gap:T.sp2,justifyContent:'flex-end'}}>
                <button onClick={()=>{setWarnSched(false);createEst()}} style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',cursor:'pointer',fontSize:T.fontBody,fontWeight:700}}>Create Estimate</button>
                <button onClick={()=>{setWarnSched(false);moveStage('Scheduled' as LeadStatus,true)}} style={{padding:'9px 16px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,cursor:'pointer',fontSize:T.fontBody}}>Schedule Anyway</button>
              </div>
            </div>
          </div>
        )}

        {warnDone&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:T.sp4}} onClick={()=>setWarnDone(false)}>
            <div style={{background:card,borderRadius:T.radLg,padding:T.sp6,maxWidth:360,width:'100%',border:`1px solid ${bdr}`}} onClick={e=>e.stopPropagation()}>
              <p style={{fontSize:T.fontEmphasis,fontWeight:700,color:tp,marginBottom:6}}>No invoice created</p>
              <p style={{fontSize:T.fontBody,color:tb,marginBottom:T.sp4}}>Create an invoice before completing.</p>
              <div style={{display:'flex',gap:T.sp2,justifyContent:'flex-end'}}>
                <button onClick={()=>{setWarnDone(false);createInv()}} style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',cursor:'pointer',fontSize:T.fontBody,fontWeight:700}}>Create Invoice</button>
                <button onClick={()=>{setWarnDone(false);moveStage('Completed' as LeadStatus,true)}} style={{padding:'9px 16px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,cursor:'pointer',fontSize:T.fontBody}}>Complete Anyway</button>
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
          const isTerminal = stage==='job_won'||stage==='unqualified'||stage==='lost'

          const TIPS:Record<string,string> = {
            lead_in:              'Call within 1 hour — response rate drops 80% after 24hrs.',
            inspection_scheduled: 'Confirm the night before. Bring a moisture meter.',
            proposal_sent:        'Follow up in 48hrs. Most jobs are won on the follow-up.',
            proposal_signed:      'Collect deposit now — 25–33% is standard.',
            insurance_approved:   'Order materials within 24hrs to lock price.',
            scheduled:            'Send reminder to homeowner 48hrs before crew arrives.',
            in_progress:          'Take photos at each phase: decking, install, completion.',
            job_won:              'Request a Google review within 24hrs — 70% response rate.',
          }

          const isRoofingGroups = isRoofing
          const pickerGroups = isRoofingGroups
            ? [
                {label:'SALES',      keys:['lead_in','inspection_scheduled','proposal_sent','proposal_signed']},
                {label:'OPERATIONS', keys:['insurance_approved','scheduled','in_progress']},
                {label:'CLOSED',     keys:['job_won','lost','unqualified']},
              ]
            : [
                {label:'ACTIVE', keys:['New','Contacted','Quoted','Scheduled','Completed']},
                {label:'CLOSED', keys:['Paid']},
              ]

          // ── Identity ────────────────────────────────────────────────────
          const addr        = (lead as any).property_address as string|null|undefined
          const heroLabel   = addr ? addr.replace(/, USA$/,'') : capName(lead.contact_name)
          const heroSub     = addr
            ? [capName(lead.contact_name), lead.contact_phone?fmtPhone(lead.contact_phone):null].filter(Boolean).join(' · ')
            : [lead.contact_phone?fmtPhone(lead.contact_phone):null, lead.contact_email||null].filter(Boolean).join(' · ')

          const tabs: {key:Tab;label:string;icon:React.ReactNode}[] = [
            {key:'details', label:'Job Details', icon:<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>},
            ...(isRoofing?[{key:'photos' as Tab, label:'Photos', icon:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>}]:[]),
            {key:'estimate',label:'Estimate',   icon:<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></>},
            {key:'activity',label:'Activity',   icon:<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>},
          ]

          return (
            <>
              {showWarranty&&isRoofing&&(
                <WarrantyRecord leadId={lead.id} proId={session!.id} propertyId={null} darkMode={dk}
                  onSaved={()=>{setShowWarranty(false);addToast('Warranty recorded')}}
                  onDismiss={()=>setShowWarranty(false)}/>
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
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:T.sp3}} className="lg:grid-cols-[1fr_300px]">

                {/* ══ LEFT ══ */}
                <div style={{minWidth:0}}>

                  {/* ─── HERO CARD ─────────────────────────────────────── */}
                  <div style={{background:card,borderRadius:T.radLg,marginBottom:T.sp3,border:`1px solid ${bdr}`,boxShadow:dk?'none':'0 2px 12px rgba(0,0,0,0.06)'}}>

                    {/* Identity */}
                    <div style={{padding:`${T.sp5}px ${T.sp5}px ${T.sp4}px`}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:T.sp3}}>
                        {/* Left */}
                        <div style={{display:'flex',alignItems:'flex-start',gap:T.sp3,minWidth:0,flex:1}}>
                          <div style={{width:48,height:48,borderRadius:T.radMd,background:avBg,color:avFg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:T.fontLabel,fontWeight:800,flexShrink:0,letterSpacing:'-0.02em'}}>
                            {initials(lead.contact_name)}
                          </div>
                          <div style={{minWidth:0,flex:1,paddingTop:2}}>
                            <div style={{fontSize:20,fontWeight:800,color:tp,letterSpacing:'-0.025em',lineHeight:1.2,marginBottom:3}}>
                              {heroLabel}
                            </div>
                            <div style={{fontSize:T.fontSub,color:tsu,lineHeight:1.5}}>
                              {heroSub||'No contact info'}
                            </div>
                          </div>
                        </div>
                        {/* Buttons */}
                        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                          {lead.contact_phone&&(
                            <a href={`tel:${lead.contact_phone.replace(/\D/g,'')}`}
                              style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:card,color:tp,fontSize:T.fontSub,textDecoration:'none',fontWeight:600,whiteSpace:'nowrap'}}>
                              <Svg size={13} stroke={tp}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Svg>
                              Call
                            </a>
                          )}
                          <button onClick={startEdit}
                            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:'none',color:ts,fontSize:T.fontSub,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                            <Svg size={13} stroke={ts}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>
                            Edit
                          </button>
                        </div>
                      </div>

                      {/* Stage chip + date */}
                      <div style={{display:'flex',alignItems:'center',gap:T.sp2,marginTop:T.sp3,flexWrap:'wrap'}}>
                        <span style={{fontSize:T.fontSub,fontWeight:700,padding:'4px 10px',borderRadius:20,background:stgObj?.bg??'#F0FDFA',color:stgObj?.color??BRAND.teal}}>
                          {stgObj?.label??stage}
                        </span>
                        <span style={{fontSize:T.fontSub,color:tsu}}>
                          {new Date(lead.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                          {' at '}
                          {new Date(lead.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                        </span>
                        {lead.quoted_amount!=null&&(
                          <span style={{fontSize:T.fontBody,fontWeight:700,color:BRAND.teal,marginLeft:'auto'}}>
                            ${Number(lead.quoted_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ─── Progress bar ───────────────────────────────── */}
                    <div style={{borderTop:`1px solid ${bdr}`,padding:`${T.sp4}px ${T.sp5}px ${T.sp3}px`}}>
                      {/* Single relative container — line behind, dots + labels on top */}
                      <div style={{position:'relative',display:'flex',alignItems:'flex-start'}}>
                        {/* Connector line — sits at dot vertical center (dot is 20px, padded by 0) */}
                        <div style={{
                          position:'absolute', top:9, zIndex:0,
                          left:`${100/active.length/2}%`,
                          right:`${100/active.length/2}%`,
                          height:2,
                          background: curPos>0
                            ? `linear-gradient(to right, ${active[curPos-1]?.color??BRAND.teal} 0%, ${stgObj?.color??BRAND.teal} ${Math.round((curPos/(active.length-1))*100)}%, ${dk?'#1E293B':'#E2E8F0'} ${Math.round((curPos/(active.length-1))*100)}%)`
                            : (dk?'#1E293B':'#E2E8F0'),
                        }}/>
                        {/* Stage columns */}
                        {active.map((stg,i)=>{
                          const done   = i<curPos
                          const isAct  = i===curPos
                          const dotSz  = isAct ? 22 : done ? 20 : 14
                          const dotR   = done||isAct ? '50%' : '3px'
                          const dotBg  = done ? stg.color : isAct ? stg.color : (dk?'#374151':'#E2E8F0')
                          const dotBdr = isAct ? `2.5px solid ${card}` : 'none'
                          const dotShd = isAct ? `0 0 0 2.5px ${stg.color}` : done ? `0 1px 4px ${stg.color}40` : 'none'
                          const lblClr = isAct ? stg.color : done ? (dk?'#4B5563':'#9CA3AF') : (dk?'#374151':'#C5CAD3')
                          const lblWt  = isAct ? 700 : 500
                          return (
                            <div key={stg.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',position:'relative',zIndex:1}}>
                              {/* Dot */}
                              <div style={{width:dotSz,height:dotSz,borderRadius:dotR,background:dotBg,border:dotBdr,boxShadow:dotShd,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:6}}>
                                {done&&<Svg size={9} stroke="#fff" sw={3}><polyline points="20 6 9 17 4 12"/></Svg>}
                              </div>
                              {/* Label */}
                              <span style={{fontSize:9,fontWeight:lblWt,color:lblClr,textAlign:'center',lineHeight:1.3,wordBreak:'break-word',maxWidth:'100%',display:'block',padding:'0 1px'}}>
                                {stg.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* ─── Status row ─────────────────────────────────── */}
                    <div style={{borderTop:`1px solid ${bdr}`,padding:`${T.sp4}px ${T.sp5}px`}}>
                      <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:T.sp5,alignItems:'start'}}>
                        {/* Status picker */}
                        <div>
                          <div style={labelCls}>Current Status</div>
                          <div style={{display:'inline-block'}}>
                            <button
                              ref={(el)=>{ if(el&&showPicker){ const r=el.getBoundingClientRect(); (window as any).__pgPickerY=r.bottom+6; (window as any).__pgPickerX=r.left; } }}
                              onClick={(e)=>{ const r=(e.currentTarget as HTMLButtonElement).getBoundingClientRect(); (window as any).__pgPickerY=r.bottom+6; (window as any).__pgPickerX=r.left; setShowPicker(v=>!v); }}
                              disabled={saving}
                              style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:T.radSm,border:`1.5px solid ${stgObj?.color??BRAND.teal}40`,background:stgObj?.bg??'#F0FDFA',color:stgObj?.color??BRAND.teal,fontSize:T.fontBody,fontWeight:700,cursor:saving?'wait':'pointer',whiteSpace:'nowrap',transition:'opacity 0.15s',opacity:saving?0.7:1}}>
                              <span style={{width:8,height:8,borderRadius:'50%',background:stgObj?.color??BRAND.teal,flexShrink:0}}/>
                              {saving?'Updating...':(stgObj?.label??stage)}
                              <Svg size={13} stroke={stgObj?.color??BRAND.teal}><polyline points="6 9 12 15 18 9"/></Svg>
                            </button>

                            {/* Dropdown — fixed position to escape any overflow:hidden parent */}
                            {showPicker&&(
                              <>
                                <div style={{position:'fixed',inset:0,zIndex:199}} onClick={()=>setShowPicker(false)}/>
                                <div style={{position:'fixed',top:(typeof window!=='undefined'?(window as any).__pgPickerY:200),left:(typeof window!=='undefined'?(window as any).__pgPickerX:0),zIndex:200,background:card,border:`1px solid ${bdr}`,borderRadius:T.radMd,boxShadow:'0 8px 32px rgba(0,0,0,0.14)',minWidth:260,maxWidth:340,overflow:'hidden'}}>
                                  {pickerGroups.map((grp,gi)=>{
                                    const gStages = stages.filter(s=>grp.keys.includes(s.key))
                                    if (!gStages.length) return null
                                    return (
                                      <div key={grp.label}>
                                        {gi>0&&<div style={{height:1,background:t.divider}}/>}
                                        <div style={{padding:'8px 14px 4px',fontSize:9,fontWeight:800,color:tsu,textTransform:'uppercase',letterSpacing:'0.08em'}}>{grp.label}</div>
                                        {gStages.map(stg=>{
                                          const isCur  = stg.key===stage
                                          const dotClr = stg.terminal ? t.accentRed : stg.color
                                          return (
                                            <button key={stg.key}
                                              onClick={()=>{setShowPicker(false);if(!isCur)moveStage(stg.key as LeadStatus)}}
                                              style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:isCur?(dk?dotClr+'18':stg.bg):'transparent',border:'none',cursor:'pointer',textAlign:'left',transition:'background 0.1s'}}
                                              onMouseEnter={e=>{if(!isCur)(e.currentTarget as HTMLButtonElement).style.background=t.cardBgAlt}}
                                              onMouseLeave={e=>{if(!isCur)(e.currentTarget as HTMLButtonElement).style.background='transparent'}}>
                                              <StageIcon k={stg.key} color={dotClr} size={26}/>
                                              <div style={{flex:1,minWidth:0}}>
                                                <div style={{fontSize:T.fontBody,fontWeight:isCur?700:500,color:stg.terminal?t.accentRed:tp}}>{stg.label}</div>
                                                <div style={{fontSize:T.fontBadge,color:tsu,marginTop:1}}>{stg.subLabel}</div>
                                              </div>
                                              {isCur&&<Svg size={14} stroke={dotClr}><polyline points="20 6 9 17 4 12"/></Svg>}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status since */}
                        <div>
                          <div style={labelCls}>Status Since</div>
                          <div style={{fontSize:T.fontBody,fontWeight:600,color:tp}}>
                            {new Date(lead.updated_at||lead.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                          </div>
                          <div style={{fontSize:T.fontBadge,color:tsu,marginTop:2}}>
                            {daysAgo(lead.updated_at||lead.created_at)} days ago
                          </div>
                        </div>
                      </div>

                      {/* Stage tip */}
                      {TIPS[stage]&&(
                        <div style={{marginTop:T.sp3,padding:'10px 12px',borderRadius:T.radSm,background:t.cardBgAlt,border:`1px solid ${bdr}`,fontSize:T.fontSub,color:tsu,lineHeight:1.5}}>
                          💡 {TIPS[stage]}
                        </div>
                      )}

                      {/* Terminal banner */}
                      {isTerminal&&(
                        <div style={{marginTop:T.sp3,padding:'12px 16px',borderRadius:T.radSm,textAlign:'center',background:stage==='job_won'?'linear-gradient(135deg,#065F46,#047857)':t.cardBgAlt,color:stage==='job_won'?'#fff':ts,fontSize:T.fontBody,fontWeight:700}}>
                          {stage==='job_won'?'🏆 Job Complete':stage==='lost'?'Job Lost':'Lead Unqualified'}
                        </div>
                      )}
                    </div>
                  </div>{/* end hero card */}

                  {/* ─── TABS CARD ───────────────────────────────────────── */}
                  <div style={{background:card,borderRadius:T.radLg,border:`1px solid ${bdr}`,overflow:'hidden',boxShadow:dk?'none':'0 2px 10px rgba(0,0,0,0.05)'}}>

                    {/* Tab strip — inline icon + text, teal underline */}
                    <div style={{display:'flex',borderBottom:`1px solid ${bdr}`,background:t.cardBgAlt}}>
                      {tabs.map(tb2=>{
                        const isAct = tab===tb2.key
                        return (
                          <button key={tb2.key} onClick={()=>{setTab(tb2.key);if(isEditing&&tb2.key!=='details')setIsEditing(false)}}
                            style={{flex:1,padding:'12px 8px',border:'none',borderBottom:isAct?`2px solid ${BRAND.teal}`:'2px solid transparent',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,color:isAct?BRAND.teal:ts,fontWeight:isAct?700:500,fontSize:T.fontSub,whiteSpace:'nowrap',transition:'all 0.15s',marginBottom:-1}}>
                            <Svg size={14} stroke={isAct?BRAND.teal:tsu}>{tb2.icon}</Svg>
                            {tb2.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* ── Tab: Job Details ─────────────────────────────── */}
                    {tab==='details'&&(
                      <div style={{padding:`${T.sp4}px ${T.sp4+2}px`}}>
                        {/* View mode */}
                        {!isEditing&&(
                          <>
                            {/* Data grid */}
                            <div style={{borderRadius:T.radSm,overflow:'hidden',border:`1px solid ${bdr}`,marginBottom:T.sp4}}>
                              {([
                                {label:'Phone',    icon:<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>, val:fmtPhone(lead.contact_phone), copy:lead.contact_phone},
                                {label:'Email',    icon:<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>, val:lead.contact_email||'—', copy:lead.contact_email},
                                {label:'Address',  icon:<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>, val:(lead as any).property_address||[lead.contact_city,lead.contact_state].filter(Boolean).join(', ')||'—', copy:null},
                                {label:'Source',   icon:<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>, val:(lead.lead_source||'—').replace(/_/g,' '), copy:null},
                                {label:'Job Date', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>, val:fmt(lead.scheduled_date), copy:null},
                                {label:'Follow-up',icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, val:lead.follow_up_date
                                  ?<span style={{display:'flex',alignItems:'center',gap:5}}>{fmt(lead.follow_up_date)}{isOverdue(lead.follow_up_date)&&<span style={{fontSize:T.fontBadge,padding:'1px 6px',borderRadius:20,background:t.dangerBg,color:'#A32D2D',fontWeight:600}}>Overdue</span>}</span>
                                  :'—', copy:null},
                              ] as {label:string;icon:React.ReactNode;val:React.ReactNode;copy:string|null}[]).reduce((rows:any[][], cell,i)=>{
                                if(i%2===0) rows.push([cell]); else rows[rows.length-1].push(cell)
                                return rows
                              },[]).map((row,ri)=>(
                                <div key={ri} style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:ri%2===1?t.tableRowAlt:card,borderBottom:ri<2?`1px solid ${bdr}`:'none'}}>
                                  {row.map((cell:any)=>(
                                    <div key={cell.label} style={{padding:'14px 16px',borderRight:row.indexOf(cell)===0?`1px solid ${bdr}`:'none'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={tsu} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{cell.icon}</svg>
                                        <span style={{fontSize:11,fontWeight:600,color:tsu,letterSpacing:'0.01em'}}>{cell.label}</span>
                                      </div>
                                      <div style={{fontSize:T.fontBody,fontWeight:600,color:tp,display:'flex',alignItems:'center',gap:4,wordBreak:'break-word'}}>
                                        {cell.val}
                                        {cell.copy&&<CopyBtn text={cell.copy} color={ts}/>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>

                            {isRoofing&&(
                              <InsuranceClaimFields leadId={lead.id} proId={session!.id} initial={(lead as any).insurance_data??{}} darkMode={dk}
                                onSaved={(data)=>setLead(l=>l?{...l,insurance_data:data} as any:l)}/>
                            )}

                            {/* Notes */}
                            <div style={{marginTop:T.sp4,paddingTop:T.sp4,borderTop:`1px solid ${bdr}`}}>
                              <div style={{fontSize:T.fontSub,fontWeight:700,color:ts,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:T.sp3}}>Notes</div>
                              {lead.notes&&(
                                <div style={{fontSize:T.fontBody,color:tb,lineHeight:1.65,whiteSpace:'pre-wrap',marginBottom:T.sp3,padding:'10px 12px',background:t.cardBgAlt,borderRadius:T.radSm,border:`1px solid ${bdr}`}}>
                                  {lead.notes}
                                </div>
                              )}
                              <div style={{display:'flex',gap:T.sp2}}>
                                <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&noteText.trim()){e.preventDefault();saveNote()}}}
                                  placeholder="Add a note..."
                                  style={{flex:1,fontSize:T.fontBody,padding:'9px 12px',borderRadius:T.radSm,border:`1px solid ${t.inputBorder}`,background:t.inputBg,color:tp,outline:'none',fontFamily:'inherit'}}/>
                                <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                                  style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',fontSize:T.fontSub,fontWeight:700,cursor:'pointer',opacity:!noteText.trim()?0.4:1}}>
                                  {savingNote?'...':'Save'}
                                </button>
                              </div>
                            </div>

                            {lead.message&&(
                              <div style={{marginTop:T.sp3,padding:'12px 14px',background:t.cardBgAlt,borderRadius:T.radSm,border:`1px solid ${bdr}`}}>
                                <div style={{fontSize:9,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Original message</div>
                                <div style={{fontSize:T.fontBody,color:tb,lineHeight:1.65,fontStyle:'italic'}}>"{lead.message}"</div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Edit mode */}
                        {isEditing&&(
                          <>
                            <div style={{display:'flex',flexDirection:'column',gap:T.sp3+2}}>
                              {/* Address — full width */}
                              <div>
                                <label style={labelCls}>Property Address</label>
                                <input value={eAddr} onChange={e=>setEAddr(e.target.value)} placeholder="123 Maple St, Jacksonville, FL 32207" style={inputCls}/>
                              </div>
                              {/* Phone + Email */}
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:T.sp3}}>
                                <div><label style={labelCls}>Phone</label><input value={ePhone} onChange={e=>setEPhone(e.target.value)} style={inputCls}/></div>
                                <div><label style={labelCls}>Email</label><input value={eEmail} onChange={e=>setEEmail(e.target.value)} style={inputCls}/></div>
                              </div>
                              {/* City + State */}
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:T.sp3}}>
                                <div><label style={labelCls}>City</label><input value={eCity} onChange={e=>setECity(e.target.value)} placeholder="Jacksonville" style={inputCls}/></div>
                                <div><label style={labelCls}>State</label>
                                  <select value={eState} onChange={e=>setEState(e.target.value)} style={inputCls}>
                                    <option value="">—</option>
                                    {US_STATES.map(([code,name])=><option key={code} value={code}>{code} — {name}</option>)}
                                  </select>
                                </div>
                              </div>
                              {/* Source */}
                              <div><label style={labelCls}>Source</label>
                                <select value={eSrc} onChange={e=>setESrc(e.target.value)} style={inputCls}>
                                  {SOURCE_OPTIONS.map(s=><option key={s}>{s}</option>)}
                                </select>
                              </div>
                              {/* Job date + time */}
                              <div><label style={labelCls}>Job Date &amp; Time</label>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:T.sp2}}>
                                  <input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                                  <input type="time" value={eTime} onChange={e=>setETime(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                                </div>
                              </div>
                              {/* Follow-up */}
                              <div><label style={labelCls}>Follow-up Date</label>
                                <input type="date" value={eFU} onChange={e=>setEFU(e.target.value)} style={{...inputCls,colorScheme:dk?'dark':'light'}}/>
                              </div>
                              {/* Notes */}
                              <div><label style={labelCls}>Notes</label>
                                <textarea value={eNotes} onChange={e=>setENotes(e.target.value)} rows={4} maxLength={500}
                                  style={{...inputCls,resize:'vertical',lineHeight:1.6,minHeight:90}}/>
                                <div style={{fontSize:T.fontSub,color:tsu,textAlign:'right',marginTop:3}}>{eNotes.length}/500</div>
                              </div>
                            </div>
                            {/* Edit actions */}
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:T.sp3,marginTop:T.sp4,paddingTop:T.sp4,borderTop:`1px solid ${bdr}`}}>
                              <button onClick={()=>setIsEditing(false)} style={{padding:'12px',borderRadius:T.radSm,border:`1px solid ${bdr}`,background:t.cardBgAlt,color:tp,cursor:'pointer',fontSize:T.fontEmphasis,fontWeight:600}}>Cancel</button>
                              <button onClick={saveEdit} disabled={eSaving} style={{padding:'12px',borderRadius:T.radSm,border:'none',background:`linear-gradient(135deg,${BRAND.teal},${BRAND.tealLight})`,color:'#fff',cursor:'pointer',fontSize:T.fontEmphasis,fontWeight:700}}>
                                {eSaving?'Saving…':'Save Changes'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ── Tab: Photos ─────────────────────────────────── */}
                    {tab==='photos'&&isRoofing&&(
                      <div style={{padding:`${T.sp4}px ${T.sp4+2}px`}}>
                        <JobPhotoLog leadId={lead.id} proId={session!.id} isRoofing={isRoofing} darkMode={dk}/>
                      </div>
                    )}

                    {/* ── Tab: Estimate ────────────────────────────────── */}
                    {tab==='estimate'&&(
                      <div style={{padding:`${T.sp4}px ${T.sp4+2}px`}}>
                        {est?(
                          <div style={{display:'flex',flexDirection:'column',gap:T.sp3}}>
                            <div style={{padding:'16px 18px',borderRadius:T.radMd,background:t.successBg,border:`1px solid ${t.successBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                              <div>
                                <div style={{fontSize:9,fontWeight:700,color:BRAND.teal,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Estimate #{est.estimate_number}</div>
                                <div style={{fontSize:28,fontWeight:800,color:BRAND.teal,letterSpacing:'-0.03em'}}>${est.total.toLocaleString('en-US',{minimumFractionDigits:2})}</div>
                              </div>
                              <button onClick={()=>router.push(`/dashboard/estimates/${est.id}?from=pipeline&lead_id=${id}`)}
                                style={{padding:'10px 18px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',fontSize:T.fontBody,fontWeight:700,cursor:'pointer'}}>
                                Open
                              </button>
                            </div>
                            {inv&&(
                              <div style={{padding:'14px 18px',borderRadius:T.radSm,background:t.warningBg,border:`1px solid ${t.warningBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                <div>
                                  <div style={{fontSize:9,fontWeight:700,color:'#B45309',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Invoice #{inv.invoice_number}</div>
                                  <div style={{fontSize:T.fontHeading,fontWeight:700,color:'#B45309'}}>${inv.balance_due.toLocaleString('en-US',{minimumFractionDigits:2})} due</div>
                                </div>
                                <button onClick={()=>router.push(`/dashboard/invoices/${inv.id}`)}
                                  style={{padding:'9px 16px',borderRadius:T.radSm,border:'none',background:'#B45309',color:'#fff',fontSize:T.fontBody,fontWeight:700,cursor:'pointer'}}>
                                  View
                                </button>
                              </div>
                            )}
                          </div>
                        ):(
                          <div style={{textAlign:'center',padding:'40px 0'}}>
                            <div style={{fontSize:T.fontBody,color:ts,marginBottom:T.sp4}}>No estimate yet</div>
                            <button onClick={createEst} disabled={creatingEst}
                              style={{padding:'11px 28px',borderRadius:T.radSm,border:'none',background:BRAND.teal,color:'#fff',fontSize:T.fontBody,fontWeight:700,cursor:'pointer',opacity:creatingEst?0.7:1}}>
                              {creatingEst?'Creating...':'+ Create Estimate'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Tab: Activity ────────────────────────────────── */}
                    {tab==='activity'&&(
                      <div style={{padding:`${T.sp4}px ${T.sp4+2}px`}}>
                        {acts.length===0
                          ?<div style={{textAlign:'center',padding:'40px 0',color:ts,fontSize:T.fontBody}}>No activity yet.</div>
                          :acts.map((item,i)=>{
                            const ic = item.type==='note'?'#854F0B':item.type==='quote'?'#3C3489':BRAND.teal
                            const ib = item.type==='note'?'#FAEEDA':item.type==='quote'?'#EEEDFE':'#E1F5EE'
                            return (
                              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:T.sp3,padding:`${T.sp3}px 0`,borderBottom:i<acts.length-1?`1px solid ${bdr}`:'none'}}>
                                <div style={{width:32,height:32,borderRadius:'50%',background:ib,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                  <Svg size={14} stroke={ic}>
                                    {item.type==='note'     &&<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type==='quote'    &&<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type==='created'  &&<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type==='scheduled'&&<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </Svg>
                                </div>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:T.fontBody,fontWeight:600,color:tp}}>{item.title}</div>
                                  <div style={{fontSize:T.fontSub,color:ts,marginTop:2}}>{item.sub}</div>
                                </div>
                                <div style={{fontSize:T.fontSub,color:tsu,flexShrink:0,paddingTop:2}}>
                                  {new Date(item.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                                </div>
                              </div>
                            )
                          })
                        }
                      </div>
                    )}
                  </div>{/* end tabs card */}
                </div>{/* end left col */}

                {/* ══ RIGHT COLUMN (desktop sticky) ══ */}
                <div className="hidden lg:block">
                  <div style={{position:'sticky',top:20,display:'flex',flexDirection:'column',gap:T.sp3}}>

                    {/* Activity */}
                    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:T.radLg,overflow:'hidden',boxShadow:dk?'none':'0 2px 10px rgba(0,0,0,0.05)'}}>
                      <div style={{padding:`${T.sp3}px ${T.sp4}px`,borderBottom:`1px solid ${bdr}`}}>
                        <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em'}}>Activity</div>
                      </div>
                      <div style={{padding:`${T.sp3}px ${T.sp4}px`}}>
                        {acts.length===0
                          ?<div style={{fontSize:T.fontSub,color:tsu,textAlign:'center',padding:'12px 0'}}>No activity yet</div>
                          :acts.slice(0,5).map((item,i)=>{
                            const ic = item.type==='note'?'#854F0B':item.type==='quote'?'#6366F1':BRAND.teal
                            const ib = item.type==='note'?'#FAEEDA':item.type==='quote'?'#EEF2FF':'#E1F5EE'
                            return (
                              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:T.sp2,paddingBottom:i<Math.min(acts.length,5)-1?T.sp2:0,marginBottom:i<Math.min(acts.length,5)-1?T.sp2:0,borderBottom:i<Math.min(acts.length,5)-1?`1px solid ${t.divider}`:'none'}}>
                                <div style={{width:22,height:22,borderRadius:'50%',background:ib,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                                  <Svg size={11} stroke={ic}>
                                    {item.type==='created'  &&<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                                    {item.type==='note'     &&<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                                    {item.type==='quote'    &&<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
                                    {item.type==='scheduled'&&<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                                  </Svg>
                                </div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:T.fontSub,fontWeight:600,color:tp,lineHeight:1.3}}>{item.title}</div>
                                  <div style={{fontSize:T.fontBadge,color:tsu,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.sub}</div>
                                </div>
                                <div style={{fontSize:T.fontBadge,color:tsu,flexShrink:0,whiteSpace:'nowrap',paddingTop:1}}>
                                  {new Date(item.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                                </div>
                              </div>
                            )
                          })
                        }
                      </div>
                    </div>

                    {/* Insights */}
                    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:T.radLg,overflow:'hidden',boxShadow:dk?'none':'0 2px 10px rgba(0,0,0,0.05)'}}>
                      <div style={{padding:`${T.sp3}px ${T.sp4}px`,borderBottom:`1px solid ${bdr}`,display:'flex',alignItems:'center',gap:6}}>
                        <Svg size={13} stroke="#6366F1"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>
                        <div style={{fontSize:10,fontWeight:700,color:tsu,textTransform:'uppercase',letterSpacing:'0.07em'}}>Insights</div>
                      </div>
                      <div style={{padding:`${T.sp3}px ${T.sp4}px`,display:'flex',flexDirection:'column',gap:T.sp3}}>
                        {(()=>{
                          const mins = Math.floor((Date.now()-new Date(lead.created_at).getTime())/60000)
                          const hour = new Date().getHours()
                          const items = [
                            ...(mins<=30?[{color:'#10B981',title:'Hot lead',body:`Responded ${mins<1?'just now':`${mins}m ago`}`,sub:'Call within 1 hour',icon:<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>}]:[]),
                            {color:'#6366F1',title:'Best callback window',body:hour<17?'5:00 PM – 7:00 PM':hour<20?'Right now':'10 AM – 12 PM',sub:'Today',icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>},
                            ...(isRoofing?[{color:'#F59E0B',title:'Roof size estimate',body:'28–34 squares',sub:'Based on satellite scan',icon:<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}]:[]),
                          ]
                          return items.map((ins,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                              <div style={{width:28,height:28,borderRadius:6,background:ins.color+'1A',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                <Svg size={13} stroke={ins.color}>{ins.icon}</Svg>
                              </div>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:T.fontBadge,fontWeight:700,color:tp}}>{ins.title}</div>
                                <div style={{fontSize:T.fontBody,fontWeight:600,color:ins.color,marginTop:1}}>{ins.body}</div>
                                <div style={{fontSize:T.fontBadge,color:tsu,marginTop:1}}>{ins.sub}</div>
                              </div>
                            </div>
                          ))
                        })()}
                      </div>
                    </div>

                  </div>
                </div>{/* end right col */}

              </div>{/* end grid */}
            </>
          )
        })()}
      </div>
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
