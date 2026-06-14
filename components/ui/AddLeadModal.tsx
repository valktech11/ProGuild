'use client'
import { theme } from '@/lib/tokens'
import { capName } from '@/lib/utils'
import { useState, useRef } from 'react'
import { getTradeLabels } from '@/lib/trades/_registry'
import { usePlacesAutocomplete } from '@/lib/hooks/usePlacesAutocomplete'
import { LEAD_SOURCES } from '@/lib/trades/roofing/leadSources'

// ── Tokens (match login/onboarding design language) ───────────────────────────
const TEAL   = '#0F766E'
const TEAL_L = '#14B8A6'
const NAVY   = '#0A1628'
const NAVY_M = '#0F2137'
const BORDER = '#E2E8F0'
const CREAM  = '#F7F6F3'

// Presentation only — colors per source value. The LIST of sources comes from
// the golden source (lib/trades/roofing/leadSources.ts); this just styles them.
const SRC_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  Phone_Call: { color: TEAL,      bg: '#F0FDFA', dot: '#5EEAD4' },
  Storm:      { color: '#0EA5E9', bg: '#F0F9FF', dot: '#7DD3FC' },
  Referral:   { color: '#7C3AED', bg: '#F5F3FF', dot: '#A78BFA' },
  Facebook:   { color: '#1877F2', bg: '#EFF6FF', dot: '#93C5FD' },
  Instagram:  { color: '#E1306C', bg: '#FFF1F2', dot: '#FDA4AF' },
  Door_Knock: { color: '#7C3AED', bg: '#F5F3FF', dot: '#C4B5FD' },
  Yard_Sign:  { color: '#B45309', bg: '#FFFBEB', dot: '#FCD34D' },
  Insurance:  { color: '#B45309', bg: '#FFFBEB', dot: '#FCD34D' },
  Website:    { color: '#0369A1', bg: '#E0F2FE', dot: '#7DD3FC' },
  Google:     { color: '#DB4437', bg: '#FEF2F2', dot: '#FCA5A5' },
  Canvassing: { color: '#059669', bg: '#ECFDF5', dot: '#6EE7B7' },
  Other:      { color: '#6B7280', bg: '#F9FAFB', dot: '#D1D5DB' },
}
const SOURCES = LEAD_SOURCES.map(s => ({
  value: s.value, label: s.label,
  ...(SRC_STYLE[s.value] ?? { color: '#6B7280', bg: '#F9FAFB', dot: '#D1D5DB' }),
}))

function SourceIcon({ value, size = 18, color }: { value: string; size?: number; color?: string }) {
  const s = size
  const c = color || '#fff'
  if (value === 'Facebook')  return <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  if (value === 'Instagram') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><defs><radialGradient id="ig" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="5" fill="url(#ig)"/><path d="M12 7a5 5 0 100 10A5 5 0 0012 7zm0 8.2A3.2 3.2 0 1112 8.8a3.2 3.2 0 010 6.4zM17.2 6.4a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" fill="white"/></svg>
  if (value === 'Phone_Call') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
  if (value === 'Referral')  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  if (value === 'Website')   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
  if (value === 'Yard_Sign') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="12" rx="2"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
  if (value === 'Walk_In')   return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="4" r="2"/><path d="M12 6v6l-3 3M12 12l3 3M9 17l-1 4M15 17l1 4"/></svg>
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}

function formatPhone(r: string) {
  const d = r.replace(/\D/g,'').slice(0,10)
  if (d.length<=3) return d
  if (d.length<=6) return `${d.slice(0,3)}-${d.slice(3)}`
  return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
}
function san(v: string) { return v.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g,'').trimStart() }
function getScopePlaceholder(tradeSlug?: string) {
  const labels = getTradeLabels(tradeSlug)
  return (labels as any).scopePlaceholder || 'Describe what needs to be done, size of job, any urgency...'
}

