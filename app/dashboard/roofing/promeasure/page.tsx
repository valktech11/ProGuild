'use client'
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProSession } from '@/lib/hooks/useProSession'

import { PITCH_FACTORS, PITCH_OPTIONS, getPitchFactor } from '@/lib/roofing/pitchFactors'

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
  const leadId      = searchParams.get('lead_id') || null
  const fromParam   = searchParams.get('from') || null

  // Restore saved draw state if returning via back navigation
  const savedDraw = (() => {
    if (typeof window === 'undefined') return null
    try { const s = sessionStorage.getItem('pg_pm_draw'); return s ? JSON.parse(s) : null } catch { return null }
  })()

  const { session } = useProSession()

  // ── Dark mode — respects pg_darkmode like all other pages ─────────────────
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )

  // Theme tokens
  const T = {
    topBar:      dk ? 'rgba(15,20,35,0.97)'  : 'rgba(255,255,255,0.97)',
    topBorder:   dk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    panel:       dk ? 'rgba(22,35,54,0.98)'  : '#FFFFFF',
    panelBorder: dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    text:        dk ? '#FFFFFF'              : '#111827',
    textMuted:   dk ? 'rgba(255,255,255,0.5)' : '#6B7280',
    textSubtle:  dk ? 'rgba(255,255,255,0.3)' : '#9CA3AF',
    inputBg:     dk ? 'rgba(255,255,255,0.07)' : '#F9FAFB',
    inputBorder: dk ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
    cardBg:      dk ? 'rgba(255,255,255,0.07)' : '#F9FAFB',
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
  // Line tool (ridge/hip/valley) — separate from polygon markers/refs.
  const [drawMode, setDrawMode] = useState<'polygon'|'line'|'idle'>('polygon')
  const [lineType, setLineType] = useState<'ridge'|'hip'|'valley'>('ridge')
  type LineRec = {type:'ridge'|'hip'|'valley';lf:number;latlngs:{lat:number;lng:number}[];user_adjusted:boolean;source:'manual'|'gemini_adjusted'}
  const [lines, setLines] = useState<LineRec[]>(savedDraw?.lines || [])
  // Gemini-suggested guide lines awaiting human confirmation (Slice B/C).
  // Separate from committed `lines` — these are proposals, not measurements.
  type SuggLine = { id:string; type:'ridge'|'hip'|'valley'; latlngs:{lat:number;lng:number}[]; confidence:number }
  const [suggestedLines, setSuggestedLines] = useState<SuggLine[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const lineMarkers = useRef<any[]>([])   // active in-progress line vertices
  const linePolyRef = useRef<any>(null)   // active in-progress polyline
  const savedLineRefs = useRef<any[]>([]) // committed polylines on map
  const drawModeRef = useRef<'polygon'|'line'|'idle'>('polygon')
  const lineTypeRef = useRef<'ridge'|'hip'|'valley'>('ridge')
  useEffect(()=>{ drawModeRef.current=drawMode },[drawMode])
  // Dim the polygon fill while drawing lines so the actual ridge/hip/valley creases
  // are visible underneath (far hip corners are obscured by the 0.20 tint otherwise).
  useEffect(()=>{
    if (!polyRef.current) return
    try { polyRef.current.setOptions({ fillOpacity: drawMode==='line' ? 0.05 : settings.fillOpacity }) } catch {}
  },[drawMode])
  // Rebuild all committed line overlays fresh from lines[] with a given editable
  // state. RECREATION (not setOptions toggle) is the reliable path: a fresh
  // editable:false polyline has no vertex handles at all (so nothing grabs a
  // convergence click), and a fresh editable:true polyline has working handles +
  // freshly-bound sync listeners. Toggling editable on an existing polyline is the
  // unreliable Google path that broke drag repeatedly.
  // ── SINGLE SOURCE OF TRUTH for committed-line overlays ────────────────────
  // All committed ridge/hip/valley polylines are owned here and ONLY here. They are
  // destroyed + recreated from lines[] whenever lines or draw-mode change. This
  // replaces three conflicting create/destroy sites (commitSegment, restore, rebuild)
  // that fought over savedLineRefs and broke drag/dblclick.
  //   drawing → editable:false (no handles to grab a convergence click; snap works
  //             off lines[] coords).
  //   idle    → editable:true (drag-to-straighten; vertex-dblclick → remove line).
  // Guard: skip rebuild while a drag is in progress (draggingRef) so an in-flight
  // drag's set_at → setLines doesn't destroy the polyline mid-drag.
  const draggingRef = useRef(false)
  useEffect(()=>{ lineTypeRef.current=lineType },[lineType])
  const LINE_COLOR: Record<string,string> = { ridge:'#DC2626', hip:'#EA580C', valley:'#2563EB' }
  // Gemini line-suggestion shelved — see materials-panel comment. Flip to re-test.
  const SHOW_SUGGEST_LINES = false
  const markers    = useRef<any[]>([])
  const inputRef   = useRef<HTMLInputElement>(null)
  const saveRecentRef = useRef<(addr: string) => void>(() => {})

  const [address,      setAddress]      = useState(initAddress || savedDraw?.address || '')
  const [pitch,        setPitch]        = useState(savedDraw?.pitch || '4/12')
  const [waste,        setWaste]        = useState(savedDraw?.waste ?? 10)
  const [pins,         setPins]         = useState(0)
  // Responsive: this tool is a fixed full-screen row (map | 260px stats panel).
  // On mobile that crushes the map to a sliver, so below 900px we flip the body
  // to a column (map hero on top, stats bar below) and wrap the top bar. The
  // isWide===true branch is byte-for-byte the original desktop layout.
  const [isWide,       setIsWide]       = useState(true)
  const [area,         setArea]         = useState<number|null>(null)
  const [perim,        setPerim]        = useState<number|null>(null)
  const [mapReady,     setMapReady]     = useState(false)

  // ── SINGLE SOURCE OF TRUTH for committed-line overlays ────────────────────
  // All committed ridge/hip/valley polylines are owned here and ONLY here —
  // destroyed + recreated from lines[] whenever lines or draw-mode change. This
  // replaced three conflicting create/destroy sites (commitSegment, restore, rebuild)
  // that fought over savedLineRefs and broke drag/dblclick.
  //   drawing → editable:false (no handles to grab a convergence click; snap works
  //             off lines[] coords).
  //   idle    → editable:true (drag-to-straighten; vertex-dblclick → remove line).
  // draggingRef guard: skip rebuild mid-drag so an in-flight set_at → setLines does
  // not tear down the polyline being dragged.
  useEffect(()=>{
    if (!mapReady || !mapRef.current) return
    if (draggingRef.current) return // don't tear down a polyline mid-drag
    const map = mapRef.current
    // editable tied to mode: NON-editable while drawing (so a committed line's vertex
    // handle can't grab the click when you start a hip on a ridge endpoint —
    // convergence), editable when idle (drag-to-straighten + dblclick-remove).
    const editable = drawMode !== 'line'
    savedLineRefs.current.forEach((p:any)=>p.setMap(null))
    savedLineRefs.current = lines.map(ln => {
      const path = ln.latlngs.map(p=>new window.google.maps.LatLng(p.lat,p.lng))
      const poly = new window.google.maps.Polyline({
        path, map, editable, clickable:editable, zIndex:20, ...lineStyle(ln.type),
      })
      attachLineHandlers(poly)
      return poly
    })
  },[mapReady, lines, drawMode])

  // When launched for a specific lead, the lead's full address is authoritative.
  // A stale pg_pm_draw from a *different* property must not win — wipe drawn state
  // (regions, lines, overlays) and geocode to the lead's address once map is ready.
  const leadAddrApplied = useRef(false)
  useEffect(() => {
    if (!leadId || !mapReady || leadAddrApplied.current) return
    leadAddrApplied.current = true
    ;(async () => {
      try {
        const proId = session?.id
        const res = await fetch(`/api/leads/${leadId}${proId ? `?pro_id=${proId}` : ''}`)
        const d = res.ok ? await res.json() : null
        const L = d?.lead
        if (!L) return
        // Build the full address from parts — property_address alone often lacks
        // city/state/zip, which geocodes to the wrong same-named street.
        const street = String(L.property_address || '').replace(/, USA$/, '').trim()
        const full = [street, L.contact_city, L.contact_state, L.contact_zip]
          .filter(Boolean).join(', ')
        const leadAddr = full || street
        if (!leadAddr) return
        // Already on this exact lead address with a draw in progress → leave it alone.
        if (address.trim() && leadAddr.toLowerCase() === address.trim().toLowerCase()) return
        // Fresh lead measure → hard-reset any stale drawn state from another property.
        try {
          markers.current.forEach((m:any)=>m.setMap(null)); markers.current=[]
          if (polyRef.current) { polyRef.current.setMap(null); polyRef.current=null }
          savedLineRefs.current.forEach((p:any)=>p.setMap(null)); savedLineRefs.current=[]
          if (linePolyRef.current) { linePolyRef.current.setMap(null); linePolyRef.current=null }
          lineMarkers.current.forEach((m:any)=>m.setMap(null)); lineMarkers.current=[]
        } catch {}
        setPins(0); setArea(null); setPerim(null)
        setRegions([]); setLines([])
        try { sessionStorage.removeItem('pg_pm_draw') } catch {}
        setAddress(leadAddr)
        if (mapRef.current && (window as any).google?.maps) {
          new (window as any).google.maps.Geocoder().geocode({ address: leadAddr }, (r: any, s: any) => {
            if (s === 'OK' && r?.[0]?.geometry?.location) {
              mapRef.current.setCenter(r[0].geometry.location)
              mapRef.current.setZoom(20)
            }
          })
        }
      } catch {}
    })()
  }, [leadId, mapReady, session, address])
  const [apiErr,       setApiErr]       = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorTarget,  setColorTarget]  = useState<keyof Settings|null>(null)
  const [regions,      setRegions]      = useState<{name:string;sqFt:number;perimLF?:number;color:string}[]>(savedDraw?.regions || [])
  const regionsRef = useRef(regions)
  useEffect(()=>{ regionsRef.current = regions },[regions])
  // Brief inline hint shown on the map when a blocked action is attempted.
  const [mapHint, setMapHint] = useState<string|null>(null)
  const [showRecent,   setShowRecent]   = useState(false)
  const [recentAddrs,  setRecentAddrs]  = useState<string[]>([])

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window==='undefined') return DEFAULT_SETTINGS
    try { const s=localStorage.getItem('pg_pm_settings'); return s?{...DEFAULT_SETTINGS,...JSON.parse(s)}:DEFAULT_SETTINGS } catch { return DEFAULT_SETTINGS }
  })

  // Track viewport width for the responsive row/column flip. On the flip the
  // map container changes size, so trigger a Google Maps resize so it repaints
  // full-bleed (otherwise it can render a clipped/grey tile band).
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth >= 900
      setIsWide(prev => {
        if (prev !== w && mapRef.current && (window as any).google?.maps) {
          // defer so the new container dimensions are applied first
          setTimeout(() => {
            try { (window as any).google.maps.event.trigger(mapRef.current, 'resize') } catch {}
          }, 80)
        }
        return w
      })
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
  saveRecentRef.current = saveRecentAddress

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
    if (mapRef.current) return // already built — re-entry would reset view + orphan overlays

    // Restore saved center/zoom if returning from calculator
    const saved = (() => { try { const s=sessionStorage.getItem('pg_pm_draw'); return s?JSON.parse(s):null } catch { return null } })()

    const map = new window.google.maps.Map(div, {
      zoom: saved?.zoom || 19,
      center: saved?.center || {lat:30.3322,lng:-81.6557},
      // 'hybrid' = satellite imagery WITH road/label overlay (labels ON by default)
      mapTypeId: 'hybrid', tilt:0,
      streetViewControl:false, mapTypeControl:true,
      mapTypeControlOptions:{ position: 9, style: 1 }, // style 1 = HORIZONTAL_BAR (Map/Satellite labels)
      fullscreenControl:true, fullscreenControlOptions:{ position: 7 },
      zoomControl:true, zoomControlOptions:{ position: 7 },
      gestureHandling:'greedy',
      disableDoubleClickZoom:true, // dblclick reserved for removing pins/lines
    })
    mapRef.current = map
    setMapReady(true)
    // Persist viewport on idle so reload restores the user's pan/zoom (the
    // state-driven effect only captures center/zoom on data change).
    map.addListener('idle', () => {
      try {
        const c = map.getCenter()
        if (!c) return
        const prev = (() => { try { const s=sessionStorage.getItem('pg_pm_draw'); return s?JSON.parse(s):{} } catch { return {} } })()
        sessionStorage.setItem('pg_pm_draw', JSON.stringify({ ...prev, center:{lat:c.lat(),lng:c.lng()}, zoom: map.getZoom() }))
      } catch {}
    })

    map.addListener('click', (e:any) => {
      if (!e.latLng) return
      // Ignore clicks that land on an existing pin — otherwise double-clicking a
      // pin to remove it also fires map clicks that drop stray pins. Let the
      // marker's own dblclick handle removal.
      const proj = map.getProjection?.()
      if (proj && drawModeRef.current !== 'line') {
        const clickPt = proj.fromLatLngToPoint(e.latLng)
        const scale = Math.pow(2, map.getZoom())
        const near = markers.current.some((m:any) => {
          const mp = proj.fromLatLngToPoint(m.getPosition())
          const dx = (clickPt.x - mp.x) * scale
          const dy = (clickPt.y - mp.y) * scale
          return Math.hypot(dx, dy) < 12 // px
        })
        if (near) return
      }
      if (drawModeRef.current === 'line') { addLinePoint(e.latLng, map); return }
      if (drawModeRef.current === 'idle') return // not drawing anything — ignore stray clicks
      // polygon mode → place pins, unless a region is already saved (redraw needs Start over).
      if (regionsRef.current.length > 0) {
        setMapHint('Region already saved — use Start over to redraw the roof, or Add Ridge/Hip/Valley to measure lines.')
        setTimeout(()=>setMapHint(null), 3500)
        return
      }
      addPin(e.latLng, map)
    })

    // Auto-geocode: if address was passed via URL and no saved center exists, fly to it
    if (!saved?.center && initAddress.trim()) {
      new window.google.maps.Geocoder().geocode({ address: initAddress }, (res: any, status: any) => {
        if (status === 'OK' && res?.[0]?.geometry?.location) {
          map.setCenter(res[0].geometry.location)
          map.setZoom(20)
          saveRecentRef.current(initAddress)
        }
      })
    }

    // Restore drawn polygon from saved state
    if (saved?.latlngs?.length >= 2) {
      const pts = saved.latlngs.map((ll: any) => new window.google.maps.LatLng(ll.lat, ll.lng))
      pts.forEach((pt: any) => {
        const marker = new window.google.maps.Marker({
          position:pt, map, draggable:true,
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
      })
      redraw(map)
    }

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
          saveRecentRef.current(addr)
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
      clickable:false, // never intercept map clicks — line points must reach the map handler
      strokeColor:settings.borderColor, strokeOpacity:0.95, strokeWeight:settings.borderWidth,
      fillColor:settings.fillColor, fillOpacity:settings.fillOpacity,
    })
    // Persist latlngs + map position so state survives back navigation
    const latlngs = pts.map((p:any) => ({ lat: p.lat(), lng: p.lng() }))
    const center = map.getCenter()
    sessionStorage.setItem('pg_pm_draw', JSON.stringify({
      latlngs,
      zoom: map.getZoom(),
      center: center ? { lat: center.lat(), lng: center.lng() } : null,
      address: (document.getElementById('pm-address-input') as HTMLInputElement)?.value || '',
      pitch: (document.getElementById('pm-pitch-sel') as HTMLSelectElement)?.value || '4/12',
      waste: Number((document.getElementById('pm-waste-inp') as HTMLInputElement)?.value || 10),
      regions: [], // saved regions tracked separately
    }))
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

  // ── Line tool ──────────────────────────────────────────────────────────────
  const hubRef = useRef<any>(null)

  function placeMarker(latLng: any, map: any, scale=6): any {
    const m = new window.google.maps.Marker({
      position:latLng, map, draggable:true,
      icon:{ path:window.google.maps.SymbolPath.CIRCLE, scale,
        fillColor:LINE_COLOR[lineTypeRef.current], fillOpacity:1, strokeColor:'#fff', strokeWeight:2 },
    })
    m.addListener('drag', () => redrawLine(map))
    m.addListener('dragend', () => {
      const snapped = snapLatLng(m.getPosition(), map)
      if (snapped !== m.getPosition()) m.setPosition(snapped)
      redrawLine(map)
    })
    return m
  }

  // Snap a clicked latLng to a nearby existing point (polygon corner, committed
  // line endpoint, or a point already placed in the current line) within ~16px.
  // This makes far corners easy (click near, snaps exact) and makes lines
  // converge naturally without a forced hub.
  function snapLatLng(latLng: any, map: any): any {
    const proj = map.getProjection?.()
    if (!proj) return latLng
    const z = Math.pow(2, map.getZoom())
    const cp = proj.fromLatLngToPoint(latLng)
    let best:any = null, bestD = 16 // px threshold
    const consider = (pos:any) => {
      if (!pos) return
      const pp = proj.fromLatLngToPoint(pos)
      const d = Math.hypot((cp.x-pp.x)*z, (cp.y-pp.y)*z)
      if (d < bestD) { bestD = d; best = pos }
    }
    // Polygon corner pins
    markers.current.forEach((m:any)=>consider(m.getPosition?.()))
    // Endpoints of already-committed lines
    lines.forEach(ln => { const a=ln.latlngs[0], b=ln.latlngs[ln.latlngs.length-1]
      if(a) consider(new window.google.maps.LatLng(a.lat,a.lng))
      if(b) consider(new window.google.maps.LatLng(b.lat,b.lng)) })
    // Points already placed in the current in-progress line
    lineMarkers.current.forEach((m:any)=>consider(m.getPosition?.()))
    return best || latLng
  }

  function addLinePoint(latLng: any, map: any) {
    // 2-click segment model: 1st click = start, 2nd click = end → auto-commit one
    // independent segment (matches real roofs = many separate ridge/hip/valley
    // segments). Stay in the same type to draw the next. Snapping makes endpoints
    // land exactly on corners / ridge-ends.
    const snapped = snapLatLng(latLng, map)
    lineMarkers.current.push(placeMarker(snapped, map))
    if (lineMarkers.current.length >= 2) {
      commitSegment(map)
    } else {
      redrawLine(map) // shows the single start dot
    }
  }

  // Commit the current 2-point segment to lines[] as a solid, removable polyline.
  // Dashed stroke for hips (distinguishes from solid red ridge — orange/red read
  // too similar otherwise). Ridge/valley stay solid.
  function lineStyle(type:string) {
    if (type === 'hip') return {
      strokeOpacity: 0,
      icons: [{ icon: { path:'M 0,-1 0,1', strokeColor:LINE_COLOR[type], strokeOpacity:1, strokeWeight:4, scale:3 }, offset:'0', repeat:'12px' }],
    }
    return { strokeColor: LINE_COLOR[type], strokeOpacity: 0.9, strokeWeight: 4 }
  }

  // Sync a committed editable polyline's geometry back into lines[] after a vertex
  // drag (straighten/reposition without redrawing).
  function syncEditedLine(poly:any) {
    const idx = savedLineRefs.current.indexOf(poly)
    if (idx < 0) return
    const path = poly.getPath()
    if (path.getLength() < 2) return
    const a = path.getAt(0), b = path.getAt(1)
    const lf = window.google.maps.geometry.spherical.computeDistanceBetween(a, b) * 3.28084
    setLines(ls => ls.map((ln,i)=> i===idx
      ? { ...ln, lf:+lf.toFixed(0), latlngs:[{lat:a.lat(),lng:a.lng()},{lat:b.lat(),lng:b.lng()}] }
      : ln))
  }

  // Re-bindable path listeners (set_at/insert_at) that sync edited geometry → LF.
  // Re-run whenever editable is re-enabled, since Google rebuilds the handle layer.
  const dragReleaseTimer = useRef<any>(null)
  function markDragging() {
    draggingRef.current = true
    if (dragReleaseTimer.current) clearTimeout(dragReleaseTimer.current)
    // Release shortly after the last edit event — lets the final geometry settle,
    // then allows the overlay effect to run once more (a no-op visually since geom
    // already matches lines[], but keeps state consistent).
    dragReleaseTimer.current = setTimeout(()=>{ draggingRef.current = false }, 250)
  }

  function rebindEditListeners(poly:any) {
    const path = poly.getPath()
    try { (window as any).google.maps.event.clearListeners(path, 'set_at') } catch {}
    try { (window as any).google.maps.event.clearListeners(path, 'insert_at') } catch {}
    try { (window as any).google.maps.event.clearListeners(path, 'remove_at') } catch {}
    path.addListener('set_at', () => { markDragging(); syncEditedLine(poly) })
    path.addListener('insert_at', (i:number) => {
      if (path.getLength() > 2) path.removeAt(i)
      markDragging(); syncEditedLine(poly)
    })
    path.addListener('remove_at', () => {
      if (path.getLength() < 2) {
        const idx = savedLineRefs.current.indexOf(poly)
        if (idx >= 0) removeLine(idx)
      }
    })
  }

  function attachLineHandlers(poly:any) {
    // Double-click to remove (same gesture as pins).
    poly.addListener('dblclick', () => {
      const idx = savedLineRefs.current.indexOf(poly)
      if (idx >= 0) removeLine(idx)
    })
    rebindEditListeners(poly)
  }

  function commitSegment(map: any) {
    const pts = lineMarkers.current.map(m=>m.getPosition()).filter(Boolean)
    if (pts.length < 2) return
    const type = lineTypeRef.current
    const lf = window.google.maps.geometry.spherical.computeDistanceBetween(pts[0], pts[1]) * 3.28084
    if (lf <= 0) { clearActiveLine(); return }
    const latlngs = [pts[0], pts[1]].map((p:any)=>({lat:p.lat(),lng:p.lng()}))
    // Only update state — the single source-of-truth effect creates the overlay
    // (non-editable while drawing). No direct polyline creation here.
    setLines(l=>[...l,{type,lf:+lf.toFixed(0),latlngs,user_adjusted:true,source:'manual'}])
    clearActiveLine()
    // Auto-exit to idle after each committed segment. The line becomes editable
    // immediately (drag/remove without a separate Done), and re-entering for the
    // next segment (tap Add Hip) flips all lines non-editable again so convergence
    // works for that segment's start point. One tap per segment, both behaviors intact.
    setDrawMode('idle'); drawModeRef.current='idle'
  }

  function redrawLine(map: any) {
    const pts = lineMarkers.current.map(m=>m.getPosition()).filter(Boolean)
    if (linePolyRef.current) { linePolyRef.current.setMap(null); linePolyRef.current=null }
    if (pts.length < 2) return
    linePolyRef.current = new window.google.maps.Polyline({
      path:pts, map, ...lineStyle(lineTypeRef.current),
    })
  }

  function lineLF(): number {
    const pts = lineMarkers.current.map(m=>m.getPosition()).filter(Boolean)
    if (pts.length < 2) return 0
    let m=0
    for(let i=0;i<pts.length-1;i++) m+=window.google.maps.geometry.spherical.computeDistanceBetween(pts[i],pts[i+1])
    return m*3.28084
  }

  function clearActiveLine() {
    lineMarkers.current.forEach(m=>m.setMap(null)); lineMarkers.current=[]
    if(linePolyRef.current){linePolyRef.current.setMap(null);linePolyRef.current=null}
  }

  // ── Gemini line suggestion (Slice B) ──────────────────────────────────────
  // Capture a square satellite tile CENTERED ON THE DRAWN POLYGON (not the live
  // viewport — they differ), send to Gemini, then LERP normalized coords back
  // using the CAPTURE's own geographic bounds (computed from center+zoom+size via
  // Web Mercator) — NOT the live map getBounds(), which frames a different area.
  async function suggestRoofLines() {
    const map = mapRef.current
    if (!map || suggesting) return
    const pins = markers.current.map(m=>m.getPosition()).filter(Boolean)
    if (pins.length < 3) { return } // need a drawn polygon to target the roof
    setSuggesting(true)
    try {
      // Polygon centroid + span → capture center and a zoom that frames it.
      let minLat=90,maxLat=-90,minLng=180,maxLng=-180
      pins.forEach((p:any)=>{
        const la=p.lat(), ln=p.lng()
        minLat=Math.min(minLat,la); maxLat=Math.max(maxLat,la)
        minLng=Math.min(minLng,ln); maxLng=Math.max(maxLng,ln)
      })
      const cLat=(minLat+maxLat)/2, cLng=(minLng+maxLng)/2
      const SIZE = 640
      const latRad = cLat * Math.PI/180
      const worldFrac = SIZE / 256
      const lngFracNeeded = ((maxLng-minLng)/360) * 1.6
      const latFracNeeded = ((maxLat-minLat)/360) * 1.6 / Math.cos(latRad)
      const fracNeeded = Math.max(lngFracNeeded, latFracNeeded, 1e-6)
      let zoom = Math.floor(Math.log2(worldFrac / fracNeeded))
      zoom = Math.max(18, Math.min(21, zoom))

      // Web Mercator project/unproject for this capture tile (used both to
      // normalize the polygon for Gemini AND to LERP results back).
      const scale = Math.pow(2, zoom)
      const worldPx = 256 * scale
      const project = (la:number, ln:number) => {
        const sinY = Math.sin(la*Math.PI/180)
        return { x:(ln+180)/360*worldPx, y:(0.5 - Math.log((1+sinY)/(1-sinY))/(4*Math.PI))*worldPx }
      }
      const unproject = (x:number, y:number) => {
        const ln = x/worldPx*360 - 180
        const n = Math.PI - 2*Math.PI*y/worldPx
        return { lat:180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))), lng:ln }
      }
      const ctr = project(cLat, cLng)
      const x0 = ctr.x - SIZE/2, y0 = ctr.y - SIZE/2
      // Polygon pins → normalized [0..1] within the capture tile.
      const polygon = pins.map((p:any)=>{
        const w = project(p.lat(), p.lng())
        return { x:(w.x - x0)/SIZE, y:(w.y - y0)/SIZE }
      })

      const res = await fetch('/api/promeasure/suggest-lines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ center: { lat: cLat, lng: cLng }, zoom, width: SIZE, height: SIZE, polygon }),
      })
      if (!res.ok) { setSuggesting(false); return }
      const data = await res.json()
      if (!Array.isArray(data?.lines)) { setSuggesting(false); return }

      // LERP results back using the SAME tile transform.
      const toLatLng = (nx:number, ny:number) => unproject(x0 + nx*SIZE, y0 + ny*SIZE)

      const sugg: SuggLine[] = data.lines.map((l:any, i:number) => ({
        id: `g${Date.now()}_${i}`,
        type: l.type,
        latlngs: [toLatLng(l.x1, l.y1), toLatLng(l.x2, l.y2)],
        confidence: Number(l.confidence) || 0.5,
      }))
      setSuggestedLines(sugg)
      // Move the live map to match the capture tile so guides sit under the view.
      try { map.setCenter({lat:cLat,lng:cLng}); map.setZoom(zoom) } catch {}
    } catch {
      // silent — button re-enables
    } finally {
      setSuggesting(false)
    }
  }

  function cancelLine() { clearActiveLine(); setDrawMode('idle'); drawModeRef.current='idle' }

  function removeLine(i:number) {
    // Just update state — the single source-of-truth effect rebuilds the overlays.
    setLines(l=>l.filter((_,idx)=>idx!==i))
  }

  // Clear all committed ridge/hip/valley lines (like Start over clears the polygon).
  // Clear ONLY the ridge/hip/valley lines. Region/polygon/pins/area untouched.
  // Does NOT re-arm polygon drawing — to redraw the polygon, use Start over.
  function clearLines() {
    savedLineRefs.current.forEach((p:any)=>p.setMap(null)); savedLineRefs.current=[]
    clearActiveLine()
    setLines([])
    setDrawMode('idle'); drawModeRef.current='idle' // idle, not polygon — pin placement stays off while a region exists
    // Persist lines cleared but keep regions, so a refresh doesn't resurrect lines.
    try {
      const prev = JSON.parse(sessionStorage.getItem('pg_pm_draw') || '{}')
      sessionStorage.setItem('pg_pm_draw', JSON.stringify({ ...prev, lines:[] }))
    } catch {}
  }

  // Render suggested guides as dashed polylines (Slice C adds drag + Accept/Reject).
  const suggRefs = useRef<any[]>([])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !(window as any).google?.maps) return
    // Clear prior guide overlays
    suggRefs.current.forEach(p => p.setMap(null)); suggRefs.current = []
    const DASH = {
      path: 'M 0,-1 0,1',
      strokeOpacity: 1, strokeWeight: 3, scale: 3,
    }
    suggestedLines.forEach(s => {
      const poly = new (window as any).google.maps.Polyline({
        path: s.latlngs.map(ll => new (window as any).google.maps.LatLng(ll.lat, ll.lng)),
        map,
        strokeOpacity: 0, // dashed via icons only
        icons: [{ icon: { ...DASH, strokeColor: LINE_COLOR[s.type] }, offset: '0', repeat: '14px' }],
        zIndex: 50,
      })
      suggRefs.current.push(poly)
    })
    return () => { suggRefs.current.forEach(p => p.setMap(null)); suggRefs.current = [] }
  }, [suggestedLines])

  function startLine(t:'ridge'|'hip'|'valley') {
    clearActiveLine()
    hubRef.current = null
    setLineType(t); lineTypeRef.current=t
    setDrawMode('line'); drawModeRef.current='line'
  }

  function clearAll() {
    markers.current.forEach(m=>m.setMap(null)); markers.current=[]
    if(polyRef.current){polyRef.current.setMap(null);polyRef.current=null}
    setPins(0);setArea(null);setPerim(null)
    // Don't blindly removeItem — the persist effect would race and a refresh could
    // resurrect stale geometry. Persist the current regions/lines snapshot instead.
    try {
      const prev = JSON.parse(sessionStorage.getItem('pg_pm_draw') || '{}')
      const { latlngs, ...rest } = prev  // drop the working polygon geometry
      sessionStorage.setItem('pg_pm_draw', JSON.stringify(rest))
    } catch {}
  }

  function startOver() {
    markers.current.forEach(m=>m.setMap(null)); markers.current=[]
    if(polyRef.current){polyRef.current.setMap(null);polyRef.current=null}
    savedLineRefs.current.forEach(p=>p.setMap(null)); savedLineRefs.current=[]
    clearActiveLine()
    setPins(0); setArea(null); setPerim(null)
    setRegions([]); setLines([]); setDrawMode('polygon'); drawModeRef.current='polygon'
    // Authoritatively wipe persistence. removeItem alone loses the race with the
    // persist effect (which re-writes on the lines/regions state change); writing
    // the cleared shape ensures a refresh reads empty, not the old draw.
    try { sessionStorage.setItem('pg_pm_draw', JSON.stringify({ lines:[], regions:[] })) } catch {}
  }

  function saveRegion() {
    if(!area) return
    setRegions(r=>[...r,{name:`Region ${r.length+1}`,sqFt:area!,perimLF:perim?+perim.toFixed(0):undefined,color:settings.fillColor}])
    clearAll()
    setDrawMode('idle'); drawModeRef.current='idle'
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

  async function pushToCalc() {
    const totalSqFt = regions.reduce((s,r)=>s+r.sqFt,0)+(area||0)
    const squares   = +(totalSqFt/100).toFixed(2)
    const measData  = { squares, pitch, waste, perimeter:perim?+perim.toFixed(1):null, address,
      ridge_lf: lines.filter(l=>l.type==='ridge').reduce((a,l)=>a+l.lf,0) || null,
      hip_lf:   lines.filter(l=>l.type==='hip').reduce((a,l)=>a+l.lf,0) || null,
      valley_lf:lines.filter(l=>l.type==='valley').reduce((a,l)=>a+l.lf,0) || null,
      lines: lines.map(l=>({type:l.type,lf:l.lf,user_adjusted:l.user_adjusted,source:l.source})) }
    sessionStorage.setItem('pg_promeasure', JSON.stringify(measData))
    sessionStorage.setItem('pg_report_data', JSON.stringify({...measData, storedAt: Date.now()}))

    // If opened from a lead, write measurements to roofing_job_data
    if (leadId && session) {
      try {
        const patchBody = {
          pro_id:       session.id,
          square_count: squares,
          pitch:        pitch,
          waste_pct:    waste,
          ridge_lf:     measData.ridge_lf  ?? null,
          hip_lf:       measData.hip_lf    ?? null,
          valley_lf:    measData.valley_lf ?? null,
          eave_lf:      null,
          perimeter_lf: measData.perimeter ?? null,
          lines:        measData.lines     ?? [],
        }
        const patchRes = await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })
        const patchData = await patchRes.json().catch(() => null)
      } catch (err) {
      }

      // Return routing: if ProMeasure was launched from the calculator (to fetch
      // measurements), go back to the calculator so the LF is right there — no
      // extra detail→Price-This-Job hop. Otherwise return to the lead detail page.
      if (fromParam === 'calculator') {
        router.push(`/dashboard/roofing/calculator?lead_id=${leadId}&from=promeasure`)
      } else {
        router.push(`/dashboard/pipeline/${leadId}?from=promeasure&applied=1`)
      }
      return
    }

    // Standalone use (no leadId) — go to calculator as before
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
  const adjSq = rawSq*(getPitchFactor(pitch, 1.054))*(1+waste/100)
  const totalSqFt = regions.reduce((s,r)=>s+r.sqFt,0)+(area||0)
  const grandAdj  = (totalSqFt/100)*(getPitchFactor(pitch, 1.054))*(1+waste/100)
  const fmt  = (n:number) => n.toLocaleString(undefined,{maximumFractionDigits:0})
  const fmtSq= (n:number) => n.toFixed(2)

  // Persist full draw (lines + regions + params) on state change — single source,
  // no stale-closure scatter. Merges over the redraw-path geometry write.
  useEffect(() => {
    try {
      const prev = (() => { try { const s=sessionStorage.getItem('pg_pm_draw'); return s?JSON.parse(s):{} } catch { return {} } })()
      const c = mapRef.current?.getCenter?.()
      const view = c ? { center:{lat:c.lat(),lng:c.lng()}, zoom: mapRef.current.getZoom() } : {}
      sessionStorage.setItem('pg_pm_draw', JSON.stringify({ ...prev, ...view, lines, regions, address, pitch, waste }))
    } catch {}
  }, [lines, regions, address, pitch, waste])

  // Restore committed line polylines once the map is ready (state survives reload
  // via savedDraw; the map overlays must be re-instantiated against the new map).
  // (Committed-line overlays are created by the single source-of-truth effect above,
  // which also handles mount restore since it depends on [mapReady, lines, drawMode].)

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
  const MeasurementsPanel = () => {
    const isDrawing = pins > 0
    return (
    <div style={{padding:isWide?20:'12px 14px',display:'flex',flexDirection:'column',gap:isWide?14:10}}>
      {/* Collapsed single-line when no active polygon; expands while drawing */}
      {!isDrawing ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          background:T.cardBg,borderRadius:10,padding:'8px 12px',border:`1px solid ${T.cardBorder}`}}>
          <span style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:T.text}}>
            Live Measurements
          </span>
          <span style={{fontSize:12,color:T.textSubtle}}>Click map to draw →</span>
        </div>
      ) : (
        <>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:T.text}}>
            Live Measurements
          </div>
          <div style={{display:'grid',gridTemplateColumns:isWide?'1fr 1fr':'repeat(4,1fr)',gap:isWide?8:6}}>
            {([
              ['Pins','',String(pins),false],
              ['Perimeter','LF',perim?fmt(perim):'—',false],
              ['Area','sq ft',area?fmt(area):'—',!!area],
              ['Squares','sq',area?fmtSq(rawSq):'—',!!area],
            ] as [string,string,string,boolean][]).map(([label,unit,val,hi])=>(
              <div key={label} style={{background:hi?T.cardHi:T.cardBg,borderRadius:isWide?12:10,padding:isWide?'12px':'9px 8px',border:`1px solid ${hi?T.cardHiBorder:T.cardBorder}`}}>
                <div style={{fontSize:isWide?10:9,color:T.textSubtle,fontWeight:600,letterSpacing:'0.04em',marginBottom:isWide?4:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</div>
                <div style={{fontSize:isWide?18:16,fontWeight:800,color:hi?'#14B8A6':T.text,lineHeight:1.1}}>{val}</div>
                {unit&&<div style={{fontSize:isWide?10:9,color:T.textSubtle,marginTop:1}}>{unit}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Mobile only: actions live in the panel (off the compressed map) */}
      {!isWide&&pins>0&&(
        <div style={{display:'flex',gap:8,alignItems:'stretch'}}>
          {area&&(
            <button onClick={saveRegion}
              style={{flex:1,padding:'11px 12px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#14B8A6,#0F766E)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 10px rgba(20,184,166,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
              Save Region
            </button>
          )}
          <button onClick={undo}
            style={{padding:'11px 16px',borderRadius:12,border:`1px solid ${T.cardBorder}`,background:T.cardBg,color:T.text,fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
            ↩ Undo
          </button>
          <button onClick={clearAll}
            style={{padding:'11px 16px',borderRadius:12,border:'1px solid #EF4444',background:'#EF4444',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            Clear
          </button>
        </div>
      )}

      {area&&(
        <div style={{background:`linear-gradient(135deg,${T.cardHi},${dk?'rgba(15,118,110,0.1)':'#CCFBF1'})`,border:`1.5px solid ${T.cardHiBorder}`,borderRadius:14,padding:'11px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#14B8A6',letterSpacing:'0.1em',marginBottom:3}}>ADJUSTED SQUARES</div>
          <div style={{fontSize:26,fontWeight:900,color:'#14B8A6',letterSpacing:'-0.02em'}}>{fmtSq(adjSq)}</div>
          <div style={{fontSize:10.5,color:T.textMuted,marginTop:2}}>
            {fmtSq(rawSq)} × {PITCH_FACTORS[pitch]} pitch × {1+waste/100} waste
          </div>
        </div>
      )}

      {regions.length>0&&(
        <div>
          {/* Compact: grand total headline + collapsible region breakdown */}
          <div style={{padding:'10px 12px',background:T.cardBg,borderRadius:10,border:`1px solid ${T.cardBorder}`,marginBottom:8}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
              <span style={{fontSize:11,color:T.textSubtle,fontWeight:700,letterSpacing:'0.06em'}}>GRAND TOTAL</span>
              <span style={{fontSize:11,color:T.textSubtle}}>{regions.length} region{regions.length>1?'s':''} · {fmt(totalSqFt)} sq ft</span>
            </div>
            <div style={{fontSize:22,fontWeight:800,color:'#14B8A6',marginTop:2}}>{fmtSq(grandAdj)} adj sq</div>
            <details style={{marginTop:6}}>
              <summary style={{fontSize:11,color:T.textMuted,cursor:'pointer',listStyle:'none',userSelect:'none'}}>▸ Regions</summary>
              <div style={{marginTop:6}}>
                {regions.map((r,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',fontSize:12}}>
                    <span style={{display:'flex',alignItems:'center',gap:6,color:T.textMuted}}>
                      <span style={{width:8,height:8,borderRadius:2,background:r.color,flexShrink:0}}/>{r.name}
                    </span>
                    <span style={{fontWeight:600,color:T.text}}>{fmtSq(r.sqFt/100)} sq</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
          <button onClick={startOver}
            style={{width:'100%',padding:'7px',background:'transparent',color:T.textMuted,border:`1px solid ${T.cardBorder}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
            ↺ Start over
          </button>
        </div>
      )}

      {/* ── Material Summary — deterministic from geometry, no inference ── */}
      {(area||regions.length>0) && grandAdj > 0 && (() => {
        // Polygon-derived (high accuracy). perim = measured boundary; starter/drip
        // = perimeter (industry rule). Ridge/Hip/Valley require line measurements
        // (not derivable from boundary polygon) — shown as Not measured until drawn.
        // Sum captured region perimeters + active polygon. Regions saved before
        // perimeter capture have perimLF undefined -> excluded (shown Not measured).
        const regionPerim = regions.reduce((s,r)=>s+(r.perimLF||0),0)
        const activePerim = perim ? +perim.toFixed(0) : 0
        const perimLF   = regionPerim + activePerim
        const perimComplete = regions.every(r=>r.perimLF!=null) // every region contributed perimeter
        const starterLF = perimLF
        const dripLF    = perimLF
        const underlayQ = +grandAdj.toFixed(1)
        const bundles   = Math.ceil(grandAdj * 3)
        const row = (label: string, val: string, note?: string, muted = false) => (
          <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'6px 0',borderBottom:`1px solid ${T.divider}`}}>
            <span style={{fontSize:12,color:T.textMuted}}>{label}</span>
            <span style={{fontSize:13,fontWeight:muted?400:700,color:muted?T.textSubtle:T.text}}>{val}{note&&<span style={{fontSize:10,color:T.textSubtle,fontWeight:400}}> {note}</span>}</span>
          </div>
        )
        const head = (txt: string) => (
          <div style={{fontSize:10,fontWeight:800,letterSpacing:'0.06em',color:T.textMuted,margin:'4px 0 8px',textTransform:'uppercase'}}>{txt}</div>
        )
        const ridgeFt = lines.filter(l=>l.type==='ridge').reduce((s,l)=>s+l.lf,0)
        const hipFt   = lines.filter(l=>l.type==='hip').reduce((s,l)=>s+l.lf,0)
        const valleyFt= lines.filter(l=>l.type==='valley').reduce((s,l)=>s+l.lf,0)
        const lineRow = (label:string, ft:number, t:'ridge'|'hip'|'valley') => (
          <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${T.divider}`}}>
            <span style={{fontSize:12,color:T.textMuted}}>{label}</span>
            {ft>0
              ? <span style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>{ft} LF</span>
                  <button onClick={()=>startLine(t)} disabled={drawMode==='line'}
                    style={{fontSize:11,fontWeight:600,color:LINE_COLOR[t],background:'transparent',border:`1px solid ${LINE_COLOR[t]}`,borderRadius:6,padding:'2px 8px',cursor:drawMode==='line'?'default':'pointer',opacity:drawMode==='line'?0.4:1}}>+ more</button>
                </span>
              : <button onClick={()=>startLine(t)} disabled={drawMode==='line'}
                  style={{fontSize:11,fontWeight:600,color:LINE_COLOR[t],background:'transparent',border:`1px solid ${LINE_COLOR[t]}`,borderRadius:6,padding:'2px 8px',cursor:drawMode==='line'?'default':'pointer',opacity:drawMode==='line'?0.4:1}}>
                  + Add {label.split(' ')[0]}
                </button>}
          </div>
        )
        return (
          <div style={{background:T.panel,borderRadius:12,border:`1px solid ${T.divider}`,padding:'12px 14px',marginTop:4}}>
            {head('Materials')}
            {/* Gemini line-suggestion (Slices A/B) — SHELVED. General vision LLMs
                can't reliably trace roof crease geometry to estimation precision:
                non-deterministic across runs, collapses to generic templates
                (confirmed by independent Gemini assessment + real output). Code
                retained (endpoint, capture, LERP, render); UI gated off. Re-enable
                only with a dedicated CV pipeline (trained SAM2/edge detection). */}
            {SHOW_SUGGEST_LINES && (<>
            <button onClick={suggestRoofLines} disabled={suggesting||drawMode==='line'||pins<3}
              style={{width:'100%',marginBottom:10,padding:'8px',borderRadius:8,border:`1px solid ${'#0F766E'}`,
                background:(suggesting||pins<3)?'transparent':('#0F766E'),color:(suggesting||pins<3)?T.textMuted:'#fff',
                fontSize:12,fontWeight:700,cursor:(suggesting||drawMode==='line'||pins<3)?'default':'pointer',
                opacity:(drawMode==='line'||pins<3)?0.4:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              {suggesting
                ? 'Finding roof lines…'
                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> Suggest roof lines</>}
            </button>
            {pins<3 && suggestedLines.length===0 && (
              <div style={{marginBottom:10,fontSize:10.5,color:T.textSubtle}}>Draw the roof outline first — suggestions target the drawn roof.</div>
            )}
            {suggestedLines.length>0 && (
              <div style={{marginBottom:10,padding:'8px 10px',borderRadius:8,background:T.cardBg,border:`1px solid ${T.cardBorder}`,fontSize:11,color:T.textMuted}}>
                {suggestedLines.length} suggested line{suggestedLines.length>1?'s':''} shown as dashed guides — drag to the true crease, then Accept (coming next).
              </div>
            )}
            </>)}
            {row('Roof Area', `${fmtSq(totalSqFt/100)} sq`)}
            {row('Adjusted', `${fmtSq(grandAdj)} sq`, '(pitch+waste)')}
            {row('Underlayment', `${underlayQ} sq`)}
            {row('Bundles', `${bundles}`, '3 bdl/sq')}
            {(perimLF>0 && perimComplete) ? row('Starter', `${starterLF} LF`) : row('Starter','Not measured',undefined,true)}
            {(perimLF>0 && perimComplete) ? row('Drip Edge', `${dripLF} LF`) : row('Drip Edge','Not measured',undefined,true)}
            {lineRow('Ridge Cap', ridgeFt, 'ridge')}
            {lineRow('Hip Cap', hipFt, 'hip')}
            {lineRow('Valley Metal', valleyFt, 'valley')}
            {lines.length>0 && (
              <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
                {lines.map((ln,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:T.textSubtle}}>
                    <span><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:LINE_COLOR[ln.type],marginRight:6}}></span>{ln.type} · {ln.lf} LF</span>
                    <button onClick={()=>removeLine(i)} style={{color:T.textSubtle,background:'transparent',border:'none',cursor:'pointer',fontSize:13,padding:'0 4px'}}>✕</button>
                  </div>
                ))}
                <button onClick={clearLines}
                  style={{marginTop:6,alignSelf:'flex-start',fontSize:11,fontWeight:600,color:'#DC2626',background:'transparent',border:`1px solid ${T.cardBorder}`,borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>
                  ↺ Clear all lines
                </button>
              </div>
            )}
            {drawMode==='line' && (
              <div style={{marginTop:10,padding:'8px 10px',background:T.cardBg,borderRadius:8,border:`1px solid ${LINE_COLOR[lineType]}`}}>
                <div style={{fontSize:11,color:T.text,marginBottom:6}}>
                  {lineType==='hip'
                    ? 'Each hip = 2 clicks: peak, then corner. It saves and you can drag/remove it right away. Tap Add Hip again for the next.'
                    : `Each ${lineType} = 2 clicks: one end, then the other. Saves automatically — draw as many as you need.`}
                  <div style={{marginTop:4,color:T.textSubtle}}>Clicks snap to nearby corners/peaks · drag to fine-tune · remove a line with its ✕ in the list below.</div>
                  {(() => { const n = lines.filter(l=>l.type===lineType).length
                    return n>0 ? <div style={{marginTop:4,fontWeight:700,color:LINE_COLOR[lineType]}}>{n} {lineType}{n>1?'s':''} drawn</div> : null })()}
                </div>
                <button onClick={cancelLine} style={{width:'100%',fontSize:12,fontWeight:700,color:'#fff',background:LINE_COLOR[lineType],border:'none',borderRadius:6,padding:'7px',cursor:'pointer'}}>Done with {lineType}s</button>
              </div>
            )}
            {(perimLF>0 && perimComplete) && (
              <div style={{fontSize:10,color:T.textSubtle,marginTop:8,lineHeight:1.4}}>
                Starter/Drip from polygon perimeter — proposal estimate; verify before material order.
              </div>
            )}
          </div>
        )
      })()}

      <div style={{marginTop:'auto',display:'flex',flexDirection:'column',gap:8}}>
        {(area||regions.length>0)&&(
          <button onClick={pushToCalc}
            style={{padding:'13px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#14B8A6,#0F766E)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 16px rgba(20,184,166,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            {leadId ? 'Apply to Lead →' : 'Push to Calculator'}
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
  }

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
          onChange={e=>saveSetting('borderWidth',+e.target.value)}
          onPointerDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          style={{width:'100%',accentColor:'#14B8A6',touchAction:'none',cursor:'pointer'}}/>
      </div>

      <div style={{padding:'10px 0'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:600,color:T.text}}>Fill Opacity</div>
          <span style={{fontSize:13,fontWeight:700,color:'#14B8A6'}}>{Math.round(settings.fillOpacity*100)}%</span>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={settings.fillOpacity}
          onChange={e=>saveSetting('fillOpacity',+e.target.value)}
          onPointerDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          style={{width:'100%',accentColor:'#14B8A6',touchAction:'none',cursor:'pointer'}}/>
      </div>
    </div>
  )

  return (
    <div style={{position:'fixed',inset:0,display:'flex',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif',zIndex:10,background:T.pageBg}}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{minHeight:56,flexShrink:0,background:T.topBar,backdropFilter:'blur(12px)',borderBottom:`1px solid ${T.topBorder}`,display:'flex',alignItems:'center',gap:12,padding:isWide?'0 16px':'8px 12px',flexWrap:isWide?'nowrap':'wrap'}}>

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
        <div id="pm-address-wrapper" style={{flex:isWide?1:'1 1 100%',order:isWide?0:5,position:'relative',maxWidth:isWide?520:'none'}}>
          <div style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',zIndex:1}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.textSubtle} strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input id="pm-address-input" ref={inputRef}
            value={address} onChange={e=>{setAddress(e.target.value);if(e.target.value)setShowRecent(false)}}
            onFocus={()=>setShowRecent(!address&&recentAddrs.length>0)}
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
      <div style={{flex:1,display:'flex',flexDirection:isWide?'row':'column',overflow:'hidden'}}>

        {/* Map */}
        <div style={{flex:isWide?1:'1 1 auto',minHeight:isWide?undefined:0,position:'relative',background:dk?'#0a0f1a':'#E8E2D9'}}>
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
                <div style={{position:'absolute',top:16,left:'50%',transform:'translateX(-50%)',background:'rgba(13,148,136,0.96)',backdropFilter:'blur(8px)',color:'#fff',padding:'11px 22px',borderRadius:isWide?24:16,fontSize:13,fontWeight:700,pointerEvents:'none',whiteSpace:isWide?'nowrap':'normal',maxWidth:isWide?undefined:'calc(100% - 24px)',textAlign:'center',lineHeight:1.4,border:'1px solid rgba(255,255,255,0.35)',boxShadow:'0 6px 24px rgba(13,148,136,0.4)'}}>
                  Click to place pins around the roof perimeter · Double-click pin to remove
                </div>
              )}

              {mapReady&&mapHint&&(
                <div style={{position:'absolute',top:64,left:'50%',transform:'translateX(-50%)',background:'rgba(180,83,9,0.96)',backdropFilter:'blur(8px)',color:'#fff',padding:'10px 18px',borderRadius:isWide?20:14,fontSize:12.5,fontWeight:600,pointerEvents:'none',whiteSpace:isWide?'nowrap':'normal',maxWidth:isWide?undefined:'calc(100% - 24px)',textAlign:'center',lineHeight:1.4,border:'1px solid rgba(255,255,255,0.3)',boxShadow:'0 6px 24px rgba(180,83,9,0.35)',zIndex:5}}>
                  {mapHint}
                </div>
              )}
              {mapReady&&drawMode==='line'&&(
                <div style={{position:'absolute',top:16,left:'50%',transform:'translateX(-50%)',background:'rgba(13,148,136,0.96)',backdropFilter:'blur(8px)',color:'#fff',padding:'11px 22px',borderRadius:isWide?24:16,fontSize:13,fontWeight:700,pointerEvents:'none',whiteSpace:isWide?'nowrap':'normal',maxWidth:isWide?undefined:'calc(100% - 24px)',textAlign:'center',lineHeight:1.4,border:'1px solid rgba(255,255,255,0.35)',boxShadow:'0 6px 24px rgba(13,148,136,0.4)'}}>
                  {lineType==='hip'
                    ? '2 clicks: peak → corner · saves, then drag/remove it · tap Add Hip again for the next · snaps to corners/peaks'
                    : `2 clicks: end → end · saves, then drag/remove it · snaps to corners/peaks`}
                </div>
              )}

              {area&&pins>=3&&(
                <div style={{position:'absolute',top:16,left:16,background:dk?'rgba(15,20,35,0.9)':'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid rgba(20,184,166,0.4)',borderRadius:14,padding:'10px 16px',boxShadow:'0 4px 24px rgba(0,0,0,0.15)',pointerEvents:'none'}}>
                  <div style={{fontSize:11,color:'#14B8A6',fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>ACTIVE REGION</div>
                  <div style={{fontSize:22,fontWeight:800,color:T.text}}>{fmtSq(rawSq)} <span style={{fontSize:13,color:T.textMuted}}>sq</span></div>
                  <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{fmt(area||0)} sq ft</div>
                </div>
              )}

              {mapReady&&pins>0&&isWide&&(
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
        <div style={{width:isWide?280:'100%',flexShrink:0,maxHeight:isWide?undefined:'55vh',background:T.panel,borderLeft:isWide?`1px solid ${T.panelBorder}`:'none',borderTop:isWide?'none':`1px solid ${T.panelBorder}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
            <MeasurementsPanel/>
            {settingsOpen&&<SettingsPanel/>}
          </div>
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
