'use client'
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Session } from '@/types'

const PITCH_FACTORS: Record<string, number> = {
  '2/12':1.014,'3/12':1.031,'4/12':1.054,'5/12':1.083,
  '6/12':1.118,'7/12':1.158,'8/12':1.202,'9/12':1.250,
  '10/12':1.302,'11/12':1.357,'12/12':1.414,
}

const DEFAULT_SETTINGS = {
  markerColor:'#14B8A6', fillColor:'#14B8A6', borderColor:'#0F766E',
  borderWidth:2, fillOpacity:0.20, linearMode:false, snapToVertex:false,
  showArea:true, showPerimeter:true,
}
type Settings = typeof DEFAULT_SETTINGS

const COLORS = [
  '#14B8A6','#0F766E','#6366F1','#8B5CF6','#EC4899','#EF4444',
  '#F97316','#EAB308','#22C55E','#06B6D4','#3B82F6','#F43F5E',
  '#FFFFFF','#94A3B8','#475569','#1E293B',
]

const MAX_RECENT = 8

declare global { interface Window { google: any; __pgMapCb: () => void } }

function ProMeasureInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initAddress = searchParams.get('address') || ''

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro'); return s ? JSON.parse(s) : null
  })

  // ── Dark mode — respects pg_darkmode like all other pages ─────────────────
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )

  // Theme tokens
  const T = {
    topBar:      dk ? 'rgba(15,20,35,0.97)'  : 'rgba(255,255,255,0.97)',
    topBorder:   dk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    panel:       dk ? 'rgba(15,20,35,0.97)'  : '#FFFFFF',
    panelBorder: dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    text:        dk ? '#FFFFFF'              : '#111827',
    textMuted:   dk ? 'rgba(255,255,255,0.5)' : '#6B7280',
    textSubtle:  dk ? 'rgba(255,255,255,0.3)' : '#9CA3AF',
    inputBg:     dk ? 'rgba(255,255,255,0.07)' : '#F9FAFB',
    inputBorder: dk ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
    cardBg:      dk ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
    cardBorder:  dk ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
    cardHi:      dk ? 'rgba(20,184,166,0.1)'  : '#F0FDFA',
    cardHiBorder:dk ? 'rgba(20,184,166,0.3)'  : '#99F6E4',
    btnBack:     dk ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
    btnBorder:   dk ? 'rgba(255,255,255,0.1)'  : '#E5E7EB',
    settingsBg:  dk ? 'rgba(20,184,166,0.15)' : '#F0FDFA',
    settingsBorder: dk ? 'rgba(20,184,166,0.6)' : '#14B8A6',
    divider:     dk ? 'rgba(255,255,255,0.05)' : '#F0F0F0',
    recentBg:    dk ? '#1a2235'              : '#FFFFFF',
    recentBorder:dk ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
    recentHover: dk ? 'rgba(20,184,166,0.1)'  : '#F0FDFA',
    pageBg:      dk ? '#0A0F1A'              : '#F5F4F0',
  }

  const mapDivRef  = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<any>(null)
  const polyRef    = useRef<any>(null)
  const markers    = useRef<any[]>([])
  const inputRef   = useRef<HTMLInputElement>(null)

  const [address,      setAddress]      = useState(initAddress)
  const [pitch,        setPitch]        = useState('4/12')
  const [waste,        setWaste]        = useState(10)
  const [pins,         setPins]         = useState(0)
  const [area,         setArea]         = useState<number|null>(null)
  const [perim,        setPerim]        = useState<number|null>(null)
  const [mapReady,     setMapReady]     = useState(false)
  const [apiErr,       setApiErr]       = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorTarget,  setColorTarget]  = useState<keyof Settings|null>(null)
  const [regions,      setRegions]      = useState<{name:string;sqFt:number;color:string}[]>([])
  const [showRecent,   setShowRecent]   = useState(false)
  const [recentAddrs,  setRecentAddrs]  = useState<string[]>([])

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window==='undefined') return DEFAULT_SETTINGS
    try { const s=localStorage.getItem('pg_pm_settings'); return s?{...DEFAULT_SETTINGS,...JSON.parse(s)}:DEFAULT_SETTINGS } catch { return DEFAULT_SETTINGS }
  })

  // Load recent addresses
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pg_pm_recent')
      if (raw) setRecentAddrs(JSON.parse(raw))
    } catch {}
  }, [])

  function saveRecentAddress(addr: string) {
    if (!addr.trim()) return
    setRecentAddrs(prev => {
      const next = [addr, ...prev.filter(a => a !== addr)].slice(0, MAX_RECENT)
      localStorage.setItem('pg_pm_recent', JSON.stringify(next))
      return next
    })
  }

  function removeRecent(addr: string) {
    setRecentAddrs(prev => {
      const next = prev.filter(a => a !== addr)
      localStorage.setItem('pg_pm_recent', JSON.stringify(next))
      return next
    })
  }

  function saveSetting<K extends keyof Settings>(key: K, val: Settings[K]) {
    const next = {...settings, [key]: val}
    setSettings(next)
    localStorage.setItem('pg_pm_settings', JSON.stringify(next))
    if (polyRef.current) {
      if (['fillColor','fillOpacity','borderColor','borderWidth'].includes(key as string)) {
        polyRef.current.setOptions({
          fillColor:next.fillColor, fillOpacity:next.fillOpacity,
          strokeColor:next.borderColor, strokeWeight:next.borderWidth,
        })
      }
    }
    if (key==='markerColor') {
      markers.current.forEach(m => m.setIcon({
        path:window.google.maps.SymbolPath.CIRCLE,
        scale:7, fillColor:next.markerColor, fillOpacity:1,
        strokeColor:'#fff', strokeWeight:2,
      }))
    }
  }

  const buildMap = useCallback(() => {
    const div = mapDivRef.current
    if (!div || !window.google?.maps?.Map) return

    const map = new window.google.maps.Map(div, {
      zoom:19, center:{lat:30.3322,lng:-81.6557},
      mapTypeId:'satellite', tilt:0,
      streetViewControl:false, mapTypeControl:true,
      fullscreenControl:true, zoomControl:true, gestureHandling:'greedy',
    })
    mapRef.current = map
    setMapReady(true)

    map.addListener('click', (e:any) => { if (e.latLng) addPin(e.latLng, map) })

    // Autocomplete
    const input = document.getElementById('pm-address-input') as HTMLInputElement
    if (input && window.google.maps.places?.Autocomplete) {
      const ac = new window.google.maps.places.Autocomplete(input, {
        types:['address'], componentRestrictions:{country:'us'},
      })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place?.geometry?.location) {
          map.setCenter(place.geometry.location)
          map.setZoom(20)
          const addr = place.formatted_address || input.value
          setAddress(addr)
          saveRecentAddress(addr)
          setShowRecent(false)
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addPin(latLng: any, map: any) {
    const marker = new window.google.maps.Marker({
      position:latLng, map, draggable:true,
      icon:{ path:window.google.maps.SymbolPath.CIRCLE, scale:7,
        fillColor:settings.markerColor, fillOpacity:1, strokeColor:'#fff', strokeWeight:2 },
    })
    markers.current.push(marker)
    marker.addListener('drag', () => redraw(map))
    marker.addListener('dblclick', () => {
      marker.setMap(null)
      markers.current = markers.current.filter(m=>m!==marker)
      redraw(map)
    })
    redraw(map)
  }

  function redraw(map: any) {
    const pts = markers.current.map(m=>m.getPosition()).filter(Boolean)
    setPins(pts.length)
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current=null }
    if (pts.length < 2) { setArea(null); setPerim(null); return }
    polyRef.current = new window.google.maps.Polygon({
      paths:pts, map,
      strokeColor:settings.borderColor, strokeOpacity:0.95, strokeWeight:settings.borderWidth,
      fillColor:settings.fillColor, fillOpacity:settings.fillOpacity,
    })
    if (pts.length >= 3) {
      setArea(window.google.maps.geometry.spherical.computeArea(pts)*10.7639)
      let p=0
      for(let i=0;i<pts.length;i++)
        p+=window.google.maps.geometry.spherical.computeDistanceBetween(pts[i],pts[(i+1)%pts.length])
      setPerim(p*3.28084)
    }
  }

  function undo() {
    const m=markers.current.pop()
    if(m){m.setMap(null);if(mapRef.current)redraw(mapRef.current)}
  }

  function clearAll() {
    markers.current.forEach(m=>m.setMap(null)); markers.current=[]
    if(polyRef.current){polyRef.current.setMap(null);polyRef.current=null}
    setPins(0);setArea(null);setPerim(null)
  }

  function saveRegion() {
    if(!area) return
    setRegions(r=>[...r,{name:`Region ${r.length+1}`,sqFt:area!,color:settings.fillColor}])
    clearAll()
  }

  function geocodeAddress(addr: string) {
    if(!addr.trim()||!window.google?.maps?.Geocoder) return
    new window.google.maps.Geocoder().geocode({address:addr},(res:any,status:any)=>{
      if(status==='OK'&&res?.[0]&&mapRef.current){
        mapRef.current.setCenter(res[0].geometry.location)
        mapRef.current.setZoom(20)
        saveRecentAddress(addr)
        setShowRecent(false)
      } else {
        alert('Address not found — try including city and state.')
      }
    })
  }

  function pushToCalc() {
    const totalSqFt = regions.reduce((s,r)=>s+r.sqFt,0)+(area||0)
    sessionStorage.setItem('pg_promeasure',JSON.stringify({
      squares:+(totalSqFt/100).toFixed(2),pitch,waste,
      perimeter:perim?+perim.toFixed(1):null,address,
    }))
    router.push('/dashboard/roofing/calculator?from=promeasure')
  }

  useEffect(() => {
    if(!session){router.push('/login');return}
    const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if(!key){setApiErr('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set.');return}
    if(window.google?.maps?.Map){buildMap();return}
    window.__pgMapCb=buildMap
    if(!document.getElementById('gmap-script')){
      const s=document.createElement('script')
      s.id='gmap-script'
      s.src=`https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry,places&callback=__pgMapCb`
      s.onerror=()=>setApiErr('Failed to load Google Maps — check API key.')
      document.head.appendChild(s)
    }
  },[session,buildMap,router])

  const rawSq = (area||0)/100
  const adjSq = rawSq*(PITCH_FACTORS[pitch]||1.054)*(1+waste/100)
  const totalSqFt = regions.reduce((s,r)=>s+r.sqFt,0)+(area||0)
  const grandAdj  = (totalSqFt/100)*(PITCH_FACTORS[pitch]||1.054)*(1+waste/100)
  const fmt  = (n:number) => n.toLocaleString(undefined,{maximumFractionDigits:0})
  const fmtSq= (n:number) => n.toFixed(2)

  // Close recent dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('#pm-address-wrapper')) setShowRecent(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Measurements panel — always visible, settings overlays below ──────────
  const MeasurementsPanel = () => (
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:T.textSubtle}}>
        Live Measurements
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {([
          ['Pins','',String(pins),false],
          ['Perimeter','LF',perim?fmt(perim):'—',false],
          ['Area','sq ft',area?fmt(area):'—',!!area],
          ['Squares','sq',area?fmtSq(rawSq):'—',!!area],
        ] as [string,string,string,boolean][]).map(([label,unit,val,hi])=>(
          <div key={label} style={{background:hi?T.cardHi:T.cardBg,borderRadius:12,padding:'12px',border:`1px solid ${hi?T.cardHiBorder:T.cardBorder}`}}>
            <div style={{fontSize:10,color:T.textSubtle,fontWeight:600,letterSpacing:'0.06em',marginBottom:4}}>{label}</div>
            <div style={{fontSize:18,fontWeight:800,color:hi?'#14B8A6':T.text}}>{val}</div>
            {unit&&<div style={{fontSize:10,color:T.textSubtle,marginTop:1}}>{unit}</div>}
          </div>
        ))}
      </div>

      {area&&(
        <div style={{background:`linear-gradient(135deg,${T.cardHi},${dk?'rgba(15,118,110,0.1)':'#CCFBF1'})`,border:`1.5px solid ${T.cardHiBorder}`,borderRadius:14,padding:16}}>
          <div style={{fontSize:10,fontWeight:700,color:'#14B8A6',letterSpacing:'0.1em',marginBottom:6}}>ADJUSTED SQUARES</div>
          <div style={{fontSize:36,fontWeight:900,color:'#14B8A6',letterSpacing:'-0.02em'}}>{fmtSq(adjSq)}</div>
          <div style={{fontSize:11,color:T.textMuted,marginTop:4}}>
            {fmtSq(rawSq)} × {PITCH_FACTORS[pitch]} pitch × {1+waste/100} waste
          </div>
        </div>
      )}

      {regions.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:T.textSubtle,marginBottom:8}}>Saved Regions</div>
          {regions.map((r,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${T.divider}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:10,height:10,borderRadius:3,background:r.color,flexShrink:0}}/>
                <span style={{fontSize:13,color:T.textMuted}}>{r.name}</span>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{fmtSq(r.sqFt/100)} sq</div>
                <div style={{fontSize:10,color:T.textSubtle}}>{fmt(r.sqFt)} sq ft</div>
              </div>
            </div>
          ))}
          <div style={{marginTop:10,padding:'10px 12px',background:T.cardBg,borderRadius:10,border:`1px solid ${T.cardBorder}`}}>
            <div style={{fontSize:11,color:T.textSubtle,marginBottom:3}}>GRAND TOTAL</div>
            <div style={{fontSize:20,fontWeight:800,color:'#14B8A6'}}>{fmtSq(grandAdj)} adj sq</div>
            <div style={{fontSize:11,color:T.textSubtle}}>{fmt(totalSqFt)} sq ft total</div>
          </div>
        </div>
      )}

      <div style={{marginTop:'auto',display:'flex',flexDirection:'column',gap:8}}>
        {(area||regions.length>0)&&(
          <button onClick={pushToCalc}
            style={{padding:'13px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#14B8A6,#0F766E)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 16px rgba(20,184,166,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            Push to Calculator
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        )}
        {!area&&regions.length===0&&(
          <p style={{fontSize:12,color:T.textSubtle,textAlign:'center',lineHeight:1.6}}>
            Search an address above, then click the roof outline to drop pins
          </p>
        )}
      </div>
    </div>
  )

  const SettingsPanel = () => (
    <div style={{padding:20,borderTop:`1px solid ${T.divider}`}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>Map Settings</div>
          <div style={{fontSize:11,color:T.textSubtle,marginTop:1}}>Drawing appearance</div>
        </div>
        <button onClick={()=>{setSettings(DEFAULT_SETTINGS);localStorage.removeItem('pg_pm_settings')}}
          style={{fontSize:11,color:T.textMuted,background:T.cardBg,border:`1px solid ${T.cardBorder}`,borderRadius:7,padding:'4px 8px',cursor:'pointer'}}>
          Reset
        </button>
      </div>

      {([
        ['linearMode','Linear Mode','Straight line segments'],
        ['snapToVertex','Snap to Vertex','Auto-snap near pins'],
        ['showArea','Show Area Label',''],
        ['showPerimeter','Show Perimeter Label',''],
      ] as [keyof Settings,string,string][]).map(([key,label,sub])=>(
        <div key={key as string} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid ${T.divider}`}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{label}</div>
            {sub&&<div style={{fontSize:11,color:T.textSubtle,marginTop:1}}>{sub}</div>}
          </div>
          <button onClick={()=>saveSetting(key,!settings[key] as any)}
            style={{width:38,height:21,borderRadius:11,border:'none',cursor:'pointer',transition:'background 0.2s',background:settings[key]?'#14B8A6':T.cardBorder,position:'relative',flexShrink:0}}>
            <div style={{position:'absolute',top:2.5,left:settings[key]?19:2.5,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}/>
          </button>
        </div>
      ))}

      {([
        ['markerColor','Marker Color'],
        ['fillColor','Fill Color'],
        ['borderColor','Border Color'],
      ] as [keyof Settings,string][]).map(([key,label])=>(
        <div key={key as string} style={{padding:'10px 0',borderBottom:`1px solid ${T.divider}`}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:colorTarget===key?10:0}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{label}</div>
            <button onClick={()=>setColorTarget(colorTarget===key?null:key)}
              style={{width:26,height:26,borderRadius:7,border:`2px solid ${T.cardBorder}`,background:settings[key] as string,cursor:'pointer',flexShrink:0}}/>
          </div>
          {colorTarget===key&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
              {COLORS.map(c=>(
                <button key={c} onClick={()=>{saveSetting(key,c as any);setColorTarget(null)}} title={c}
                  style={{width:26,height:26,borderRadius:6,background:c,border:settings[key]===c?'2.5px solid #fff':'1.5px solid rgba(128,128,128,0.3)',
                    boxShadow:settings[key]===c?`0 0 0 2px ${c}`:'none',cursor:'pointer'}}/>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{padding:'10px 0',borderBottom:`1px solid ${T.divider}`}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:600,color:T.text}}>Border Width</div>
          <span style={{fontSize:13,fontWeight:700,color:'#14B8A6'}}>{settings.borderWidth}px</span>
        </div>
        <input type="range" min={1} max={8} step={0.5} value={settings.borderWidth}
          onChange={e=>saveSetting('borderWidth',+e.target.value)} style={{width:'100%',accentColor:'#14B8A6'}}/>
      </div>

      <div style={{padding:'10px 0'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:600,color:T.text}}>Fill Opacity</div>
          <span style={{fontSize:13,fontWeight:700,color:'#14B8A6'}}>{Math.round(settings.fillOpacity*100)}%</span>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={settings.fillOpacity}
          onChange={e=>saveSetting('fillOpacity',+e.target.value)} style={{width:'100%',accentColor:'#14B8A6'}}/>
      </div>
    </div>
  )

  return (
    <div style={{position:'fixed',inset:0,display:'flex',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif',zIndex:10,background:T.pageBg}}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{height:56,flexShrink:0,background:T.topBar,backdropFilter:'blur(12px)',borderBottom:`1px solid ${T.topBorder}`,display:'flex',alignItems:'center',gap:12,padding:'0 16px'}}>

        {/* Back */}
        <button onClick={()=>router.back()}
          style={{display:'flex',alignItems:'center',gap:5,fontSize:13,color:T.textMuted,background:T.btnBack,border:`1px solid ${T.btnBorder}`,borderRadius:8,padding:'6px 12px',cursor:'pointer',flexShrink:0}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>

        {/* Logo */}
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <div style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#14B8A6,#0F766E)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 12px rgba(20,184,166,0.35)'}}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:T.text,letterSpacing:'-0.02em'}}>ProMeasure</div>
            <div style={{fontSize:10,color:'#14B8A6',fontWeight:600,letterSpacing:'0.08em',marginTop:-1}}>SATELLITE ROOF TOOL</div>
          </div>
        </div>

        {/* Address input + recent dropdown */}
        <div id="pm-address-wrapper" style={{flex:1,position:'relative',maxWidth:520}}>
          <div style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',zIndex:1}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.textSubtle} strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input id="pm-address-input" ref={inputRef}
            value={address} onChange={e=>setAddress(e.target.value)}
            onFocus={()=>setShowRecent(recentAddrs.length>0)}
            onKeyDown={e=>{if(e.key==='Enter'){geocodeAddress(address);setShowRecent(false)}if(e.key==='Escape')setShowRecent(false)}}
            placeholder="Search address — autocomplete enabled"
            style={{width:'100%',padding:'9px 14px 9px 34px',borderRadius:10,border:`1.5px solid ${T.inputBorder}`,background:T.inputBg,color:T.text,fontSize:13,outline:'none',boxSizing:'border-box',transition:'border-color 0.2s'}}
            onMouseEnter={e=>(e.currentTarget.style.borderColor='#14B8A6')}
            onMouseLeave={e=>{if(document.activeElement!==e.currentTarget)e.currentTarget.style.borderColor=T.inputBorder}}/>

          {/* Recent addresses dropdown */}
          {showRecent&&recentAddrs.length>0&&(
            <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:T.recentBg,border:`1px solid ${T.recentBorder}`,borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,0.15)',zIndex:100,overflow:'hidden'}}>
              <div style={{padding:'8px 12px 4px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:T.textSubtle,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Recent addresses</span>
                <button onClick={()=>{localStorage.removeItem('pg_pm_recent');setRecentAddrs([]);setShowRecent(false)}}
                  style={{fontSize:10,color:T.textSubtle,background:'none',border:'none',cursor:'pointer',padding:'2px 6px',borderRadius:6}}>
                  Clear all
                </button>
              </div>
              {recentAddrs.map((addr,i)=>(
                <div key={i}
                  style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',cursor:'pointer',transition:'background 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget.style.background=T.recentHover)}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}
                    onClick={()=>{setAddress(addr);geocodeAddress(addr)}}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.textSubtle} strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                    <span style={{fontSize:13,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{addr}</span>
                  </div>
                  <button onClick={e=>{e.stopPropagation();removeRecent(addr)}}
                    style={{background:'none',border:'none',cursor:'pointer',color:T.textSubtle,padding:'2px 4px',flexShrink:0,fontSize:16,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pitch */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:600,color:T.textMuted,textTransform:'uppercase',letterSpacing:'0.07em'}}>Pitch</span>
          <select value={pitch} onChange={e=>setPitch(e.target.value)}
            style={{padding:'7px 10px',borderRadius:8,border:`1px solid ${T.inputBorder}`,background:T.inputBg,color:T.text,fontSize:13,cursor:'pointer'}}>
            {Object.keys(PITCH_FACTORS).map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Waste */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:600,color:T.textMuted,textTransform:'uppercase',letterSpacing:'0.07em'}}>Waste</span>
          <select value={waste} onChange={e=>setWaste(Number(e.target.value))}
            style={{padding:'7px 10px',borderRadius:8,border:`1px solid ${T.inputBorder}`,background:T.inputBg,color:T.text,fontSize:13,cursor:'pointer'}}>
            {[5,8,10,12,15,20].map(w=><option key={w} value={w}>{w}%</option>)}
          </select>
        </div>

        {/* Dark mode toggle */}
        <button onClick={()=>{const n=!dk;localStorage.setItem('pg_darkmode',n?'1':'0');setDk(n)}}
          title={dk?'Light mode':'Dark mode'}
          style={{width:36,height:36,borderRadius:9,border:`1px solid ${T.btnBorder}`,background:T.btnBack,color:T.textMuted,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
          {dk
            ? <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          }
        </button>

        {/* Settings toggle */}
        <button onClick={()=>setSettingsOpen(s=>!s)}
          style={{width:36,height:36,borderRadius:9,border:`1.5px solid ${settingsOpen?T.settingsBorder:T.btnBorder}`,background:settingsOpen?T.settingsBg:T.btnBack,color:settingsOpen?'#14B8A6':T.textMuted,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'all 0.2s'}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* Map */}
        <div style={{flex:1,position:'relative',background:dk?'#0a0f1a':'#E8E2D9'}}>
          {apiErr?(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:32}}>
              <div style={{fontSize:48}}>🗺️</div>
              <p style={{fontWeight:700,color:'#EF4444',textAlign:'center',maxWidth:400}}>{apiErr}</p>
            </div>
          ):(
            <>
              <div ref={mapDivRef} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/>

              {!mapReady&&(
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:dk?'rgba(10,15,26,0.8)':'rgba(245,244,240,0.8)'}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{width:36,height:36,border:'2.5px solid #14B8A6',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 10px'}}/>
                    <p style={{color:T.textMuted,fontSize:14}}>Loading satellite imagery…</p>
                  </div>
                </div>
              )}

              {mapReady&&pins===0&&(
                <div style={{position:'absolute',top:16,left:'50%',transform:'translateX(-50%)',background:dk?'rgba(15,20,35,0.88)':'rgba(17,24,39,0.82)',backdropFilter:'blur(8px)',color:'#fff',padding:'10px 20px',borderRadius:24,fontSize:13,fontWeight:600,pointerEvents:'none',whiteSpace:'nowrap',border:'1px solid rgba(255,255,255,0.1)',boxShadow:'0 4px 20px rgba(0,0,0,0.3)'}}>
                  Click to place pins around the roof perimeter · Double-click pin to remove
                </div>
              )}

              {area&&pins>=3&&(
                <div style={{position:'absolute',top:16,left:16,background:dk?'rgba(15,20,35,0.9)':'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid rgba(20,184,166,0.4)',borderRadius:14,padding:'10px 16px',boxShadow:'0 4px 24px rgba(0,0,0,0.15)'}}>
                  <div style={{fontSize:11,color:'#14B8A6',fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>ACTIVE REGION</div>
                  <div style={{fontSize:22,fontWeight:800,color:T.text}}>{fmtSq(rawSq)} <span style={{fontSize:13,color:T.textMuted}}>sq</span></div>
                  <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{fmt(area||0)} sq ft</div>
                </div>
              )}

              {mapReady&&pins>0&&(
                <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',display:'flex',gap:8,alignItems:'center'}}>
                  {area&&(
                    <button onClick={saveRegion}
                      style={{padding:'10px 18px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#14B8A6,#0F766E)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 16px rgba(20,184,166,0.4)',display:'flex',alignItems:'center',gap:6}}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                      Save Region
                    </button>
                  )}
                  <button onClick={undo}
                    style={{padding:'10px 16px',borderRadius:12,border:`1px solid ${dk?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}`,background:dk?'rgba(15,20,35,0.85)':'rgba(255,255,255,0.92)',backdropFilter:'blur(8px)',color:T.text,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                    ↩ Undo
                  </button>
                  {/* FIXED: Clear button — solid visible background, not transparent */}
                  <button onClick={clearAll}
                    style={{padding:'10px 16px',borderRadius:12,border:'1px solid #EF4444',background:'#EF4444',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT PANEL — measurements always visible, settings appended below ── */}
        <div style={{width:260,flexShrink:0,background:T.panel,borderLeft:`1px solid ${T.panelBorder}`,display:'flex',flexDirection:'column',overflowY:'auto'}}>
          <MeasurementsPanel/>
          {settingsOpen&&<SettingsPanel/>}
        </div>
      </div>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        #pm-address-input::placeholder{color:${T.textSubtle}}
        .pac-container{border-radius:12px !important;border:1px solid ${T.recentBorder} !important;background:${T.recentBg} !important;box-shadow:0 8px 32px rgba(0,0,0,0.15) !important;margin-top:4px !important;font-family:inherit !important}
        .pac-item{color:${T.textMuted} !important;border-top:1px solid ${T.divider} !important;padding:8px 14px !important;font-size:13px !important;cursor:pointer}
        .pac-item:hover{background:${T.recentHover} !important}
        .pac-item-query{color:${T.text} !important;font-weight:600}
        .pac-matched{color:#14B8A6 !important}
      `}</style>
    </div>
  )
}

export default function ProMeasurePage() {
  return (
    <Suspense fallback={
      <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#F5F4F0'}}>
        <div style={{width:36,height:36,border:'2.5px solid #14B8A6',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <ProMeasureInner />
    </Suspense>
  )
}