// ── Focused input ─────────────────────────────────────────────────────────────
function FInput({ label, required, hint, icon, refProp, ...p }: {
  label?: string; required?: boolean; hint?: string; icon?: React.ReactNode
  refProp?: React.RefObject<HTMLInputElement | null>
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false)
  return (
    <div>
      {label && (
        <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
          {label}{required && <span style={{color:'#EF4444',marginLeft:3}}>*</span>}
          {hint && <span style={{color:'#94A3B8',fontWeight:400,textTransform:'none',letterSpacing:0,marginLeft:4}}>{hint}</span>}
        </label>
      )}
      <div style={{position:'relative'}}>
        {icon && <div style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:f?TEAL:'#94A3B8',transition:'color 0.15s'}}>{icon}</div>}
        <input {...p} ref={refProp as any}
          onFocus={e=>{setF(true);(p as any).onFocus?.(e)}}
          onBlur={e=>{setF(false);(p as any).onBlur?.(e)}}
          style={{
            width:'100%', boxSizing:'border-box',
            padding: icon ? '9px 12px 9px 34px' : '9px 12px',
            border:`1.5px solid ${f?TEAL:BORDER}`, borderRadius:8,
            fontSize:13, outline:'none',
            background: f ? '#fff' : CREAM,
            color: NAVY,
            boxShadow: f ? `0 0 0 3px rgba(15,118,110,0.1)` : 'none',
            transition:'all 0.15s',
            ...(p.style||{}),
          }}
        />
      </div>
    </div>
  )
}

interface AddLeadModalProps {
  proId: string; tradeSlug?: string
  onClose: () => void; onAdded: (lead: any) => void; dk?: boolean
}

