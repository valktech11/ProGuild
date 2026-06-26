'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { computeSB2ADeadlines, SB2A_DISCLAIMER } from '@/lib/fl/sb2a'
import { FL_CARRIERS } from '@/lib/roofing/carriers'
import { computeRoofRuleEligibility, ROOF_RULE_DISCLAIMER } from '@/lib/fl/roofAge'

export interface InsuranceClaimData {
  insurance_claim:        boolean
  insurance_company:      string
  claim_number:           string
  adjuster_name:          string
  adjuster_phone:         string
  adjuster_appointment:   string
  claim_status:           string
  approved_amount:        string
  supplement_amount:      string
  deductible:             string
  date_of_loss:           string   // YYYY-MM-DD — FL SB 2-A clock start
  roof_install_date:      string   // YYYY-MM-DD — roof build/last reroof (25% rule)
}

interface Props {
  leadId:   string
  proId:    string
  initial:  Partial<InsuranceClaimData>
  darkMode: boolean
  propertyState?: string | null   // gate FL-only intelligence to FL properties
  locked?: boolean                // hard-disable the claim-type toggle (won/lost jobs)
  onSaved:  (data: InsuranceClaimData) => void
}

const CLAIM_STATUSES = [
  { value: 'Filed',               color: '#64748B', bg: '#F8FAFC', group: 'Claim progress', effect: 'track' },
  { value: 'Adjuster Scheduled',  color: '#0284C7', bg: '#E0F2FE', group: 'Claim progress', effect: 'track' },
  { value: 'Adjuster Visited',    color: '#7C3AED', bg: '#F5F3FF', group: 'Claim progress', effect: 'track' },
  { value: 'Approved',            color: '#059669', bg: '#ECFDF5', group: 'Decision',       effect: 'advance' },
  { value: 'Denied',              color: '#DC2626', bg: '#FEF2F2', group: 'Decision',       effect: 'denied' },
  { value: 'Supplement Filed',    color: '#D97706', bg: '#FFFBEB', group: 'Supplement',     effect: 'track' },
  { value: 'Supplement Approved', color: '#0891B2', bg: '#ECFEFF', group: 'Supplement',     effect: 'track' },
  { value: 'Closed',              color: '#374151', bg: '#F3F4F6', group: 'Closed',         effect: 'track' },
] as const

// Phased claim progression — drives the panel layout. Most "statuses" are derived
// from data the roofer already enters (adjuster date) rather than a manual dropdown.
// claim_status remains the DB source of truth (and pipeline trigger on 'Approved').
const PHASE_STEPS = ['Filed', 'Adjuster', 'Decision', 'Supplement', 'Closed'] as const
function derivePhase(status: string, hasAppt: boolean): { index: number; denied: boolean } {
  switch (status) {
    case 'Denied':              return { index: 2, denied: true }
    case 'Approved':            return { index: 2, denied: false }
    case 'Supplement Filed':
    case 'Supplement Approved': return { index: 3, denied: false }
    case 'Closed':              return { index: 4, denied: false }
    default:                    return { index: hasAppt ? 1 : 0, denied: false }  // Filed / legacy adjuster statuses
  }
}

