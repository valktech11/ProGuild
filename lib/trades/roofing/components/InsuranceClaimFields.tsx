'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { computeSB2ADeadlines, SB2A_DISCLAIMER } from '@/lib/fl/sb2a'
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
  onSaved:  (data: InsuranceClaimData) => void
}

const CLAIM_STATUSES = [
  { value: 'Filed',               color: '#64748B', bg: '#F8FAFC', group: 'Claim progress', effect: 'track' },
  { value: 'Adjuster Scheduled',  color: '#0284C7', bg: '#E0F2FE', group: 'Claim progress', effect: 'track' },
  { value: 'Adjuster Visited',    color: '#7C3AED', bg: '#F5F3FF', group: 'Claim progress', effect: 'track' },
  { value: 'Approved',            color: '#059669', bg: '#ECFDF5', group: 'Decision',       effect: 'advance' },
  { value: 'Denied',              color: '#DC2626', bg: '#FEF2F2', group: 'Decision',       effect: 'denied' },
  { value: 'Supplement Filed',    color: '#D97706', bg: '#FFFBEB', group: 'Supplement',     effect: 'track' },
  { value: 'Supplement Approved', color: '#0891B2', bg: '#ECFEFF', group: 'Supplement',     effect: 'advance' },
  { value: 'Closed',              color: '#374151', bg: '#F3F4F6', group: 'Closed',         effect: 'track' },
] as const

const STATUS_GROUPS = ['Claim progress', 'Decision', 'Supplement', 'Closed'] as const

const EFFECT_HINT: Record<string, string> = {
  advance: 'Unlocks advancing the lead to Insurance Approved.',
  denied:  'Claim denied — convert to retail or mark lost below.',
  track:   'Tracking only — no pipeline change.',
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
          background: f ? '#fff' : '#F7F6F3', color: NAVY,
          boxShadow: f ? '0 0 0 3px rgba(15,118,110,0.1)' : 'none',
          transition:'all 0.15s',
          ...(p.style||{}),
        }}
      />
    </div>
  )
}