export default function AddLeadModal({ proId, tradeSlug, onClose, onAdded, dk=false }: AddLeadModalProps) {
  const scopePH = getScopePlaceholder(tradeSlug)
  const [name,      setName]      = useState('')
  const [phone,     setPhone]     = useState('')
  const [email,     setEmail]     = useState('')
  const [need,      setNeed]      = useState('')
  const [source,    setSource]    = useState('Phone_Call')
  const [street,    setStreet]    = useState('')
  const [city,      setCity]      = useState('')
  const [addrState, setAddrState] = useState('')
  const [zip,       setZip]       = useState('')
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')
  const [needF,     setNeedF]     = useState(false)
  const streetRef = useRef<HTMLInputElement>(null)

  usePlacesAutocomplete(streetRef, (fmt: string) => {
    const zipM = fmt.match(/\b(\d{5})\b/)
    const stM  = fmt.match(/,\s*([A-Z]{2})\s+\d{5}/)
    const pts  = fmt.replace(', USA','').split(', ')
    if (pts.length>=1) setStreet(pts[0]||'')
    if (pts.length>=2) setCity(pts[1]||'')
    if (stM) setAddrState(stM[1])
    if (zipM) setZip(zipM[1])
  })

  async function save() {
    if (!name.trim())                   { setErr('Contact name is required'); return }
    if (!phone.trim()&&!email.trim())   { setErr('Phone or email is required'); return }
    if (!need.trim())                   { setErr('Describe what they need'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/leads', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        pro_id: proId, contact_name: name.trim(),
        contact_phone: phone.trim()||null, contact_email: email.trim()||null,
        property_address: street.trim()||null, contact_city: city.trim()||null,
        contact_state: addrState.trim()||null, contact_zip: zip.trim()||null,
        message: need.trim(), lead_source: source, is_manual: true,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) { onAdded(d.lead); onClose() }
    else setErr(d.error||'Failed to save lead')
  }

  const activeSrc = SOURCES.find(s => s.value === source)!

  return (
    <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'rgba(10,22,40,0.65)',backdropFilter:'blur(4px)'}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', maxWidth:860,
        height:'min(640px, calc(100vh - 48px))',
        display:'flex', flexDirection:'row',
        borderRadius:20, overflow:'hidden',
        boxShadow:'0 32px 80px rgba(10,22,40,0.35), 0 4px 16px rgba(10,22,40,0.15)',
        fontFamily:"'DM Sans',system-ui,-apple-system,sans-serif",
      }}>

        {/* ════ LEFT PANEL — dark navy, source selector ════════════════════════ */}
        <div style={{
          width:260, flexShrink:0, display:'flex', flexDirection:'column',
          background:`linear-gradient(160deg, ${NAVY} 0%, #0B2A3E 55%, #0D4A44 100%)`,
          padding:'28px 24px', position:'relative', overflow:'hidden',
        }}>
          {/* Grid texture */}
          <div style={{position:'absolute',inset:0,opacity:0.04,backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(255,255,255,.5) 31px,rgba(255,255,255,.5) 32px),repeating-linear-gradient(90deg,transparent,transparent 31px,rgba(255,255,255,.5) 31px,rgba(255,255,255,.5) 32px)',pointerEvents:'none'}}/>
          {/* Glow orb */}
          <div style={{position:'absolute',width:200,height:200,borderRadius:'50%',background:`radial-gradient(circle,rgba(15,118,110,0.2) 0%,transparent 70%)`,top:-60,right:-60,pointerEvents:'none'}}/>

          {/* Logo + title */}
          <div style={{position:'relative',marginBottom:28}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${TEAL},${TEAL_L})`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 4px 14px rgba(15,118,110,0.5)`}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                </svg>
              </div>
              <div>
                <div style={{color:'#fff',fontSize:16,fontWeight:800,letterSpacing:'-0.02em'}}>Log New Lead</div>
                <div style={{color:'rgba(180,210,220,0.6)',fontSize:11,marginTop:1}}>Takes 30 seconds</div>
              </div>
            </div>

            {/* Badge */}
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(15,118,110,0.18)',border:'1px solid rgba(20,184,166,0.3)',borderRadius:100,padding:'4px 10px'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:TEAL_L,boxShadow:`0 0 6px ${TEAL_L}`}}/>
              <span style={{color:TEAL_L,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>Lead Source</span>
            </div>
          </div>

          {/* Source grid — 2 cols */}
          <div style={{position:'relative',flex:1,display:'flex',flexDirection:'column',gap:8}}>
            {SOURCES.map(s => {
              const active = source === s.value
              return (
                <button key={s.value} onClick={()=>setSource(s.value)} style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'10px 12px', borderRadius:10, cursor:'pointer',
                  border:`1.5px solid ${active ? s.dot+'80' : 'rgba(255,255,255,0.08)'}`,
                  background: active ? `rgba(255,255,255,0.1)` : 'rgba(255,255,255,0.03)',
                  transition:'all 0.15s', textAlign:'left',
                  boxShadow: active ? `0 2px 10px rgba(0,0,0,0.2)` : 'none',
                }}>
                  <div style={{width:30,height:30,borderRadius:8,background:active?s.bg:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                    <SourceIcon value={s.value} size={15} color={active?s.color:'rgba(255,255,255,0.55)'}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:active?700:500,color:active?'#fff':'rgba(255,255,255,0.55)',letterSpacing:'-0.01em',transition:'all 0.15s'}}>
                    {s.label}
                  </span>
                  {active && (
                    <div style={{marginLeft:'auto',width:16,height:16,borderRadius:'50%',background:TEAL_L,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Bottom stats */}
          <div style={{position:'relative',borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:16,marginTop:16}}>
            {[['$0','per-lead fee'],['124k','FL pros'],['< 30s','to log']].map(([n,l])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:11,color:'rgba(180,210,220,0.45)'}}>{l}</span>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(180,210,220,0.7)'}}>{n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ════ RIGHT PANEL — white, form fields ═══════════════════════════════ */}
        <div style={{flex:1,display:'flex',flexDirection:'column',background:'#fff',minWidth:0}}>

          {/* Right header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:`1px solid ${BORDER}`,flexShrink:0}}>
            <div>
              <h2 style={{fontSize:16,fontWeight:800,color:NAVY,margin:0,letterSpacing:'-0.02em'}}>Lead Details</h2>
              <p style={{fontSize:11,color:'#94A3B8',margin:0,marginTop:2}}>Fill in what you know — everything else can be added later</p>
            </div>
            <button onClick={onClose} style={{width:30,height:30,borderRadius:8,background:CREAM,border:`1px solid ${BORDER}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748B',fontSize:17,lineHeight:1}}>×</button>
          </div>

          {/* Scrollable form */}
          <div style={{flex:1,overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>

            {/* Row 1: Name + Phone */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <FInput label="Full name" required placeholder="Jane Smith"
                value={name} onChange={e=>setName(san(e.target.value))}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
              <FInput label="Phone" required placeholder="813-555-0100" type="tel" inputMode="numeric" maxLength={12}
                value={phone} onChange={e=>setPhone(formatPhone(e.target.value))}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
              />
            </div>

            {/* Row 2: Email */}
            <FInput label="Email" hint="(optional)" placeholder="jane@example.com" type="email"
              value={email} onChange={e=>setEmail(san(e.target.value))}
              onBlur={e=>setEmail(e.target.value.trim().toLowerCase())}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
            />

            {/* Divider */}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{flex:1,height:1,background:BORDER}}/>
              <span style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em'}}>Property</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>

            {/* Row 3: Street address */}
            <div>
              <label style={{display:'block',fontSize:10,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>
                Street address <span style={{color:'#94A3B8',fontWeight:400,textTransform:'none',letterSpacing:0}}>(optional — autocomplete)</span>
              </label>
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'#94A3B8'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <input ref={streetRef} value={street} onChange={e=>setStreet(e.target.value)}
                  placeholder="3919 Highgate Court" autoComplete="off"
                  style={{width:'100%',boxSizing:'border-box',padding:'9px 12px 9px 34px',border:`1.5px solid ${BORDER}`,borderRadius:8,fontSize:13,outline:'none',background:CREAM,color:NAVY,transition:'all 0.15s'}}
                  onFocus={e=>{e.target.style.borderColor=TEAL;e.target.style.background='#fff';e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)'}}
                  onBlur={e=>{e.target.style.borderColor=BORDER;e.target.style.background=CREAM;e.target.style.boxShadow='none'}}
                />
              </div>
            </div>

            {/* Row 4: City / State / ZIP */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 72px 88px',gap:10}}>
              <FInput label="City" placeholder="Jacksonville" value={city} onChange={e=>setCity(e.target.value)}/>
              <div>
                <label style={{display:'block',fontSize:10,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>State</label>
                <select value={addrState} onChange={e=>setAddrState(e.target.value)}
                  style={{width:'100%',padding:'9px 6px',border:`1.5px solid ${BORDER}`,borderRadius:8,fontSize:13,outline:'none',background:CREAM,color:NAVY,cursor:'pointer'}}
                  onFocus={e=>{e.currentTarget.style.borderColor=TEAL;e.currentTarget.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)'}}
                  onBlur={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.boxShadow='none'}}>
                  <option value="">ST</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s=>(
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <FInput label="ZIP" placeholder="32216" maxLength={5} inputMode="numeric"
                value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,'').slice(0,5))}/>
            </div>

            {/* Divider */}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{flex:1,height:1,background:BORDER}}/>
              <span style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em'}}>Scope</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>

            {/* Row 5: Scope textarea */}
            <div>
              <label style={{display:'block',fontSize:10,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>
                What do they need? <span style={{color:'#EF4444'}}>*</span>
              </label>
              <div style={{position:'relative'}}>
                <textarea value={need} onChange={e=>setNeed(san(e.target.value))}
                  placeholder={scopePH} rows={3} maxLength={250}
                  style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',border:`1.5px solid ${needF?TEAL:BORDER}`,borderRadius:8,fontSize:13,outline:'none',resize:'none',background:needF?'#fff':CREAM,color:NAVY,boxShadow:needF?'0 0 0 3px rgba(15,118,110,0.1)':'none',transition:'all 0.15s'}}
                  onFocus={()=>setNeedF(true)} onBlur={()=>setNeedF(false)}
                />
                <span style={{position:'absolute',bottom:8,right:10,fontSize:11,color:need.length>220?'#EF4444':'#94A3B8'}}>{need.length}/250</span>
              </div>
            </div>

            {/* Error */}
            {err && (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:8,background:'#FEF2F2',border:'1px solid #FECACA'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span style={{fontSize:12,color:'#DC2626',fontWeight:600}}>{err}</span>
              </div>
            )}
          </div>

          {/* ── Fixed footer ── */}
          <div style={{borderTop:`1px solid ${BORDER}`,padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',background:CREAM,flexShrink:0}}>
            {/* Left: active source + security */}
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:100,background:activeSrc.bg,border:`1px solid ${activeSrc.color}30`}}>
                <SourceIcon value={source} size={12} color={activeSrc.color}/>
                <span style={{fontSize:11,fontWeight:700,color:activeSrc.color}}>{activeSrc.label}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <span style={{fontSize:11,color:'#94A3B8'}}>Encrypted</span>
              </div>
            </div>
            {/* Right: buttons */}
            <div style={{display:'flex',gap:10}}>
              <button onClick={onClose} style={{padding:'9px 20px',borderRadius:8,background:'#fff',border:`1.5px solid ${BORDER}`,color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={save} disabled={saving} style={{
                padding:'9px 24px', borderRadius:8,
                background: saving ? '#94A3B8' : `linear-gradient(135deg,${TEAL},${TEAL_L})`,
                color:'#fff', border:'none', fontSize:13, fontWeight:700,
                cursor: saving?'wait':'pointer',
                boxShadow: saving?'none':`0 4px 14px rgba(15,118,110,0.4)`,
                display:'flex', alignItems:'center', gap:7, transition:'all 0.15s',
              }}>
                {saving
                  ? <><div style={{width:13,height:13,borderRadius:'50%',border:'2px solid rgba(255,255,255,0.35)',borderTopColor:'#fff',animation:'pg-spin 0.7s linear infinite'}}/> Saving…</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Save Lead</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes pg-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
