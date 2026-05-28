// app/dashboard/roofing/quickbid/page.tsx
// Standalone Quick Bid PDF page.
// Type address OR pick from existing clients/properties → generate satellite PDF instantly.
// No polygon drawing (that's ProMeasure). One tap to 30-second report.
'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'
import { usePlacesAutocomplete } from '@/lib/hooks/usePlacesAutocomplete'
import { initials, avatarColor, capName } from '@/lib/utils'

// ── Tokens ────────────────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const TEAL_L = '#14B8A6'
const NAVY   = '#0A1628'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Client {
  id: string; full_name: string
  address_line1: string | null; city: string | null
  state: string | null; zip: string | null
}
interface Property {
  id: string; address_line1: string
  city: string | null; state: string | null; zip_code: string | null
  report_count?: number; last_report?: string | null
}
interface Report {
  id: string; created_at: string
  total_squares_order: number | null; dominant_pitch: string | null
  waste_factor: number | null; facet_count: number | null
  r2_url: string; imagery_date: string | null
}

type Step = 'search' | 'confirm' | 'generating' | 'done' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAddr(line1: string | null, city: string | null, state: string | null) {
  return [line1, city, state].filter(Boolean).join(', ')
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ width:'100%', height:6, borderRadius:100, background:'rgba(15,118,110,0.12)', overflow:'hidden' }}>
      <div style={{ height:'100%', borderRadius:100, background:`linear-gradient(90deg,${TEAL},${TEAL_L})`, width:`${pct}%`, transition:'width 0.4s ease', boxShadow:`0 0 8px ${TEAL}50` }}/>
    </div>
  )
}

