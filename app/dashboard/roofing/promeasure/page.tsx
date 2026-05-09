'use client'
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Session } from '@/types'

// ── Pitch factors ─────────────────────────────────────────────────────────────
const PITCH_FACTORS: Record<string, number> = {
  '2/12':1.014,'3/12':1.031,'4/12':1.054,'5/12':1.083,
  '6/12':1.118,'7/12':1.158,'8/12':1.202,'9/12':1.250,
  '10/12':1.302,'11/12':1.357,'12/12':1.414,
}

// ── Default settings ──────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  markerColor:   '#14B8A6',
  fillColor:     '#14B8A6',
  borderColor:   '#0F766E',
  borderWidth:   2,
  fillOpacity:   0.20,
  linearMode:    false,
  snapToVertex:  false,
  showArea:      true,
  showPerimeter: true,
  measureUnit:   'imperial' as 'imperial' | 'metric',
}
type Settings = typeof DEFAULT_SETTINGS

declare global { interface Window { google: any; __pgMapCb: () => void } }

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = [
  '#14B8A6','#0F766E','#6366F1','#8B5CF6','#EC4899','#EF4444',
  '#F97316','#EAB308','#22C55E','#06B6D4','#3B82F6','#F43F5E',
  '#FFFFFF','#94A3B8','#475569','#1E293B',
]

function Swatch({ color, active, onClick }: { color:string; active:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} title={color}
      style={{ width:28, height:28, borderRadius:6, background:color, border: active ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.15)',
        boxShadow: active ? `0 0 0 2px ${color}` : 'none', cursor:'pointer', transition:'transform 0.1s', flexShrink:0 }}
      onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.15)')}
      onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')} />
  )
}