const TEAL   = '#0F766E'
const TEAL_L = '#14B8A6'
const NAVY   = '#0A1628'

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}-${d.slice(3)}`
  return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
}

function parseCurrency(v: string | number) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const n = parseFloat(String(v).replace(/[$,]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : {}}>
      <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function FInput({ icon, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  const [f, setF] = useState(false)
  return (
    <div style={{ position:'relative' }}>
      {icon && <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color: f ? TEAL : '#94A3B8', transition:'color 0.15s' }}>{icon}</div>}
      <input {...p}
        onFocus={e => { setF(true); (p as any).onFocus?.(e) }}
        onBlur={e => { setF(false); (p as any).onBlur?.(e) }}
        style={{
          width:'100%', boxSizing:'border-box' as const,
          padding: icon ? '9px 12px 9px 34px' : '9px 12px',
          border:`1.5px solid ${f ? TEAL : '#E2E8F0'}`,
          borderRadius:9, fontSize:13, outline:'none',
          background: p.disabled ? '#F1F5F9' : (f ? '#fff' : '#F7F6F3'),
          color: p.disabled ? '#64748B' : NAVY,
          cursor: p.disabled ? 'not-allowed' : 'auto',
          boxShadow: f ? '0 0 0 3px rgba(15,118,110,0.1)' : 'none',
          transition:'all 0.15s',
          ...(p.style||{}),
        }}
      />
    </div>
  )
}

export default function InsuranceClaimFields({ leadId, proId, initial, darkMode: dk, propertyState, locked = false, onSaved }: Props) {
  // FL claims-intelligence (SB 2-A, 25% rule) is Florida-specific by design — gate it.
  const isFL = (propertyState ?? '').trim().toUpperCase() === 'FL'
  // Responsive: collapse internal 2-col / 3-col grids to single column on narrow
  // screens so the FL deadline + 25%-rule callout cards stop clipping. Matches
  // the parent page >=900px breakpoint. Desktop (isWide) is unchanged.
  const [isWide, setIsWide] = useState(true)
  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [open,   setOpen]   = useState(initial.insurance_claim ?? false)
  const [detailsOpen, setDetailsOpen] = useState(() => !(initial.insurance_company || initial.claim_number))  // fresh claim opens expanded; existing collapses to summary
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [saved,  setSaved]  = useState(false)

  const [fields, setFields] = useState<InsuranceClaimData>({
    insurance_claim:      initial.insurance_claim      ?? false,
    insurance_company:    initial.insurance_company    ?? '',
    claim_number:         initial.claim_number         ?? '',
    adjuster_name:        initial.adjuster_name        ?? '',
    adjuster_phone:       initial.adjuster_phone != null ? String(initial.adjuster_phone) : '',
    adjuster_appointment: (() => {
      const raw = initial.adjuster_appointment
      if (!raw) return ''
      // datetime-local requires "YYYY-MM-DDTHH:MM" — strip timezone offset and seconds
      // "2026-05-28T14:00:00+00:00" → "2026-05-28T14:00"
      // "2026-05-28T14:00:00.000Z" → "2026-05-28T14:00"
      const s = String(raw).replace('Z','').replace(/\+\d{2}:\d{2}$/,'').replace(/-\d{2}:\d{2}$/,'')
      return s.length >= 16 ? s.slice(0, 16) : s
    })(),
    claim_status:         initial.claim_status         ?? 'Filed',
    approved_amount:      initial.approved_amount != null ? String(initial.approved_amount) : '',
    supplement_amount:    initial.supplement_amount != null ? String(initial.supplement_amount) : '',
    deductible:           initial.deductible != null ? String(initial.deductible) : '',
    date_of_loss:         initial.date_of_loss         ?? '',
    roof_install_date:    initial.roof_install_date    ?? '',
  })

  function set(key: keyof InsuranceClaimData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (locked) return   // won/lost: claim record is frozen for audit
      setSaved(false)
      const val = key === 'adjuster_phone'
        ? formatPhone(e.target.value)
        : e.target.value
      setFields(f => ({ ...f, [key]: val }))
    }
  }

  // Decision/phase buttons set claim_status directly (replaces the old 8-option dropdown)
  // and persist immediately — recording a decision IS the save, no separate click needed.
  function setStatus(v: string) {
    if (locked) return
    setSaved(false)
    setFields(f => ({ ...f, claim_status: v }))
    void handleSave({ claim_status: v })
  }

  const handleToggle = useCallback(async () => {
    if (locked) return   // won/lost: insurance type is locked to protect claim/reporting history
    const next = !open
    setOpen(next)
    setFields(f => {
      const updated = { ...f, insurance_claim: next }
      onSaved(updated)
      return updated
    })
    await fetch(`/api/leads/${leadId}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pro_id: proId, insurance_claim: next }),
    }).catch(() => {})
  }, [open, leadId, proId, onSaved, locked])

  const handleSave = useCallback(async (override?: Partial<InsuranceClaimData>) => {
    const f = { ...fields, ...(override || {}) }
    setSaving(true); setError(null); setSaved(false)
    const phone = f.adjuster_phone.replace(/\D/g,'')
    if (phone.length > 0 && phone.length < 10) {
      setError('Adjuster phone must be 10 digits'); setSaving(false); return
    }
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          pro_id:               proId,
          insurance_claim:      f.insurance_claim,
          insurance_company:    f.insurance_company    || null,
          claim_number:         f.claim_number         || null,
          adjuster_name:        f.adjuster_name        || null,
          adjuster_phone:       f.adjuster_phone       || null,
          adjuster_appointment: f.adjuster_appointment || null,
          claim_status:         f.claim_status         || null,
          approved_amount:      parseCurrency(f.approved_amount) || null,
          supplement_amount:    parseCurrency(f.supplement_amount) || null,
          deductible:           parseCurrency(f.deductible) || null,
          date_of_loss:         f.date_of_loss         || null,
          roof_install_date:    f.roof_install_date    || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as {error?: string}).error ?? `HTTP ${res.status}`)
      }
      setSaved(true)

      // ── Hook 1: Approved → auto-advance pipeline to insurance_approved ────
      // AWAIT these so onSaved (and its activity refresh) runs after events are written.
      if (f.claim_status === 'Approved') {
        try {
          await fetch(`/api/leads/${leadId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pro_id: proId, lead_status: 'insurance_approved' }),
          })
          await fetch(`/api/leads/${leadId}/events`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pro_id: proId, event_type: 'insurance_auto_approved' }),
          })
        } catch { /* non-fatal */ }
      }

      // ── Hook 2: Supplement Filed → log activity entry ─────────────────────
      if (f.claim_status === 'Supplement Filed') {
        try {
          const sres = await fetch(`/api/roofing/supplement?lead_id=${leadId}&pro_id=${proId}`)
          const d = await sres.json()
          const total = d.session?.result_json?.total_supplement_estimate ?? null
          const note  = total
            ? `Supplement filed — estimated additional: $${total.toLocaleString()}`
            : 'Supplement filed'
          await fetch(`/api/leads/${leadId}/events`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pro_id: proId, event_type: 'supplement_filed', note }),
          })
        } catch { /* non-fatal */ }
      }

      // ── Hook 3: Supplement Approved → log activity entry ──────────────────
      if (f.claim_status === 'Supplement Approved') {
        try {
          await fetch(`/api/leads/${leadId}/events`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pro_id: proId, event_type: 'supplement_approved',
              note: parseCurrency(f.supplement_amount) > 0
                ? `Supplement approved — additional $${parseCurrency(f.supplement_amount).toLocaleString()}`
                : 'Supplement approved' }),
          })
        } catch { /* non-fatal */ }
      }

      // Now that hooks (and their events) are committed, notify parent → triggers refresh.
      onSaved(f)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }, [fields, leadId, proId, onSaved])

  // Re-sync fields when initial prop changes (e.g. lead data arrives after mount)
  const initialised = useRef(false)
  useEffect(() => {
    // Only sync if we have real data and haven't been edited by user yet
    if (!initial.claim_number && !initial.insurance_company && !initial.approved_amount && !initial.date_of_loss && !initial.roof_install_date) return
    if (initialised.current) return  // user has started editing — don't overwrite
    initialised.current = true
    setOpen(initial.insurance_claim ?? false)
    if (initial.insurance_company || initial.claim_number) setDetailsOpen(false)  // existing claim → start collapsed
    setFields({
      insurance_claim:      initial.insurance_claim      ?? false,
      insurance_company:    initial.insurance_company    ?? '',
      claim_number:         initial.claim_number         ?? '',
      adjuster_name:        initial.adjuster_name        ?? '',
      adjuster_phone:       initial.adjuster_phone != null ? String(initial.adjuster_phone) : '',
      adjuster_appointment: (() => {
        const raw = initial.adjuster_appointment
        if (!raw) return ''
        const d = new Date(raw)
        if (isNaN(d.getTime())) return ''
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      })(),
      claim_status:         initial.claim_status         ?? 'Filed',
      approved_amount:      initial.approved_amount != null ? String(initial.approved_amount) : '',
      supplement_amount:    initial.supplement_amount != null ? String(initial.supplement_amount) : '',
      deductible:           initial.deductible != null ? String(initial.deductible) : '',
      date_of_loss:         initial.date_of_loss         ?? '',
      roof_install_date:    initial.roof_install_date    ?? '',
    })
  }, [initial])

  // Computed net
  const approved   = parseCurrency(fields.approved_amount)
  const supplement = parseCurrency(fields.supplement_amount)
  const deductible = parseCurrency(fields.deductible)
  const net        = approved + supplement - deductible
  const isDenied     = fields.claim_status === 'Denied'
  const decided      = ['Approved','Denied','Supplement Filed','Supplement Approved','Closed'].includes(fields.claim_status)
  const phase        = derivePhase(fields.claim_status, !!fields.adjuster_appointment)
  // Claim-details collapse: once core details exist, default to a compact summary
  // line to keep the panel shallow. Empty claim → fields stay open so it's fillable.
  const hasCoreDetails = !!(fields.insurance_company || fields.claim_number)
  const showFields     = detailsOpen || !hasCoreDetails
  const urgentDl = (() => {
    if (!isFL || !fields.date_of_loss) return null
    const dls = computeSB2ADeadlines(fields.date_of_loss)
    if (!dls || !dls.length) return null
    return dls[0]   // { label, daysLeft, status, dueDate }
  })()

  const activeStatus = CLAIM_STATUSES.find(s => s.value === fields.claim_status) ?? CLAIM_STATUSES[0]

  const cardBg  = dk ? '#1E293B' : '#fff'
  const cardBdr = dk ? '#334155' : '#E2E8F0'

  return (
    <div style={{
      background: cardBg, borderRadius: 14, marginBottom: 16,
      border: `1px solid ${open ? 'rgba(15,118,110,0.25)' : cardBdr}`,
      boxShadow: open ? '0 4px 20px rgba(15,118,110,0.08)' : '0 1px 4px rgba(10,22,40,0.05)',
      overflow: 'hidden', transition: 'all 0.2s',
    }}>

      {/* ── Header row ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', cursor: locked ? 'default' : 'pointer', background: open ? (dk ? 'rgba(15,118,110,0.1)' : 'rgba(15,118,110,0.04)') : 'transparent' }}
        onClick={handleToggle}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Icon box */}
          <div style={{ width:36, height:36, borderRadius:10, background: open ? `linear-gradient(135deg,${TEAL},${TEAL_L})` : (dk ? '#1E293B' : '#F0FDFA'), border: open ? 'none' : `1px solid ${dk ? '#334155' : 'rgba(15,118,110,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow: open ? '0 4px 12px rgba(15,118,110,0.35)' : 'none', transition:'all 0.2s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={open ? '#fff' : TEAL} strokeWidth="2" strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color: dk ? '#F1F5F9' : NAVY, letterSpacing:'-0.01em' }}>Insurance Claim</div>
            {open && fields.insurance_company ? (
              <div style={{ fontSize:12.5, fontWeight:600, color: dk ? '#CBD5E1' : '#475569', marginTop:2 }}>
                {fields.insurance_company}{fields.claim_number ? <> · <span style={{ fontWeight:800, color: dk ? '#F1F5F9' : NAVY }}>#{fields.claim_number}</span></> : null}
              </div>
            ) : (
              <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>
                {open ? 'Fill in claim details below' : 'Toggle to log insurance claim details'}
              </div>
            )}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Status badge when collapsed */}
          {!open && fields.insurance_company && (
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:100, background:activeStatus.bg, color:activeStatus.color, border:`1px solid ${activeStatus.color}25` }}>
              {fields.claim_status}
            </span>
          )}
          {/* Toggle (locked on won/lost jobs to protect claim history) */}
          {locked ? (
            <div title="Insurance type is locked on completed jobs"
              style={{ display:'flex', alignItems:'center', gap:6, opacity:0.55 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={dk ? '#94A3B8' : '#64748B'} strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div style={{ width:44, height:24, borderRadius:12, background: open ? TEAL : (dk ? '#334155' : '#CBD5E1'), position:'relative', flexShrink:0 }}>
                <div style={{ position:'absolute', width:18, height:18, borderRadius:'50%', background:'#fff', top:3, left: open ? 23 : 3, boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
              </div>
            </div>
          ) : (
            <div style={{ width:44, height:24, borderRadius:12, background: open ? TEAL : (dk ? '#334155' : '#CBD5E1'), position:'relative', transition:'background 0.2s', flexShrink:0 }}>
              <div style={{ position:'absolute', width:18, height:18, borderRadius:'50%', background:'#fff', top:3, left: open ? 23 : 3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
            </div>
          )}
        </div>
      </div>

      {/* ── Fields ── */}
      {open && (
        <div style={{ padding:'0 20px 20px' }}>
          <div style={{ height:1, background: dk ? '#334155' : 'rgba(15,118,110,0.1)', marginBottom:20 }}/>

          <div style={{ display:'grid', gridTemplateColumns:isWide?'1fr 1fr':'1fr', gap:14 }}>

            {/* Claim details collapse to a summary line once filled — keeps the panel shallow */}
            {!showFields && (
              <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'11px 14px', borderRadius:10, background: dk?'rgba(255,255,255,0.03)':'#F8FAFC', border:`1px solid ${dk?'#334155':'#E2E8F0'}`, flexWrap:'wrap' as const }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:dk?'#F1F5F9':NAVY }}>
                    {fields.date_of_loss ? <>Date of loss · {fields.date_of_loss}</> : 'Claim details'}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:5, flexWrap:'wrap' as const }}>
                    {fields.adjuster_name && <span style={{ fontSize:12.5, fontWeight:600, color:dk?'#CBD5E1':'#475569' }}>Adj. {fields.adjuster_name}</span>}
                    {urgentDl && (() => {
                      const tone: Record<string,[string,string]> = { expired:['#FEF2F2','#DC2626'], urgent:['#FFF7ED','#EA580C'], approaching:['#FFFBEB','#D97706'], ok:['#ECFDF5','#059669'] }
                      const [bg,fg] = tone[urgentDl.status] || tone.approaching
                      return (
                        <span title={urgentDl.label} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:800, color:fg, background:bg, border:`1px solid ${fg}33`, borderRadius:100, padding:'3px 10px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {Math.abs(urgentDl.daysLeft)}d {urgentDl.status === 'expired' ? 'overdue' : 'left'}
                        </span>
                      )
                    })()}
                    {!fields.adjuster_name && !urgentDl && <span style={{ fontSize:11.5, color:'#94A3B8' }}>Tap edit to add claim details</span>}
                  </div>
                </div>
                {!locked && (
                  <button onClick={()=>setDetailsOpen(true)} style={{ fontSize:12, fontWeight:700, color:TEAL, background:'transparent', border:`1px solid ${TEAL}40`, borderRadius:7, padding:'6px 12px', cursor:'pointer', whiteSpace:'nowrap' as const }}>Edit details</button>
                )}
              </div>
            )}

            {showFields && hasCoreDetails && !locked && (
              <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.07em', textTransform:'uppercase' as const, color: dk?'#94A3B8':'#64748B' }}>Claim details</span>
                <button onClick={()=>setDetailsOpen(false)} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:TEAL, background:'transparent', border:`1px solid ${TEAL}40`, borderRadius:7, padding:'5px 11px', cursor:'pointer' }}>
                  Collapse
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
              </div>
            )}

            {showFields && (<>
            {/* Row 1: Insurer + Claim # */}
            <Field label="Insurance company">
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <input list="pg-carriers" value={fields.insurance_company} onChange={set('insurance_company')} disabled={locked} placeholder="Start typing — pick from the list"
                  style={{ width:'100%', boxSizing:'border-box' as const, padding:'9px 12px 9px 34px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'#F7F6F3', color:NAVY, transition:'all 0.15s' }}
                  onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                  onBlur={e => { e.target.style.borderColor='#E2E8F0'; e.target.style.background='#F7F6F3'; e.target.style.boxShadow='none' }}
                />
                <datalist id="pg-carriers">
                  {FL_CARRIERS.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </Field>
            <Field label="Claim number">
              <FInput value={fields.claim_number} onChange={set('claim_number')} disabled={locked} placeholder="SF-2026-001"
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
              />
            </Field>

            {isFL && (<>
            {/* Row 1b: Date of loss + FL SB 2-A deadlines (full width) */}
            <div style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:isWide?'1fr 1fr':'1fr', gap:14, alignItems:'start' }}>
              <Field label="Date of loss">
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <input type="date" value={fields.date_of_loss} onChange={set('date_of_loss')} disabled={locked}
                    style={{ width:'100%', boxSizing:'border-box' as const, padding:'9px 12px 9px 34px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'#F7F6F3', color:NAVY, transition:'all 0.15s' }}
                    onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                    onBlur={e => { e.target.style.borderColor='#E2E8F0'; e.target.style.background='#F7F6F3'; e.target.style.boxShadow='none' }}
                  />
                </div>
                <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>
                  Storm claims: hurricane landfall / NOAA date &#8212; not the discovery date.
                </div>
              </Field>
              <div>
                {(() => {
                  const dls = computeSB2ADeadlines(fields.date_of_loss)
                  if (!dls) return (
                    <div style={{ fontSize:12, color: dk ? '#64748B' : '#94A3B8', paddingTop:24 }}>
                      Set a date of loss to track SB 2-A deadlines.
                    </div>
                  )
                  const palette: Record<string, [string, string]> = {
                    expired:     ['#FEF2F2', '#DC2626'],
                    urgent:      ['#FFF7ED', '#EA580C'],
                    approaching: ['#FFFBEB', '#D97706'],
                    ok:          ['#ECFDF5', '#059669'],
                  }
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.03em', textTransform:'uppercase' as const, color: NAVY }}>
                        FL claim deadlines (SB 2-A)
                      </div>
                      {dls.map(d => {
                        const [bg, fg] = palette[d.status]
                        return (
                          <div key={d.key} style={{ display:'flex', alignItems:'stretch', background:bg, border:`1px solid ${fg}33`, borderRadius:9, overflow:'hidden' }}>
                            <div style={{ width:4, background:fg, flexShrink:0 }} />
                            <div style={{ flex:1, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px' }}>
                              <div>
                                <div style={{ fontSize:12.5, fontWeight:700, color: NAVY }}>{d.label}</div>
                                <div style={{ fontSize:11, color:'#64748B', fontVariantNumeric:'tabular-nums' as const, marginTop:1 }}>due {d.dueDate}</div>
                              </div>
                              <div style={{ textAlign:'right' as const, lineHeight:1 }}>
                                <div style={{ fontSize:19, fontWeight:800, color:fg, fontVariantNumeric:'tabular-nums' as const }}>{Math.abs(d.daysLeft)}d</div>
                                <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:fg, opacity:0.85, marginTop:2 }}>
                                  {d.status === 'expired' ? 'overdue' : 'left'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ fontSize:12, lineHeight:1.45, color: dk ? '#94A3B8' : '#475569' }}>{SB2A_DISCLAIMER}</div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Row 1c: Roof age + FL 25% rule eligibility (full width) */}
            <div style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:isWide?'1fr 1fr':'1fr', gap:14, alignItems:'start' }}>
              <Field label="Roof built / last reroofed">
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
                  </div>
                  <input type="date" value={fields.roof_install_date} onChange={set('roof_install_date')} disabled={locked}
                    style={{ width:'100%', boxSizing:'border-box' as const, padding:'9px 12px 9px 34px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'#F7F6F3', color:NAVY, transition:'all 0.15s' }}
                    onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                    onBlur={e => { e.target.style.borderColor='#E2E8F0'; e.target.style.background='#F7F6F3'; e.target.style.boxShadow='none' }}
                  />
                </div>
                <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>
                  Use the last reroof permit date. Threshold: Mar 1, 2009 (2007 FBC).
                </div>
              </Field>
              <div>
                {(() => {
                  const elig = computeRoofRuleEligibility(fields.roof_install_date)
                  const tone: Record<string, [string, string]> = {
                    exempt:  ['#EFF6FF', '#2563EB'],   // informational — limited 25%-rule leverage
                    subject: ['#ECFDF5', '#059669'],   // supports full-roof claim
                    unknown: ['#FFFBEB', '#D97706'],   // need the permit date
                  }
                  const [bg, fg] = tone[elig.verdict]
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.03em', textTransform:'uppercase' as const, color: NAVY }}>
                        Roof replacement eligibility (25% rule)
                      </div>
                      <div style={{ display:'flex', alignItems:'stretch', background:bg, border:`1px solid ${fg}33`, borderRadius:9, overflow:'hidden' }}>
                        <div style={{ width:4, background:fg, flexShrink:0 }} />
                        <div style={{ padding:'9px 12px' }}>
                          <div style={{ fontSize:12.5, fontWeight:700, color:fg }}>{elig.headline}</div>
                          <div style={{ fontSize:11.5, color: dk ? '#CBD5E1' : '#475569', marginTop:3, lineHeight:1.4 }}>{elig.detail}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, lineHeight:1.45, color: dk ? '#94A3B8' : '#475569' }}>{ROOF_RULE_DISCLAIMER}</div>
                    </div>
                  )
                })()}
              </div>
            </div>
            </>)}

            {/* Row 2: Adjuster name + phone */}
            <Field label="Adjuster name">
              <FInput value={fields.adjuster_name} onChange={set('adjuster_name')} disabled={locked} placeholder="John Doe"
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
            </Field>
            <Field label="Adjuster phone">
              <FInput value={fields.adjuster_phone} onChange={set('adjuster_phone')} disabled={locked}
                type="tel" placeholder="813-555-0142" inputMode="numeric" maxLength={12}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
              />
            </Field>

            {/* Row 3: Appointment (full width — status is now the phased decision block below) */}
            <Field label="Adjuster appointment" span>
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <input type="datetime-local" value={fields.adjuster_appointment} onChange={set('adjuster_appointment')} disabled={locked}
                  style={{ width:'100%', boxSizing:'border-box' as const, padding:'9px 12px 9px 34px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'#F7F6F3', color:NAVY, transition:'all 0.15s' }}
                  onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                  onBlur={e => { e.target.style.borderColor='#E2E8F0'; e.target.style.background='#F7F6F3'; e.target.style.boxShadow='none' }}
                />
              </div>
              <div style={{ fontSize:11, color:'#94A3B8', marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                You must be present at the property
              </div>
            </Field>
            </>)}

            {/* ── Claim progress + carrier decision (phased) ── */}
            <div style={{ gridColumn:'1 / -1', display:'flex', flexDirection:'column', gap:14, marginTop:6, paddingTop:18, borderTop:`1px solid ${dk ? '#334155' : '#E2E8F0'}` }}>

              <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.07em', textTransform:'uppercase' as const, color: dk ? '#94A3B8' : '#64748B' }}>Claim progress</div>

              {/* Phase strip */}
              <div style={{ display:'flex', alignItems:'flex-start' }}>
                {PHASE_STEPS.map((label, i) => {
                  const done       = !phase.denied && i < phase.index
                  const active     = !phase.denied && i === phase.index
                  const deniedStep = phase.denied && i === 2
                  // Adjuster step is only truly "done" if an appointment was recorded;
                  // otherwise it was bypassed (e.g. carrier approved without us logging it).
                  const skipped    = i === 1 && done && !fields.adjuster_appointment
                  const dot = deniedStep ? '#DC2626' : active ? TEAL : (done && !skipped) ? '#059669' : (dk ? '#334155' : '#CBD5E1')
                  const txt = deniedStep ? '#DC2626' : active ? (dk ? '#5EEAD4' : TEAL) : skipped ? '#94A3B8' : done ? '#059669' : '#94A3B8'
                  return (
                    <div key={label} style={{ display:'flex', alignItems:'flex-start', flex: i < PHASE_STEPS.length - 1 ? 1 : '0 0 auto' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flexShrink:0 }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', boxShadow: (active || deniedStep) ? `0 0 0 3px ${dot}25` : 'none',
                          ...(skipped ? { background: dk ? '#1E293B' : '#fff', border:`2px solid ${dk ? '#475569' : '#CBD5E1'}`, boxSizing:'border-box' as const } : { background: dot }) }}/>
                        <span style={{ fontSize:11, fontWeight:700, color:txt, whiteSpace:'nowrap' as const }}>{deniedStep ? 'Denied' : label}</span>
                      </div>
                      {i < PHASE_STEPS.length - 1 && (
                        <div style={{ flex:1, height:2, marginTop:5, background: done ? '#059669' : (dk ? '#334155' : '#E2E8F0') }}/>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Contextual decision / financials */}
              {isDenied ? (
                null
              ) : !decided ? (
                <div style={{ padding:'14px 16px', borderRadius:10, background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC', border:`1px dashed ${dk ? '#334155' : '#CBD5E1'}` }}>
                  <div style={{ fontSize:13, fontWeight:700, color: dk ? '#F1F5F9' : NAVY, marginBottom:3 }}>Has the carrier issued their decision?</div>
                  <div style={{ fontSize:12, color: dk ? '#94A3B8' : '#64748B', marginBottom:12, lineHeight:1.45 }}>Record this once you receive the carrier&rsquo;s decision. Approving advances the lead and opens the supplement gap check further down — and only then asks for the amounts.</div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
                    <button onClick={()=>setStatus('Approved')} disabled={locked} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, height:40, padding:'0 20px', borderRadius:9, border:'none', background:'#059669', color:'#fff', fontSize:13, fontWeight:700, cursor: locked ? 'not-allowed' : 'pointer', boxShadow:'0 2px 8px rgba(5,150,105,0.22)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Carrier approved
                    </button>
                    <button onClick={()=>setStatus('Denied')} disabled={locked} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, height:40, padding:'0 18px', borderRadius:9, border:`1px solid ${dk ? '#475569' : '#E2E8F0'}`, background:'transparent', color: dk ? '#CBD5E1' : '#64748B', fontSize:13, fontWeight:700, cursor: locked ? 'not-allowed' : 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Denied
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Decision recorded as a fact — not a lingering button bar */}
                  {!locked && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' as const }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ width:22, height:22, borderRadius:'50%', background:'#059669', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                        <span style={{ fontSize:13.5, fontWeight:700, color: dk?'#F1F5F9':NAVY }}>
                          {fields.claim_status === 'Supplement Filed' ? 'Supplement filed'
                            : fields.claim_status === 'Supplement Approved' ? 'Supplement approved'
                            : fields.claim_status === 'Closed' ? 'Claim closed'
                            : 'Carrier approved'}
                        </span>
                      </div>
                      <button onClick={()=>setStatus('Filed')} style={{ fontSize:12, fontWeight:600, color:'#94A3B8', background:'transparent', border:'none', cursor:'pointer', textDecoration:'underline' }}>change</button>
                    </div>
                  )}

                  {/* Financials — the inputs ARE the summary; total computes live, no echo */}
                  <div style={{ padding: isWide ? '14px 16px' : '14px', borderRadius:10, background: dk?'rgba(255,255,255,0.03)':'#F8FAFC', border:`1px solid ${dk?'#334155':'#E2E8F0'}` }}>
                    <div style={{ display:'grid', gridTemplateColumns:isWide?'1fr 1fr 1fr':'1fr', gap:12 }}>
                      <Field label="Approved amount">
                        <FInput value={fields.approved_amount} onChange={set('approved_amount')} disabled={locked} placeholder="$0.00"
                          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                        />
                      </Field>
                      <Field label="Supplement amount">
                        <FInput value={fields.supplement_amount} onChange={set('supplement_amount')} disabled={locked} placeholder="$0.00"
                          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                        />
                      </Field>
                      <Field label="Deductible (homeowner)">
                        <FInput value={fields.deductible} onChange={set('deductible')} disabled={locked} placeholder="$0.00"
                          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                        />
                      </Field>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginTop:12, paddingTop:12, borderTop:`1px solid ${dk?'#334155':'#E2E8F0'}`, flexWrap:'wrap' as const }}>
                      <span style={{ fontSize:11.5, color: dk?'#94A3B8':'#94A3B8' }}>Approved + Supplement − Deductible</span>
                      <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                        <span style={{ fontSize:11, fontWeight:700, color: net>0?'#059669':'#94A3B8', textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>Insurance pays homeowner</span>
                        <span style={{ fontSize:22, fontWeight:900, color: net>0?'#059669':(dk?'#475569':'#94A3B8'), letterSpacing:'-0.03em' }}>${Math.max(net,0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Next-step status transitions */}
                  {!locked && fields.claim_status !== 'Closed' && (
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
                      {fields.claim_status === 'Approved' && (
                        <button onClick={()=>setStatus('Supplement Filed')} style={{ fontSize:12, fontWeight:700, color:'#D97706', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:7, padding:'6px 12px', cursor:'pointer' }}>File supplement →</button>
                      )}
                      {fields.claim_status === 'Supplement Filed' && (
                        <button onClick={()=>setStatus('Supplement Approved')} style={{ fontSize:12, fontWeight:700, color:'#0891B2', background:'#ECFEFF', border:'1px solid #A5F3FC', borderRadius:7, padding:'6px 12px', cursor:'pointer' }}>Supplement approved →</button>
                      )}
                      <button onClick={()=>setStatus('Closed')} style={{ fontSize:12, fontWeight:700, color:'#374151', background:'#F3F4F6', border:'1px solid #D1D5DB', borderRadius:7, padding:'6px 12px', cursor:'pointer' }}>Mark closed</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#DC2626', fontSize:13, fontWeight:500 }}>{error}</div>
          )}

          {/* Footer: locked message (won/lost) or save button */}
          {locked ? (
            <div style={{ marginTop:18, padding:'12px 14px', borderRadius:9, background: dk ? 'rgba(148,163,184,0.1)' : '#F1F5F9', border:`1px solid ${dk ? '#334155' : '#E2E8F0'}`, display:'flex', alignItems:'flex-start', gap:9 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={dk ? '#94A3B8' : '#64748B'} strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <div style={{ fontSize:12.5, color: dk ? '#94A3B8' : '#64748B', lineHeight:1.5 }}>
                Locked — this claim is part of the completed job record. Add a note for any updates.
              </div>
            </div>
          ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:18 }}>
            <div style={{ fontSize:11, color:'#94A3B8', display:'flex', alignItems:'center', gap:4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Saved to roofing job record
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {saved && (
                <span style={{ fontSize:12, color:'#059669', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Saved
                </span>
              )}
              <button onClick={()=>handleSave()} disabled={saving} style={{
                padding:'9px 22px', borderRadius:9, border:'none', cursor: saving ? 'wait' : 'pointer',
                background: saving ? '#94A3B8' : TEAL,
                color:'#fff', fontSize:13, fontWeight:700,
                boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.25)',
                display:'flex', alignItems:'center', gap:7, transition:'all 0.15s',
              }}>
                {saving
                  ? <><div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', animation:'pg-spin 0.7s linear infinite' }}/> Saving…</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Save claim details</>
                }
              </button>
            </div>
          </div>
          )}
        </div>
      )}
      <style>{`@keyframes pg-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