// ── Main inner component ──────────────────────────────────────────────────────
function QuickBidInner() {
  const router  = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro'); return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  // ── Search state ─────────────────────────────────────────────────────────
  const [query,      setQuery]      = useState('')
  const [clients,    setClients]    = useState<Client[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching,  setSearching]  = useState(false)

  // ── Address form state ────────────────────────────────────────────────────
  const [street,    setStreet]    = useState('')
  const [city,      setCity]      = useState('')
  const [addrState, setAddrState] = useState('')
  const [zip,       setZip]       = useState('')
  const [sourceLabel, setSourceLabel] = useState<string | null>(null) // "From: Rajesh Kumar"
  const [matchedPropertyId, setMatchedPropertyId] = useState<string | null>(null)

  // ── Generation state ──────────────────────────────────────────────────────
  const [step,       setStep]      = useState<Step>('search')
  const [progress,   setProgress]  = useState(0)
  const [statusMsg,  setStatusMsg] = useState('')
  const [report,     setReport]    = useState<Report | null>(null)
  const [prevReports, setPrevReports] = useState<Report[]>([])
  const [errMsg,     setErrMsg]    = useState('')

  const streetRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropRef   = useRef<HTMLDivElement>(null)

  // Google Places on the manual street input
  usePlacesAutocomplete(streetRef, (fmt: string) => {
    const zipM = fmt.match(/\b(\d{5})\b/)
    const stM  = fmt.match(/,\s*([A-Z]{2})\s+\d{5}/)
    const pts  = fmt.replace(', USA','').split(', ')
    setStreet(pts[0] || '')
    setCity(pts[1] || '')
    if (stM) setAddrState(stM[1])
    if (zipM) setZip(zipM[1])
    setSourceLabel(null)
    setMatchedPropertyId(null)
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Search clients + properties as user types
  useEffect(() => {
    if (!query.trim() || !session) { setClients([]); setProperties([]); setShowDropdown(false); return }
    const tid = setTimeout(async () => {
      setSearching(true)
      const [cr, pr] = await Promise.all([
        fetch(`/api/clients?pro_id=${session.id}`).then(r => r.json()),
        fetch(`/api/properties?pro_id=${session.id}&search=${encodeURIComponent(query)}`).then(r => r.json()),
      ])
      const q = query.toLowerCase()
      const filteredClients: Client[] = (cr.clients || []).filter((c: Client) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.address_line1 || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q)
      ).slice(0, 5)
      const filteredProps: Property[] = (pr.properties || []).slice(0, 5)
      setClients(filteredClients)
      setProperties(filteredProps)
      setShowDropdown(filteredClients.length > 0 || filteredProps.length > 0)
      setSearching(false)
    }, 280)
    return () => clearTimeout(tid)
  }, [query, session])

  function pickClient(c: Client) {
    setStreet(c.address_line1 || '')
    setCity(c.city || '')
    setAddrState(c.state || '')
    setZip(c.zip || '')
    setSourceLabel(`Client: ${capName(c.full_name)}`)
    setMatchedPropertyId(null)
    setQuery('')
    setShowDropdown(false)
    setStep('confirm')
  }

  function pickProperty(p: Property) {
    setStreet(p.address_line1 || '')
    setCity(p.city || '')
    setAddrState(p.state || '')
    setZip(p.zip_code || '')
    setSourceLabel(`Property on file`)
    setMatchedPropertyId(p.id)
    setQuery('')
    setShowDropdown(false)
    loadPrevReports(p.id)
    setStep('confirm')
  }

  async function loadPrevReports(propertyId: string) {
    if (!session) return
    const r = await fetch(`/api/roofing/reports?pro_id=${session.id}&property_id=${propertyId}`)
    const d = await r.json()
    setPrevReports(d.reports || [])
  }

  const fullAddress = [street, city, addrState, zip].filter(Boolean).join(', ')

  // ── Report generation ─────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!session || !street.trim()) return
    setStep('generating')
    setProgress(8)
    setStatusMsg('Geocoding address…')
    setErrMsg('')

    // Animate progress while waiting (Solar API is slow)
    const steps = [
      { pct: 20, msg: 'Fetching satellite imagery…',  ms: 1200 },
      { pct: 38, msg: 'Analysing roof planes…',        ms: 2000 },
      { pct: 55, msg: 'Calculating pitch & squares…',  ms: 2500 },
      { pct: 70, msg: 'Generating PDF report…',        ms: 3500 },
      { pct: 85, msg: 'Uploading to your account…',    ms: 4500 },
    ]
    let cancelled = false
    steps.forEach(({ pct, msg, ms }) => {
      setTimeout(() => { if (!cancelled) { setProgress(pct); setStatusMsg(msg) } }, ms)
    })

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90000)
      let res: Response
      try {
        res = await fetch('/api/roofing/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address:     fullAddress,
            pro_id:      session.id,
            property_id: matchedPropertyId || undefined,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      cancelled = true
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setStep('error'); setErrMsg((d as any).error || 'Report generation failed'); return }

      setProgress(95)
      setStatusMsg('Finalising…')

      // Background DSM
      if ((d as any).reportRowId) {
        fetch('/api/roofing/dsm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_id: (d as any).reportRowId, pro_id: session.id }),
        }).catch(() => {})
      }

      // Push to sessionStorage for Calculator
      // Use Google's geocoded address (clean, no duplicate city) if available
      const geocodedAddr = (d as any)?.debug?.formattedAddress
        ? String((d as any).debug.formattedAddress).replace(', USA', '')
        : fullAddress
      const meas = (d as any).measurements as Record<string, unknown> | undefined
      if (meas) {
        const payload = {
          squares: Number(meas.totalSquaresOrder) || 0,
          pitch:   (meas.dominantPitch as string) ?? '4/12',
          waste:   Number(meas.wasteFactor) || 12,
          source:  'roof_report',
          address: geocodedAddr,
        }
        try {
          sessionStorage.setItem('pg_promeasure',  JSON.stringify(payload))
          sessionStorage.setItem('pg_report_data', JSON.stringify(payload))
        } catch {}
      }

      // Fetch the actual signed report URL
      const pid = matchedPropertyId || (d as any).property_id || null
      if (pid) {
        const rr = await fetch(`/api/roofing/reports?pro_id=${session.id}&property_id=${pid}`)
        const rd = await rr.json()
        const latest = (rd.reports || [])[0]
        if (latest) setReport(latest)
        setPrevReports(rd.reports || [])
      }

      setProgress(100)
      setStatusMsg('Done!')
      setTimeout(() => setStep('done'), 400)

    } catch (err: unknown) {
      cancelled = true
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setStep('error')
      setErrMsg(isAbort ? 'Request timed out (90s). Solar API may be slow — try again.' : 'Network error — please retry.')
    }
  }, [session, fullAddress, matchedPropertyId])

  if (!session) return null

  const canGenerate = street.trim().length > 3

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 4px 48px' }}>

        {/* ── Page header ── */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28, paddingTop:4 }}>
          <div style={{ width:46, height:46, borderRadius:13, background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 6px 18px rgba(15,118,110,0.38)`, flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:t.textPri, margin:0, letterSpacing:'-0.02em' }}>Quick Bid PDF</h1>
            <p style={{ fontSize:12, color:t.textMuted, margin:0, marginTop:2 }}>
              Type an address or pick a client — get a satellite measurement report in ~30 seconds
            </p>
          </div>
        </div>

        {/* ── STEP: Search / Confirm ── */}
        {(step === 'search' || step === 'confirm') && (
          <>
            {/* ── Search bar ── */}
            <div style={{ background:t.cardBg, borderRadius:16, border:`1px solid ${t.cardBorder}`, padding:'20px 22px', marginBottom:14, boxShadow:`0 2px 12px rgba(10,22,40,0.06)` }}>
              <p style={{ fontSize:11, fontWeight:700, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 10px' }}>
                Find by client or existing property
              </p>
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </div>
                <input
                  ref={searchRef}
                  value={query} onChange={e => setQuery(e.target.value)}
                  onFocus={() => query.trim() && setShowDropdown(true)}
                  placeholder="Search by name or address…"
                  style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px 11px 38px', border:`1.5px solid ${TEAL}40`, borderRadius:10, fontSize:14, outline:'none', background:dk?t.cardBgAlt:'#F7F6F3', color:t.textPri, boxShadow:`0 0 0 3px rgba(15,118,110,0.08)`, transition:'all 0.15s' }}
                  
                />
                {searching && (
                  <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)' }}>
                    <div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(15,118,110,0.2)', borderTopColor:TEAL, animation:'pg-spin 0.7s linear infinite' }}/>
                  </div>
                )}
              </div>

              {/* Dropdown */}
              {showDropdown && (clients.length > 0 || properties.length > 0) && (
                <div ref={dropRef} style={{ marginTop:6, borderRadius:12, border:`1px solid ${t.cardBorder}`, background:t.cardBg, boxShadow:'0 8px 32px rgba(10,22,40,0.14)', overflow:'hidden', zIndex:10, position:'relative' }}>

                  {clients.length > 0 && (
                    <>
                      <div style={{ padding:'8px 14px 4px', fontSize:10, fontWeight:700, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.08em' }}>Clients</div>
                      {clients.map(c => {
                        const [avBg, avFg] = avatarColor(c.full_name)
                        return (
                          <button key={c.id} onClick={() => pickClient(c)}
                            style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left', borderTop:`1px solid ${t.cardBorder}` }}
                            onMouseEnter={e => (e.currentTarget.style.background = dk ? 'rgba(15,118,110,0.08)' : 'rgba(15,118,110,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <div style={{ width:32, height:32, borderRadius:'50%', background:avBg, color:avFg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0 }}>
                              {initials(c.full_name)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:t.textPri }}>{capName(c.full_name)}</div>
                              <div style={{ fontSize:11, color:t.textSubtle, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {fmtAddr(c.address_line1, c.city, c.state) || 'No address on file'}
                              </div>
                            </div>
                            <div style={{ marginLeft:'auto', flexShrink:0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                            </div>
                          </button>
                        )
                      })}
                    </>
                  )}

                  {properties.length > 0 && (
                    <>
                      <div style={{ padding:'8px 14px 4px', fontSize:10, fontWeight:700, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.08em', borderTop: clients.length > 0 ? `1px solid ${t.cardBorder}` : 'none' }}>Properties on file</div>
                      {properties.map(p => (
                        <button key={p.id} onClick={() => pickProperty(p)}
                          style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left', borderTop:`1px solid ${t.cardBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = dk ? 'rgba(15,118,110,0.08)' : 'rgba(15,118,110,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,rgba(15,118,110,0.12),rgba(20,184,166,0.08))`, border:`1px solid rgba(15,118,110,0.15)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                          </div>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:t.textPri }}>{p.address_line1}</div>
                            <div style={{ fontSize:11, color:t.textSubtle }}>{fmtAddr(null, p.city, p.state)}</div>
                          </div>
                          <div style={{ marginLeft:'auto', flexShrink:0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Divider ── */}
            <div style={{ display:'flex', alignItems:'center', gap:12, margin:'0 0 14px' }}>
              <div style={{ flex:1, height:1, background:t.cardBorder }}/>
              <span style={{ fontSize:11, color:t.textSubtle, fontWeight:600 }}>OR ENTER MANUALLY</span>
              <div style={{ flex:1, height:1, background:t.cardBorder }}/>
            </div>

            {/* ── Address form ── */}
            <div style={{ background:t.cardBg, borderRadius:16, border:`1px solid ${t.cardBorder}`, padding:'20px 22px', marginBottom:16, boxShadow:`0 2px 12px rgba(10,22,40,0.06)` }}>
              {sourceLabel && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:100, background:`rgba(15,118,110,0.08)`, border:`1px solid rgba(15,118,110,0.18)`, marginBottom:14 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize:11, fontWeight:700, color:TEAL }}>{sourceLabel}</span>
                  <button onClick={() => { setSourceLabel(null); setStreet(''); setCity(''); setAddrState(''); setZip(''); setMatchedPropertyId(null); setPrevReports([]); setStep('search') }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:14, lineHeight:1, padding:'0 0 0 4px' }}>×</button>
                </div>
              )}

              {/* Street */}
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>
                  Street address <span style={{ color:'#94A3B8', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(Google autocomplete)</span>
                </label>
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#94A3B8' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <input ref={streetRef} value={street} onChange={e => { setStreet(e.target.value); setSourceLabel(null); setMatchedPropertyId(null) }}
                    placeholder="3919 Highgate Court" autoComplete="off"
                    style={{ width:'100%', boxSizing:'border-box', padding:'10px 14px 10px 34px', border:`1.5px solid ${t.cardBorder}`, borderRadius:9, fontSize:13, outline:'none', background:dk?t.cardBgAlt:'#F7F6F3', color:t.textPri, transition:'all 0.15s' }}
                    onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                    onBlur={e => { e.target.style.borderColor=t.cardBorder; e.target.style.background=dk?t.cardBgAlt:'#F7F6F3'; e.target.style.boxShadow='none' }}
                  />
                </div>
              </div>

              {/* City / State / ZIP */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 72px 88px', gap:10 }}>
                {[
                  { label:'City', val:city, set:setCity, ph:'Jacksonville' },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>{f.label}</label>
                    <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                      style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:`1.5px solid ${t.cardBorder}`, borderRadius:9, fontSize:13, outline:'none', background:dk?t.cardBgAlt:'#F7F6F3', color:t.textPri, transition:'all 0.15s' }}
                      onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                      onBlur={e => { e.target.style.borderColor=t.cardBorder; e.target.style.background=dk?t.cardBgAlt:'#F7F6F3'; e.target.style.boxShadow='none' }}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>State</label>
                  <select value={addrState} onChange={e => setAddrState(e.target.value)}
                    style={{ width:'100%', padding:'10px 6px', border:`1.5px solid ${t.cardBorder}`, borderRadius:9, fontSize:13, outline:'none', background:dk?t.cardBgAlt:'#F7F6F3', color:t.textPri, cursor:'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor=TEAL; e.currentTarget.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                    onBlur={e => { e.currentTarget.style.borderColor=t.cardBorder; e.currentTarget.style.boxShadow='none' }}>
                    <option value="">ST</option>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>ZIP</label>
                  <input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="32216" maxLength={5} inputMode="numeric"
                    style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:`1.5px solid ${t.cardBorder}`, borderRadius:9, fontSize:13, outline:'none', background:dk?t.cardBgAlt:'#F7F6F3', color:t.textPri, transition:'all 0.15s' }}
                    onFocus={e => { e.target.style.borderColor=TEAL; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(15,118,110,0.1)' }}
                    onBlur={e => { e.target.style.borderColor=t.cardBorder; e.target.style.background=dk?t.cardBgAlt:'#F7F6F3'; e.target.style.boxShadow='none' }}
                  />
                </div>
              </div>
            </div>

            {/* Previous reports for this property */}
            {prevReports.length > 0 && (
              <div style={{ background:t.cardBg, borderRadius:14, border:`1px solid ${t.cardBorder}`, padding:'16px 20px', marginBottom:16, boxShadow:`0 2px 8px rgba(10,22,40,0.05)` }}>
                <p style={{ fontSize:11, fontWeight:700, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 10px' }}>
                  Previous reports for this address
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {prevReports.slice(0,3).map(r => (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:10, background:dk?t.cardBgAlt:'#F7F6F3', border:`1px solid ${t.cardBorder}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:36, height:36, borderRadius:9, background:`linear-gradient(135deg,rgba(15,118,110,0.1),rgba(20,184,166,0.07))`, border:`1px solid rgba(15,118,110,0.15)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:t.textPri }}>
                            {r.total_squares_order ? `${r.total_squares_order} sq · ${r.dominant_pitch || '—'} pitch` : 'Report generated'}
                          </div>
                          <div style={{ fontSize:11, color:t.textSubtle, marginTop:1 }}>
                            {new Date(r.created_at).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' })}
                          </div>
                        </div>
                      </div>
                      {r.r2_url && (
                        <a href={r.r2_url} target="_blank" rel="noreferrer"
                          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, background:'#F0FDFA', border:`1px solid rgba(15,118,110,0.2)`, color:TEAL, fontSize:11, fontWeight:700, textDecoration:'none' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            <button onClick={generate} disabled={!canGenerate}
              style={{
                width:'100%', padding:'15px', borderRadius:12, border:'none',
                background: canGenerate ? `linear-gradient(135deg,${TEAL},${TEAL_L})` : t.cardBorder,
                color: canGenerate ? '#fff' : t.textSubtle,
                fontSize:15, fontWeight:800, cursor: canGenerate ? 'pointer' : 'not-allowed',
                boxShadow: canGenerate ? `0 6px 20px rgba(15,118,110,0.38)` : 'none',
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                transition:'all 0.15s', letterSpacing:'-0.01em',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Generate Quick Bid Report
            </button>
            {!canGenerate && (
              <p style={{ textAlign:'center', fontSize:11, color:t.textSubtle, marginTop:8 }}>
                Enter an address above to generate a report
              </p>
            )}
          </>
        )}

        {/* ── STEP: Generating ── */}
        {step === 'generating' && (
          <div style={{ background:t.cardBg, borderRadius:20, border:`1px solid rgba(15,118,110,0.2)`, padding:'48px 36px', textAlign:'center', boxShadow:`0 8px 40px rgba(15,118,110,0.1)` }}>
            {/* Animated satellite icon */}
            <div style={{ width:72, height:72, borderRadius:'50%', background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px', boxShadow:`0 8px 24px rgba(15,118,110,0.4)`, animation:'pg-pulse 2s ease-in-out infinite' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h2 style={{ fontSize:20, fontWeight:800, color:t.textPri, margin:'0 0 6px', letterSpacing:'-0.02em' }}>
              Generating your report
            </h2>
            <p style={{ fontSize:13, color:t.textSubtle, margin:'0 0 6px' }}>{fullAddress}</p>
            <p style={{ fontSize:12, color:TEAL, fontWeight:600, margin:'0 0 24px' }}>{statusMsg}</p>
            <div style={{ maxWidth:400, margin:'0 auto 16px' }}>
              <ProgressBar pct={progress} />
            </div>
            <p style={{ fontSize:11, color:t.textSubtle }}>
              {progress}% · Solar API + PDF generation takes 15–45 seconds
            </p>
          </div>
        )}

        {/* ── STEP: Done ── */}
        {step === 'done' && report && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Success card */}
            <div style={{ background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, borderRadius:20, padding:'32px 28px', position:'relative', overflow:'hidden', boxShadow:`0 8px 32px rgba(15,118,110,0.35)` }}>
              <div style={{ position:'absolute', inset:0, opacity:0.04, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(255,255,255,.5) 31px,rgba(255,255,255,.5) 32px),repeating-linear-gradient(90deg,transparent,transparent 31px,rgba(255,255,255,.5) 31px,rgba(255,255,255,.5) 32px)', pointerEvents:'none' }}/>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20 }}>
                <div>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:100, padding:'3px 10px', marginBottom:12 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.9)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Report ready</span>
                  </div>
                  <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', margin:'0 0 6px', letterSpacing:'-0.02em' }}>
                    {street}
                  </h2>
                  <p style={{ fontSize:12, color:'rgba(255,255,255,0.7)', margin:0 }}>{[city, addrState, zip].filter(Boolean).join(', ')}</p>
                </div>
                {/* Measurements */}
                <div style={{ display:'flex', gap:20, flexShrink:0 }}>
                  {[
                    { n: report.total_squares_order ? `${report.total_squares_order}` : '—', l:'Squares' },
                    { n: report.dominant_pitch || '—', l:'Pitch' },
                    { n: report.facet_count ? `${report.facet_count}` : '—', l:'Facets' },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:'-0.03em', lineHeight:1 }}>{s.n}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {report.r2_url && (
                <a href={report.r2_url} target="_blank" rel="noreferrer"
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'18px 12px', borderRadius:14, background:t.cardBg, border:`1.5px solid ${TEAL}30`, textDecoration:'none', boxShadow:`0 2px 10px rgba(15,118,110,0.08)`, transition:'all 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow=`0 4px 18px rgba(15,118,110,0.18)`)}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow=`0 2px 10px rgba(15,118,110,0.08)`)}>
                  <div style={{ width:40, height:40, borderRadius:10, background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px rgba(15,118,110,0.35)` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:t.textPri }}>Download PDF</span>
                  <span style={{ fontSize:10, color:t.textSubtle }}>Quick Bid report</span>
                </a>
              )}
              <button onClick={() => router.push('/dashboard/roofing/calculator')}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'18px 12px', borderRadius:14, background:t.cardBg, border:`1.5px solid ${t.cardBorder}`, cursor:'pointer', transition:'all 0.15s', boxShadow:`0 2px 8px rgba(10,22,40,0.05)` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor=TEAL)}
                onMouseLeave={e => (e.currentTarget.style.borderColor=t.cardBorder)}>
                <div style={{ width:40, height:40, borderRadius:10, background:'#F0FDFA', border:`1px solid rgba(15,118,110,0.15)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:t.textPri }}>Open Calculator</span>
                <span style={{ fontSize:10, color:TEAL, fontWeight:600 }}>Pre-filled ✓</span>
              </button>
              <button onClick={() => { setStep('search'); setReport(null); setProgress(0); setStatusMsg('') }}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'18px 12px', borderRadius:14, background:t.cardBg, border:`1.5px solid ${t.cardBorder}`, cursor:'pointer', transition:'all 0.15s', boxShadow:`0 2px 8px rgba(10,22,40,0.05)` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor=TEAL)}
                onMouseLeave={e => (e.currentTarget.style.borderColor=t.cardBorder)}>
                <div style={{ width:40, height:40, borderRadius:10, background:'#F0FDFA', border:`1px solid rgba(15,118,110,0.15)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:t.textPri }}>New Report</span>
                <span style={{ fontSize:10, color:t.textSubtle }}>Different address</span>
              </button>
            </div>

            {/* Measurements detail card */}
            <div style={{ background:t.cardBg, borderRadius:14, border:`1px solid ${t.cardBorder}`, padding:'18px 20px', boxShadow:`0 2px 8px rgba(10,22,40,0.05)` }}>
              <p style={{ fontSize:11, fontWeight:700, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 14px' }}>Measurements</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
                {[
                  { label:'Total Squares', value: report.total_squares_order ? `${report.total_squares_order} sq` : '—' },
                  { label:'Dominant Pitch', value: report.dominant_pitch || '—' },
                  { label:'Waste Factor', value: report.waste_factor ? `${report.waste_factor}%` : '—' },
                  { label:'Facets', value: report.facet_count ? `${report.facet_count}` : '—' },
                ].map(m => (
                  <div key={m.label} style={{ padding:'12px 14px', borderRadius:10, background:dk?t.cardBgAlt:'#F7F6F3', border:`1px solid ${t.cardBorder}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:18, fontWeight:800, color:t.textPri, letterSpacing:'-0.02em' }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Error ── */}
        {step === 'error' && (
          <div style={{ background:t.cardBg, borderRadius:16, border:'1px solid #FECACA', padding:'32px 28px', textAlign:'center', boxShadow:`0 4px 20px rgba(220,38,38,0.08)` }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 style={{ fontSize:16, fontWeight:700, color:t.textPri, margin:'0 0 8px' }}>Report failed</h3>
            <p style={{ fontSize:13, color:'#DC2626', margin:'0 0 20px' }}>{errMsg}</p>
            <button onClick={() => setStep('confirm')}
              style={{ padding:'10px 24px', borderRadius:9, background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:`0 4px 14px rgba(15,118,110,0.35)` }}>
              Try again
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pg-spin  { to { transform: rotate(360deg); } }
        @keyframes pg-pulse { 0%,100% { box-shadow: 0 8px 24px rgba(15,118,110,0.4); } 50% { box-shadow: 0 8px 32px rgba(15,118,110,0.65); } }
      `}</style>
    </DashboardShell>
  )
}

export default function QuickBidPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:24, height:24, borderRadius:'50%', border:`3px solid rgba(15,118,110,0.2)`, borderTopColor:'#0F766E', animation:'spin 0.7s linear infinite' }}/>
      </div>
    }>
      <QuickBidInner />
    </Suspense>
  )
}