// ── SVG icons (clean, modern) ─────────────────────────────────────────────────
function Icon({ d, size=16, color='currentColor', sw=1.8 }: {d:string;size?:number;color?:string;sw?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
}

function ProMeasureInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initAddress = searchParams.get('address') || ''

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro'); return s ? JSON.parse(s) : null
  })

  const mapDivRef  = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<any>(null)
  const polyRef    = useRef<any>(null)
  const markers    = useRef<any[]>([])
  const acRef      = useRef<any>(null)  // autocomplete instance

  const [address,     setAddress]     = useState(initAddress)
  const [pitch,       setPitch]       = useState('4/12')
  const [waste,       setWaste]       = useState(10)
  const [pins,        setPins]        = useState(0)
  const [area,        setArea]        = useState<number|null>(null)
  const [perim,       setPerim]       = useState<number|null>(null)
  const [mapReady,    setMapReady]    = useState(false)
  const [apiErr,      setApiErr]      = useState('')
  const [settingsOpen,setSettingsOpen]= useState(false)
  const [settings,    setSettings]    = useState<Settings>(() => {
    if (typeof window==='undefined') return DEFAULT_SETTINGS
    try { const s=localStorage.getItem('pg_pm_settings'); return s ? {...DEFAULT_SETTINGS,...JSON.parse(s)} : DEFAULT_SETTINGS } catch { return DEFAULT_SETTINGS }
  })
  const [colorTarget, setColorTarget] = useState<keyof Settings|null>(null)
  // multiple named polygons
  const [regions, setRegions] = useState<{name:string;sqFt:number;color:string}[]>([])

  // ── Persist settings ─────────────────────────────────────────────────────
  function saveSetting<K extends keyof Settings>(key: K, val: Settings[K]) {
    const next = {...settings, [key]: val}
    setSettings(next)
    localStorage.setItem('pg_pm_settings', JSON.stringify(next))
    // Live-update polygon if it exists
    if (polyRef.current) {
      if (key==='fillColor'||key==='fillOpacity'||key==='borderColor'||key==='borderWidth') {
        polyRef.current.setOptions({
          fillColor: next.fillColor, fillOpacity: next.fillOpacity,
          strokeColor: next.borderColor, strokeWeight: next.borderWidth,
        })
      }
    }
    // Live-update marker icons
    if (key==='markerColor') {
      markers.current.forEach(m => m.setIcon({
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7, fillColor: next.markerColor, fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 2,
      }))
    }
  }

  // ── Build map ─────────────────────────────────────────────────────────────
  const buildMap = useCallback(() => {
    const div = mapDivRef.current
    if (!div || !window.google?.maps?.Map) return

    const map = new window.google.maps.Map(div, {
      zoom: 19,
      center: { lat: 30.3322, lng: -81.6557 },
      mapTypeId: 'satellite',
      tilt: 0,
      streetViewControl: false,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    })
    mapRef.current = map
    setMapReady(true)

    map.addListener('click', (e: any) => {
      if (!e.latLng) return
      addPin(e.latLng, map)
    })

    // Autocomplete — uses the address input
    const input = document.getElementById('pm-address-input') as HTMLInputElement
    if (input && window.google.maps.places?.Autocomplete) {
      const ac = new window.google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place?.geometry?.location) {
          map.setCenter(place.geometry.location)
          map.setZoom(20)
          setAddress(place.formatted_address || input.value)
        }
      })
      acRef.current = ac
    }
  }, [])

  function addPin(latLng: any, map: any) {
    const s = settings
    const marker = new window.google.maps.Marker({
      position: latLng, map, draggable: true,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7, fillColor: s.markerColor, fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 2,
      },
    })
    markers.current.push(marker)
    marker.addListener('drag', () => redraw(map))
    marker.addListener('dblclick', () => {
      marker.setMap(null)
      markers.current = markers.current.filter(m => m !== marker)
      redraw(map)
    })
    redraw(map)
  }

  function redraw(map: any) {
    const pts = markers.current.map(m => m.getPosition()).filter(Boolean)
    setPins(pts.length)
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null }
    if (pts.length < 2) { setArea(null); setPerim(null); return }
    const s = settings
    polyRef.current = new window.google.maps.Polygon({
      paths: pts, map,
      strokeColor: s.borderColor, strokeOpacity: 0.95, strokeWeight: s.borderWidth,
      fillColor: s.fillColor, fillOpacity: s.fillOpacity,
    })
    if (pts.length >= 3) {
      const sqM = window.google.maps.geometry.spherical.computeArea(pts)
      setArea(sqM * 10.7639)
      let p = 0
      for (let i=0; i<pts.length; i++)
        p += window.google.maps.geometry.spherical.computeDistanceBetween(pts[i], pts[(i+1)%pts.length])
      setPerim(p * 3.28084)
    }
  }

  function undo() {
    const m = markers.current.pop()
    if (m) { m.setMap(null); if (mapRef.current) redraw(mapRef.current) }
  }
  function clearAll() {
    markers.current.forEach(m => m.setMap(null)); markers.current = []
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null }
    setPins(0); setArea(null); setPerim(null)
  }

  function saveRegion() {
    if (!area) return
    const name = `Region ${regions.length + 1}`
    setRegions(r => [...r, { name, sqFt: area!, color: settings.fillColor }])
    clearAll()
  }

  function pushToCalc() {
    const totalSqFt = regions.length > 0
      ? regions.reduce((s,r) => s+r.sqFt, 0) + (area||0)
      : area||0
    sessionStorage.setItem('pg_promeasure', JSON.stringify({
      squares: +(totalSqFt/100).toFixed(2), pitch, waste,
      perimeter: perim ? +perim.toFixed(1) : null, address,
    }))
    router.push('/dashboard/roofing/calculator?from=promeasure')
  }

  // ── Load Maps ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { router.push('/login'); return }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!key) { setApiErr('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set.'); return }
    if (window.google?.maps?.Map) { buildMap(); return }
    window.__pgMapCb = buildMap
    if (!document.getElementById('gmap-script')) {
      const s = document.createElement('script')
      s.id = 'gmap-script'
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry,places&callback=__pgMapCb`
      s.onerror = () => setApiErr('Failed to load Google Maps — check API key and billing.')
      document.head.appendChild(s)
    }
  }, [session, buildMap, router])

  // ── Computed ─────────────────────────────────────────────────────────────
  const rawSq  = (area||0) / 100
  const adjSq  = rawSq * (PITCH_FACTORS[pitch]||1.054) * (1+waste/100)
  const totalRegionSqFt = regions.reduce((s,r)=>s+r.sqFt,0)
  const grandSqFt = totalRegionSqFt + (area||0)
  const grandAdj  = (grandSqFt/100) * (PITCH_FACTORS[pitch]||1.054) * (1+waste/100)

  const fmt = (n: number) => n.toLocaleString(undefined,{maximumFractionDigits:0})
  const fmtSq = (n: number) => n.toFixed(2)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', fontFamily:'-apple-system, BlinkMacSystemFont, "Inter", sans-serif', zIndex:10, background:'#0A0F1A' }}>

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div style={{ height:56, flexShrink:0, background:'rgba(15,20,35,0.97)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', gap:12, padding:'0 16px' }}>

        {/* Back */}
        <button onClick={() => router.back()}
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, color:'rgba(255,255,255,0.55)', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 12px', cursor:'pointer', flexShrink:0, transition:'all 0.15s' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='#fff';(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.1)'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.55)';(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)'}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>

        {/* Logo + title */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#14B8A6,#0F766E)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 12px rgba(20,184,166,0.4)' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff', letterSpacing:'-0.02em' }}>ProMeasure</div>
            <div style={{ fontSize:10, color:'rgba(20,184,166,0.8)', fontWeight:600, letterSpacing:'0.08em', marginTop:-1 }}>SATELLITE ROOF TOOL</div>
          </div>
        </div>

        {/* Address autocomplete */}
        <div style={{ flex:1, position:'relative', maxWidth:520 }}>
          <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input id="pm-address-input"
            value={address} onChange={e => setAddress(e.target.value)}
            placeholder="Search address — autocomplete enabled"
            style={{ width:'100%', padding:'9px 14px 9px 36px', borderRadius:10, border:'1.5px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.07)', color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box', transition:'border-color 0.2s' }}
            onFocus={e => (e.target.style.borderColor='rgba(20,184,166,0.6)')}
            onBlur={e => (e.target.style.borderColor='rgba(255,255,255,0.12)')} />
        </div>

        {/* Pitch */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Pitch</span>
          <select value={pitch} onChange={e=>setPitch(e.target.value)}
            style={{ padding:'7px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.07)', color:'#fff', fontSize:13, cursor:'pointer' }}>
            {Object.keys(PITCH_FACTORS).map(p=><option key={p} value={p} style={{background:'#1a2035'}}>{p}</option>)}
          </select>
        </div>

        {/* Waste */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Waste</span>
          <select value={waste} onChange={e=>setWaste(Number(e.target.value))}
            style={{ padding:'7px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.07)', color:'#fff', fontSize:13, cursor:'pointer' }}>
            {[5,8,10,12,15,20].map(w=><option key={w} value={w} style={{background:'#1a2035'}}>{w}%</option>)}
          </select>
        </div>

        {/* Settings toggle */}
        <button onClick={()=>setSettingsOpen(s=>!s)}
          style={{ width:36, height:36, borderRadius:9, border:`1.5px solid ${settingsOpen ? 'rgba(20,184,166,0.6)' : 'rgba(255,255,255,0.12)'}`, background: settingsOpen ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.06)', color: settingsOpen ? '#14B8A6' : 'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, transition:'all 0.2s' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* ══ BODY ══════════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── MAP ─────────────────────────────────────────────────────────── */}
        <div style={{ flex:1, position:'relative', background:'#0a0f1a' }}>
          {apiErr ? (
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
              <div style={{ fontSize:48 }}>🗺️</div>
              <p style={{ fontWeight:700, color:'#EF4444', textAlign:'center', maxWidth:400 }}>{apiErr}</p>
            </div>
          ) : (
            <>
              <div ref={mapDivRef} style={{ position:'absolute', top:0, left:0, right:0, bottom:0 }} />

              {!mapReady && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10,15,26,0.8)' }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ width:40, height:40, border:'2.5px solid #14B8A6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
                    <p style={{ color:'rgba(255,255,255,0.6)', fontSize:14 }}>Loading satellite imagery…</p>
                  </div>
                </div>
              )}

              {/* Instruction tooltip */}
              {mapReady && pins === 0 && (
                <div style={{ position:'absolute', top:16, left:'50%', transform:'translateX(-50%)', background:'rgba(15,20,35,0.88)', backdropFilter:'blur(8px)', color:'#fff', padding:'10px 20px', borderRadius:24, fontSize:13, fontWeight:600, pointerEvents:'none', whiteSpace:'nowrap', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
                  Click to place pins around the roof perimeter · Double-click pin to remove
                </div>
              )}

              {/* Active measurement badge */}
              {area && pins >= 3 && (
                <div style={{ position:'absolute', top:16, left:16, background:'rgba(15,20,35,0.9)', backdropFilter:'blur(8px)', border:'1px solid rgba(20,184,166,0.4)', borderRadius:14, padding:'10px 16px', boxShadow:'0 4px 24px rgba(0,0,0,0.4)' }}>
                  <div style={{ fontSize:11, color:'rgba(20,184,166,0.8)', fontWeight:700, letterSpacing:'0.07em', marginBottom:4 }}>ACTIVE REGION</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>{fmtSq(rawSq)} <span style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>sq</span></div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{fmt(area||0)} sq ft</div>
                </div>
              )}

              {/* Map controls */}
              {mapReady && pins > 0 && (
                <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', display:'flex', gap:8, alignItems:'center' }}>
                  {area && (
                    <button onClick={saveRegion}
                      style={{ padding:'10px 18px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#14B8A6,#0F766E)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(20,184,166,0.4)', display:'flex', alignItems:'center', gap:6 }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                      Save Region
                    </button>
                  )}
                  <button onClick={undo}
                    style={{ padding:'10px 16px', borderRadius:12, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(15,20,35,0.85)', backdropFilter:'blur(8px)', color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    ↩ Undo
                  </button>
                  <button onClick={clearAll}
                    style={{ padding:'10px 16px', borderRadius:12, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.1)', color:'#F87171', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
        <div style={{ width:260, flexShrink:0, background:'rgba(15,20,35,0.97)', borderLeft:'1px solid rgba(255,255,255,0.07)', display:'flex', flexDirection:'column', overflowY:'auto' }}>

          {/* Settings panel */}
          {settingsOpen ? (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Map Settings</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:1 }}>Customize drawing appearance</div>
                </div>
                <button onClick={()=>{setSettings(DEFAULT_SETTINGS);localStorage.removeItem('pg_pm_settings')}}
                  title="Reset to defaults"
                  style={{ fontSize:11, color:'rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'4px 8px', cursor:'pointer' }}>
                  Reset
                </button>
              </div>

              {/* Toggles */}
              {([
                ['linearMode', 'Linear Mode', 'Add straight line segments'],
                ['snapToVertex','Snap to Vertex','Auto-snap near existing pins'],
                ['showArea','Show Area Label','Display area on map'],
                ['showPerimeter','Show Perimeter Label','Display perimeter on map'],
              ] as [keyof Settings, string, string][]).map(([key,label,sub])=>(
                <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{label}</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:1 }}>{sub}</div>
                  </div>
                  <button onClick={()=>saveSetting(key, !settings[key] as any)}
                    style={{ width:40, height:22, borderRadius:11, border:'none', cursor:'pointer', transition:'background 0.2s', background: settings[key] ? '#14B8A6' : 'rgba(255,255,255,0.12)', position:'relative', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:3, left: settings[key] ? 20 : 3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>
              ))}

              {/* Color pickers */}
              {([
                ['markerColor','Marker Color'],
                ['fillColor','Fill Color'],
                ['borderColor','Border Color'],
              ] as [keyof Settings, string][]).map(([key, label])=>(
                <div key={key} style={{ padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: colorTarget===key ? 10 : 0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{label}</div>
                    <button onClick={()=>setColorTarget(colorTarget===key ? null : key)}
                      style={{ width:28, height:28, borderRadius:7, border:'2px solid rgba(255,255,255,0.2)', background: settings[key] as string, cursor:'pointer', flexShrink:0 }} />
                  </div>
                  {colorTarget===key && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                      {COLORS.map(c=>(
                        <Swatch key={c} color={c} active={settings[key]===c}
                          onClick={()=>{saveSetting(key, c as any); setColorTarget(null)}} />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Border width */}
              <div style={{ padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>Border Width</div>
                  <span style={{ fontSize:13, fontWeight:700, color:'#14B8A6' }}>{settings.borderWidth}px</span>
                </div>
                <input type="range" min={1} max={8} step={0.5} value={settings.borderWidth}
                  onChange={e=>saveSetting('borderWidth', +e.target.value)}
                  style={{ width:'100%', accentColor:'#14B8A6' }} />
              </div>

              {/* Fill opacity */}
              <div style={{ padding:'12px 0' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>Fill Opacity</div>
                  <span style={{ fontSize:13, fontWeight:700, color:'#14B8A6' }}>{Math.round(settings.fillOpacity*100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={settings.fillOpacity}
                  onChange={e=>saveSetting('fillOpacity', +e.target.value)}
                  style={{ width:'100%', accentColor:'#14B8A6' }} />
              </div>
            </div>
          ) : (
            /* ── Measurements panel ── */
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14, flex:1 }}>

              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'rgba(255,255,255,0.3)' }}>Live Measurements</div>

              {/* Stats grid */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {([
                  ['Pins','',String(pins),false],
                  ['Perimeter','LF', perim ? fmt(perim) : '—', false],
                  ['Area','sq ft', area ? fmt(area) : '—', !!area],
                  ['Raw Squares','sq', area ? fmtSq(rawSq) : '—', !!area],
                ] as [string,string,string,boolean][]).map(([label,unit,val,hi])=>(
                  <div key={label} style={{ background: hi ? 'rgba(20,184,166,0.1)' : 'rgba(255,255,255,0.04)', borderRadius:12, padding:'12px', border: hi ? '1px solid rgba(20,184,166,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontWeight:600, letterSpacing:'0.06em', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:18, fontWeight:800, color: hi ? '#14B8A6' : '#fff' }}>{val}</div>
                    {unit && <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:1 }}>{unit}</div>}
                  </div>
                ))}
              </div>

              {/* Adjusted squares */}
              {area && (
                <div style={{ background:'linear-gradient(135deg,rgba(20,184,166,0.15),rgba(15,118,110,0.1))', border:'1.5px solid rgba(20,184,166,0.35)', borderRadius:14, padding:16 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'rgba(20,184,166,0.8)', letterSpacing:'0.1em', marginBottom:6 }}>ADJUSTED SQUARES</div>
                  <div style={{ fontSize:36, fontWeight:900, color:'#14B8A6', letterSpacing:'-0.02em' }}>{fmtSq(adjSq)}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>
                    {fmtSq(rawSq)} sq × {PITCH_FACTORS[pitch]} pitch × {1+waste/100} waste
                  </div>
                </div>
              )}

              {/* Saved regions */}
              {regions.length > 0 && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'rgba(255,255,255,0.3)', marginBottom:8 }}>Saved Regions</div>
                  {regions.map((r,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:10, height:10, borderRadius:3, background:r.color, flexShrink:0 }} />
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>{r.name}</span>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{fmtSq(r.sqFt/100)} sq</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>{fmt(r.sqFt)} sq ft</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop:10, padding:'10px 12px', background:'rgba(255,255,255,0.04)', borderRadius:10, border:'1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>GRAND TOTAL</div>
                    <div style={{ fontSize:20, fontWeight:800, color:'#14B8A6' }}>{fmtSq(grandAdj)} adj sq</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{fmt(grandSqFt)} sq ft total</div>
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                {(area || regions.length > 0) && (
                  <button onClick={pushToCalc}
                    style={{ padding:'13px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#14B8A6 0%,#0F766E 100%)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(20,184,166,0.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    Push to Calculator
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                )}
                {!area && regions.length === 0 && (
                  <p style={{ fontSize:12, color:'rgba(255,255,255,0.25)', textAlign:'center', lineHeight:1.6 }}>
                    Search an address above, then click the roof outline to drop measurement pins
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        #pm-address-input::placeholder { color: rgba(255,255,255,0.3) }
        .pac-container { border-radius:12px !important; border:1px solid rgba(255,255,255,0.12) !important; background:#1a2035 !important; box-shadow:0 8px 32px rgba(0,0,0,0.5) !important; margin-top:4px !important; font-family:inherit !important }
        .pac-item { color:rgba(255,255,255,0.7) !important; border-top:1px solid rgba(255,255,255,0.06) !important; padding:8px 14px !important; font-size:13px !important; cursor:pointer }
        .pac-item:hover { background:rgba(20,184,166,0.1) !important }
        .pac-item-query { color:#fff !important; font-weight:600 }
        .pac-matched { color:#14B8A6 !important }
      `}</style>
    </div>
  )
}

export default function ProMeasurePage() {
  return (
    <Suspense fallback={
      <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#0A0F1A' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:40, height:40, border:'2.5px solid #14B8A6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14 }}>Loading ProMeasure…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <ProMeasureInner />
    </Suspense>
  )
}