export default function InsuranceClaimFields({ leadId, proId, initial, darkMode: dk, propertyState, onSaved }: Props) {
  // FL claims-intelligence (SB 2-A, 25% rule) is Florida-specific by design — gate it.
  const isFL = (propertyState ?? '').trim().toUpperCase() === 'FL'
  const [open,   setOpen]   = useState(initial.insurance_claim ?? false)
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
      setSaved(false)
      const val = key === 'adjuster_phone'
        ? formatPhone(e.target.value)
        : e.target.value
      setFields(f => ({ ...f, [key]: val }))
    }
  }

  const handleToggle = useCallback(async () => {
    const next = !open
    setOpen(next)
    setFields(f => ({ ...f, insurance_claim: next }))
    await fetch(`/api/leads/${leadId}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pro_id: proId, insurance_claim: next }),
    }).catch(() => {})
  }, [open, leadId, proId])

  const handleSave = useCallback(async () => {
    setSaving(true); setError(null); setSaved(false)
    const phone = fields.adjuster_phone.replace(/\D/g,'')
    if (phone.length > 0 && phone.length < 10) {
      setError('Adjuster phone must be 10 digits'); setSaving(false); return
    }
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          pro_id:               proId,
          insurance_claim:      fields.insurance_claim,
          insurance_company:    fields.insurance_company    || null,
          claim_number:         fields.claim_number         || null,
          adjuster_name:        fields.adjuster_name        || null,
          adjuster_phone:       fields.adjuster_phone       || null,
          adjuster_appointment: fields.adjuster_appointment || null,
          claim_status:         fields.claim_status         || null,
          approved_amount:      parseCurrency(fields.approved_amount) || null,
          supplement_amount:    parseCurrency(fields.supplement_amount) || null,
          deductible:           parseCurrency(fields.deductible) || null,
          date_of_loss:         fields.date_of_loss         || null,
          roof_install_date:    fields.roof_install_date    || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as {error?: string}).error ?? `HTTP ${res.status}`)
      }
      setSaved(true); onSaved(fields)
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
  const claimPayable = fields.claim_status === 'Approved' || fields.claim_status === 'Supplement Approved'
  const isDenied     = fields.claim_status === 'Denied'

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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', cursor:'pointer', background: open ? (dk ? 'rgba(15,118,110,0.1)' : 'rgba(15,118,110,0.04)') : 'transparent' }}
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
            <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>
              {open && fields.insurance_company
                ? `${fields.insurance_company}${fields.claim_number ? ` · #${fields.claim_number}` : ''}`
                : open ? 'Fill in claim details below'
                : 'Toggle to log insurance claim details'}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Status badge when collapsed */}
          {!open && fields.insurance_company && (
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:100, background:activeStatus.bg, color:activeStatus.color, border:`1px solid ${activeStatus.color}25` }}>
              {fields.claim_status}
            </span>
          )}
          {/* Toggle */}
          <div style={{ width:44, height:24, borderRadius:12, background: open ? TEAL : (dk ? '#334155' : '#CBD5E1'), position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', width:18, height:18, borderRadius:'50%', background:'#fff', top:3, left: open ? 23 : 3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
          </div>
        </div>
      </div>

      {/* ── Fields ── */}
      {open && (
        <div style={{ padding:'0 20px 20px' }}>
          <div style={{ height:1, background: dk ? '#334155' : 'rgba(15,118,110,0.1)', marginBottom:20 }}/>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

            {/* Row 1: Insurer + Claim # */}
            <Field label="Insurance company">
              <FInput value={fields.insurance_company} onChange={set('insurance_company')} placeholder="State Farm, Citizens…"
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
              />
            </Field>
            <Field label="Claim number">
              <FInput value={fields.claim_number} onChange={set('claim_number')} placeholder="SF-2026-001"
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
              />
            </Field>

            {isFL && (<>
            {/* Row 1b: Date of loss + FL SB 2-A deadlines (full width) */}
            <div style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>
              <Field label="Date of loss">
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <input type="date" value={fields.date_of_loss} onChange={set('date_of_loss')}
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
            <div style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>
              <Field label="Roof built / last reroofed">
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
                  </div>
                  <input type="date" value={fields.roof_install_date} onChange={set('roof_install_date')}
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
              <FInput value={fields.adjuster_name} onChange={set('adjuster_name')} placeholder="John Doe"
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
            </Field>
            <Field label="Adjuster phone">
              <FInput value={fields.adjuster_phone} onChange={set('adjuster_phone')}
                type="tel" placeholder="813-555-0142" inputMode="numeric" maxLength={12}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
              />
            </Field>

            {/* Row 3: Appointment + Status */}
            <Field label="Adjuster appointment">
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <input type="datetime-local" value={fields.adjuster_appointment} onChange={set('adjuster_appointment')}
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
            <Field label="Claim status">
              <div style={{ position:'relative' }}>
                <select value={fields.claim_status} onChange={set('claim_status')}
                  style={{ width:'100%', padding:'9px 32px 9px 12px', border:`1.5px solid ${activeStatus.color}40`, borderRadius:9, fontSize:13, outline:'none', background: activeStatus.bg, color: activeStatus.color, fontWeight:700, cursor:'pointer', appearance:'none' as const, transition:'all 0.15s' }}>
                  {STATUS_GROUPS.map(g => (
                    <optgroup key={g} label={g}>
                      {CLAIM_STATUSES.filter(s => s.group === g).map(s => (
                        <option key={s.value} value={s.value}>{s.value}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={activeStatus.color} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
              <div style={{ marginTop:6, fontSize:11, fontWeight:600, color: activeStatus.effect==='advance' ? '#059669' : activeStatus.effect==='denied' ? '#DC2626' : (dk ? '#64748B' : '#94A3B8') }}>
                {EFFECT_HINT[activeStatus.effect]}
              </div>
            </Field>

            {/* Row 4: Financial — 3-col. Hidden on Denied (values preserved in DB for appeal). */}
            {!isDenied && (
            <div style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <Field label="Approved amount">
                <FInput value={fields.approved_amount} onChange={set('approved_amount')} placeholder="$0.00"
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                />
              </Field>
              <Field label="Supplement amount">
                <FInput value={fields.supplement_amount} onChange={set('supplement_amount')} placeholder="$0.00"
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                />
              </Field>
              <Field label="Deductible (homeowner)">
                <FInput value={fields.deductible} onChange={set('deductible')} placeholder="$0.00"
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                />
              </Field>
            </div>
            )}

            {/* Net calculation — only when the carrier has actually approved */}
            <div style={{ gridColumn:'1 / -1' }}>
              {claimPayable ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:10, background: net > 0 ? (dk ? 'rgba(5,150,105,0.12)' : '#F0FDF4') : (dk ? 'rgba(255,255,255,0.04)' : '#F8FAFC'), border:`1px solid ${net > 0 ? 'rgba(5,150,105,0.2)' : '#E2E8F0'}`, transition:'all 0.2s' }}>
                <div style={{ display:'flex', gap:20 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>Approved</div>
                    <div style={{ fontSize:15, fontWeight:800, color: dk ? '#F1F5F9' : NAVY, letterSpacing:'-0.02em' }}>${approved.toLocaleString()}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', color:'#94A3B8', fontSize:16, fontWeight:300 }}>+</div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>Supplement</div>
                    <div style={{ fontSize:15, fontWeight:800, color: dk ? '#F1F5F9' : NAVY, letterSpacing:'-0.02em' }}>${supplement.toLocaleString()}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', color:'#94A3B8', fontSize:16, fontWeight:300 }}>−</div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>Deductible</div>
                    <div style={{ fontSize:15, fontWeight:800, color: dk ? '#F1F5F9' : NAVY, letterSpacing:'-0.02em' }}>${deductible.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ textAlign:'right' as const }}>
                  <div style={{ fontSize:10, fontWeight:700, color: net > 0 ? '#059669' : '#94A3B8', textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>Insurance pays homeowner</div>
                  <div style={{ fontSize:20, fontWeight:900, color: net > 0 ? '#059669' : (dk ? '#475569' : '#94A3B8'), letterSpacing:'-0.03em' }}>${Math.max(net,0).toLocaleString()}</div>
                </div>
              </div>
              ) : (
              <div style={{ padding:'12px 16px', borderRadius:10, background: dk ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border:`1px solid ${dk ? '#334155' : '#E2E8F0'}`, fontSize:12, fontWeight:600, color: dk ? '#94A3B8' : '#64748B' }}>
                {fields.claim_status === 'Denied'
                  ? 'Claim denied — insurance pays nothing. Homeowner pays the full job cost.'
                  : 'Insurance reconciliation appears once the carrier marks the claim Approved.'}
              </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#DC2626', fontSize:13, fontWeight:500 }}>{error}</div>
          )}

          {/* Footer: save button */}
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
              <button onClick={handleSave} disabled={saving} style={{
                padding:'9px 22px', borderRadius:9, border:'none', cursor: saving ? 'wait' : 'pointer',
                background: saving ? '#94A3B8' : `linear-gradient(135deg,${TEAL},${TEAL_L})`,
                color:'#fff', fontSize:13, fontWeight:700,
                boxShadow: saving ? 'none' : '0 4px 12px rgba(15,118,110,0.35)',
                display:'flex', alignItems:'center', gap:7, transition:'all 0.15s',
              }}>
                {saving
                  ? <><div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', animation:'pg-spin 0.7s linear infinite' }}/> Saving…</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Save Insurance Fields</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes pg-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
