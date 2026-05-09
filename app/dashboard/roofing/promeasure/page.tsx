'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Session } from '@/types'

const PITCH_FACTORS: Record<string, number> = {
  '2/12': 1.014, '3/12': 1.031, '4/12': 1.054, '5/12': 1.083,
  '6/12': 1.118, '7/12': 1.158, '8/12': 1.202, '9/12': 1.250,
  '10/12': 1.302, '11/12': 1.357, '12/12': 1.414,
}

declare global { interface Window { google: any; __pgMapCb: () => void } }

function ProMeasureInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initAddress = searchParams.get('address') || ''

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<any>(null)
  const polyRef   = useRef<any>(null)
  const markers   = useRef<any[]>([])

  const [address,   setAddress]   = useState(initAddress)
  const [pitch,     setPitch]     = useState('4/12')
  const [waste,     setWaste]     = useState(10)
  const [pins,      setPins]      = useState(0)
  const [area,      setArea]      = useState<number | null>(null)
  const [perim,     setPerim]     = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [mapReady,  setMapReady]  = useState(false)
  const [apiErr,    setApiErr]    = useState('')

  function buildMap() {
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
    })
    mapRef.current = map
    setMapReady(true)

    map.addListener('click', (e: any) => {
      if (!e.latLng) return
      const marker = new window.google.maps.Marker({
        position: e.latLng, map, draggable: true,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 7, fillColor: '#14B8A6', fillOpacity: 1,
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
    })
  }

  function redraw(map: any) {
    const pts = markers.current.map(m => m.getPosition()).filter(Boolean)
    setPins(pts.length)
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null }
    if (pts.length < 2) { setArea(null); setPerim(null); return }
    polyRef.current = new window.google.maps.Polygon({
      paths: pts, map,
      strokeColor: '#14B8A6', strokeOpacity: 0.9, strokeWeight: 2,
      fillColor: '#14B8A6', fillOpacity: 0.2,
    })
    if (pts.length >= 3) {
      setArea(window.google.maps.geometry.spherical.computeArea(pts) * 10.7639)
      let p = 0
      for (let i = 0; i < pts.length; i++)
        p += window.google.maps.geometry.spherical.computeDistanceBetween(pts[i], pts[(i+1)%pts.length])
      setPerim(p * 3.28084)
    }
  }

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!key) { setApiErr('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set in Vercel env vars.'); return }
    if (window.google?.maps?.Map) { buildMap(); return }
    window.__pgMapCb = buildMap
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&callback=__pgMapCb`
    s.onerror = () => setApiErr('Google Maps failed to load — check API key and billing.')
    document.head.appendChild(s)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function geocode() {
    if (!address.trim() || !window.google?.maps?.Geocoder) return
    setSearching(true)
    new window.google.maps.Geocoder().geocode({ address }, (res: any, status: any) => {
      setSearching(false)
      if (status === 'OK' && res?.[0] && mapRef.current) {
        mapRef.current.setCenter(res[0].geometry.location)
        mapRef.current.setZoom(20)
      } else {
        alert('Address not found — try including city and state.')
      }
    })
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
  function pushToCalc() {
    sessionStorage.setItem('pg_promeasure', JSON.stringify({
      squares: +((area ?? 0) / 100).toFixed(2), pitch, waste,
      perimeter: perim ? +perim.toFixed(1) : null, address,
    }))
    router.push('/dashboard/roofing/calculator?from=promeasure')
  }

  const sq  = (area ?? 0) / 100
  const adj = sq * (PITCH_FACTORS[pitch] ?? 1.054) * (1 + waste / 100)

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', zIndex: 10 }}>

      {/* Top bar */}
      <div style={{ height: 52, flexShrink: 0, background: '#fff', borderBottom: '1px solid #E8E2D9', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', flexShrink: 0 }}>📐 ProMeasure</span>
        <input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === 'Enter' && geocode()}
          placeholder="Enter property address…"
          style={{ flex: 1, padding: '7px 11px', borderRadius: 9, border: '1.5px solid #D1D5DB', fontSize: 13, outline: 'none' }} />
        <button onClick={geocode} disabled={searching}
          style={{ padding: '7px 16px', borderRadius: 9, border: 'none', background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          {searching ? '…' : 'Go'}
        </button>
        <select value={pitch} onChange={e => setPitch(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, flexShrink: 0 }}>
          {Object.keys(PITCH_FACTORS).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={waste} onChange={e => setWaste(Number(e.target.value))}
          style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, flexShrink: 0 }}>
          {[5,8,10,12,15,20].map(w => <option key={w} value={w}>{w}% waste</option>)}
        </select>
      </div>

      {/* Map + panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Map container — position relative so the absolute child fills it */}
        <div style={{ flex: 1, position: 'relative', background: '#E8E2D9' }}>
          {apiErr ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
              <span style={{ fontSize: 40 }}>🗺️</span>
              <p style={{ fontWeight: 700, color: '#DC2626', textAlign: 'center', maxWidth: 360 }}>{apiErr}</p>
            </div>
          ) : (
            <>
              <div ref={mapDivRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              {!mapReady && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ color: '#6B7280', fontSize: 14, background: 'rgba(255,255,255,0.8)', padding: '8px 16px', borderRadius: 12 }}>Loading satellite map…</p>
                </div>
              )}
              {mapReady && pins === 0 && (
                <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                  Click the roof outline to drop pins
                </div>
              )}
              {pins > 0 && (
                <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 8 }}>
                  <button onClick={undo} style={{ padding: '8px 14px', borderRadius: 9, background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>↩ Undo</button>
                  <button onClick={clearAll} style={{ padding: '8px 14px', borderRadius: 9, background: 'rgba(220,38,38,0.8)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Side panel */}
        <div style={{ width: 220, flexShrink: 0, background: '#fff', borderLeft: '1px solid #E8E2D9', display: 'flex', flexDirection: 'column', padding: 16, gap: 10, overflowY: 'auto' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9CA3AF', margin: 0 }}>Measurements</p>
          {([
            ['Pins dropped', String(pins), false],
            ['Area (sq ft)', area ? Math.round(area).toLocaleString() : '—', !!area],
            ['Squares', area ? sq.toFixed(1) : '—', !!area],
            ['Perimeter (LF)', perim ? Math.round(perim).toLocaleString() : '—', false],
          ] as [string, string, boolean][]).map(([label, val, hi]) => (
            <div key={label} style={{ background: hi ? '#F0FDFA' : '#F9FAFB', borderRadius: 10, padding: '10px 12px', border: hi ? '1.5px solid #14B8A6' : '1px solid #F0EEE9' }}>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 2px' }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: hi ? '#0F766E' : '#111827', margin: 0 }}>{val}</p>
            </div>
          ))}

          {area ? (
            <>
              <div style={{ borderTop: '1px solid #F0EEE9', paddingTop: 10, marginTop: 2 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9CA3AF', margin: '0 0 8px' }}>Adjusted</p>
                <div style={{ background: '#F0FDFA', border: '2px solid #14B8A6', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 11, color: '#14B8A6', margin: '0 0 2px' }}>{pitch} pitch · {waste}% waste</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: '#0F766E', margin: 0 }}>{adj.toFixed(1)}</p>
                  <p style={{ fontSize: 11, color: '#14B8A6', margin: '4px 0 0' }}>adjusted squares</p>
                </div>
              </div>
              <button onClick={pushToCalc} style={{ marginTop: 4, padding: '12px', borderRadius: 11, border: 'none', background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Push to Calculator →
              </button>
            </>
          ) : (
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 'auto', textAlign: 'center', lineHeight: 1.6 }}>
              Drop 3+ pins around the roof perimeter to calculate area
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProMeasurePage() {
  return (
    <Suspense fallback={<div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#6B7280', fontSize:14 }}>Loading ProMeasure…</div>}>
      <ProMeasureInner />
    </Suspense>
  )
}
