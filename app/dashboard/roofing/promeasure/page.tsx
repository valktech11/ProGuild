'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'

// Pitch factor lookup (rise/12 → factor)
const PITCH_FACTORS: Record<string, number> = {
  '2/12': 1.014, '3/12': 1.031, '4/12': 1.054, '5/12': 1.083,
  '6/12': 1.118, '7/12': 1.158, '8/12': 1.202, '9/12': 1.250,
  '10/12': 1.302, '11/12': 1.357, '12/12': 1.414,
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any
    initProMeasureMap: () => void
  }
}

function Ic({ children, size = 16, color = 'currentColor' }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  )
}

function ProMeasureInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initAddress = searchParams.get('address') || ''

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  const [address, setAddress] = useState(initAddress)
  const [pitch, setPitch] = useState('4/12')
  const [waste, setWaste] = useState(10)
  const [area, setArea] = useState<number | null>(null)        // sq ft
  const [perimeter, setPerimeter] = useState<number | null>(null) // linear ft
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [pinCount, setPinCount] = useState(0)

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const polygonRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  // Load Google Maps script
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey) {
      setMapError('NEXT_PUBLIC_GOOGLE_MAPS_KEY is not set. Add it to your environment variables.')
      return
    }

    function tryInit() {
      if (!mapRef.current) { setTimeout(tryInit, 50); return }
      initMap()
    }

    // Already loaded
    if (window.google?.maps?.Map) { tryInit(); return }

    // Set callback on window BEFORE injecting script
    window.initProMeasureMap = tryInit

    if (!document.getElementById('gmap-script')) {
      const script = document.createElement('script')
      script.id = 'gmap-script'
      // callback= is the correct pattern; loading=async tells Maps to init async
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=initProMeasureMap&loading=async`
      script.onerror = () => setMapError('Failed to load Google Maps. Check your API key and billing.')
      document.head.appendChild(script)
    }

    return () => { if (window.initProMeasureMap) window.initProMeasureMap = () => {} }
  }, [])

  function initMap() {
    if (!mapRef.current) return
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 19,
      center: { lat: 27.9506, lng: -82.4572 },
      mapTypeId: 'satellite',
      tilt: 0,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    })
    mapInstanceRef.current = map
    setMapLoaded(true)

    // Click to add polygon vertices
    map.addListener('click', (e: any) => {
      if (!e.latLng) return
      addVertex(e.latLng, map)
    })
  }

  function addVertex(latLng: any, map: any) {
    // Add marker
    const marker = new window.google.maps.Marker({
      position: latLng, map,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: '#0F766E', fillOpacity: 1,
        strokeColor: 'white', strokeWeight: 2,
      },
      draggable: true,
    })
    markersRef.current.push(marker)

    // Rebuild polygon
    rebuildPolygon(map)

    marker.addListener('drag', () => rebuildPolygon(map))
    marker.addListener('dblclick', () => {
      marker.setMap(null)
      markersRef.current = markersRef.current.filter(m => m !== marker)
      rebuildPolygon(map)
    })

    setPinCount(markersRef.current.length)
  }

  function rebuildPolygon(map: any) {
    const pts = markersRef.current.map(m => m.getPosition()!).filter(Boolean)
    setPinCount(pts.length)

    if (polygonRef.current) polygonRef.current.setMap(null)

    if (pts.length < 2) { setArea(null); setPerimeter(null); return }

    const polygon = new window.google.maps.Polygon({
      paths: pts,
      strokeColor: '#0F766E', strokeOpacity: 0.9, strokeWeight: 2,
      fillColor: '#14B8A6', fillOpacity: 0.25,
      map,
    })
    polygonRef.current = polygon

    if (pts.length >= 3) {
      const sqM = window.google.maps.geometry.spherical.computeArea(pts)
      const sqFt = sqM * 10.7639
      setArea(sqFt)

      // Perimeter
      let perimM = 0
      for (let i = 0; i < pts.length; i++) {
        perimM += window.google.maps.geometry.spherical.computeDistanceBetween(pts[i], pts[(i + 1) % pts.length])
      }
      setPerimeter(perimM * 3.28084)
    }
  }

  async function geocodeAddress() {
    if (!address.trim() || !window.google?.maps) return
    setSearching(true)
    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ address }, (results: any, status: any) => {
      setSearching(false)
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(loc)
          mapInstanceRef.current.setZoom(20)
        }
      } else {
        alert('Address not found. Try a more specific address including city and state.')
      }
    })
  }

  function clearAll() {
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null }
    setArea(null); setPerimeter(null); setPinCount(0)
  }

  function undoLast() {
    if (!markersRef.current.length) return
    const last = markersRef.current.pop()!
    last.setMap(null)
    if (mapInstanceRef.current) rebuildPolygon(mapInstanceRef.current)
  }

  function pushToCalculator() {
    if (!area) return
    const squares = area / 100
    const data = { squares: +squares.toFixed(2), pitch, waste, perimeter: perimeter ? +perimeter.toFixed(1) : null, address }
    sessionStorage.setItem('pg_promeasure', JSON.stringify(data))
    router.push('/dashboard/roofing/calculator?from=promeasure')
  }

  const sqFt = area ?? 0
  const squares = sqFt / 100
  const pitchFactor = PITCH_FACTORS[pitch] ?? 1.054
  const adjustedSq = squares * pitchFactor * (1 + waste / 100)

  if (!session) return null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ height: 'calc(100vh - 128px)', display: 'flex', flexDirection: 'column', margin: '-16px' }}>

        {/* Top bar */}
        <div style={{ background: t.cardBg, borderBottom: `1px solid ${t.cardBorder}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            <Ic size={14}><polyline points="15 18 9 12 15 6"/></Ic> Back
          </button>
          <div style={{ fontWeight: 800, fontSize: 15, color: t.textPri, flexShrink: 0 }}>📐 ProMeasure</div>

          {/* Address search */}
          <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
            <input value={address} onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && geocodeAddress()}
              placeholder="Enter property address…"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }} />
            <button onClick={geocodeAddress} disabled={searching || !mapLoaded}
              style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {searching ? '…' : 'Go'}
            </button>
          </div>

          {/* Pitch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle }}>Pitch</label>
            <select value={pitch} onChange={e => setPitch(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }}>
              {Object.keys(PITCH_FACTORS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Waste */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle }}>Waste</label>
            <select value={waste} onChange={e => setWaste(Number(e.target.value))}
              style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }}>
              {[5,8,10,12,15,20].map(w => <option key={w} value={w}>{w}%</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Map */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {mapError ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: 32 }}>
                <div style={{ fontSize: 40 }}>🗺️</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#DC2626', textAlign: 'center' }}>{mapError}</p>
                <p style={{ fontSize: 13, color: t.textSubtle, textAlign: 'center', maxWidth: 400 }}>
                  Add <code style={{ background: t.cardBgAlt, padding: '2px 6px', borderRadius: 6 }}>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> to your Vercel environment variables, then redeploy.
                </p>
              </div>
            ) : (
              <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 500, position: 'absolute', inset: 0 }} />
            )}

            {/* Floating instructions */}
            {mapLoaded && pinCount === 0 && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                Click on the map to drop pins around the roof perimeter
              </div>
            )}

            {/* Floating controls */}
            {mapLoaded && pinCount > 0 && (
              <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 8 }}>
                <button onClick={undoLast}
                  style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  ↩ Undo
                </button>
                <button onClick={clearAll}
                  style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'rgba(220,38,38,0.8)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Results panel */}
          <div style={{ width: 240, background: t.cardBg, borderLeft: `1px solid ${t.cardBorder}`, display: 'flex', flexDirection: 'column', padding: 16, gap: 16, overflowY: 'auto' }}>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 10 }}>Measurements</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: t.cardBgAlt, borderRadius: 12, padding: '10px 12px' }}>
                  <p style={{ fontSize: 11, color: t.textSubtle, margin: '0 0 2px' }}>Pins dropped</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>{pinCount}</p>
                </div>
                <div style={{ background: area ? '#F0FDFA' : t.cardBgAlt, borderRadius: 12, padding: '10px 12px' }}>
                  <p style={{ fontSize: 11, color: t.textSubtle, margin: '0 0 2px' }}>Area (raw)</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: area ? '#0F766E' : t.textSubtle, margin: 0 }}>
                    {area ? sqFt.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                  </p>
                  {area && <p style={{ fontSize: 11, color: '#14B8A6', margin: '2px 0 0' }}>sq ft · {squares.toFixed(1)} squares</p>}
                </div>
                {perimeter && (
                  <div style={{ background: t.cardBgAlt, borderRadius: 12, padding: '10px 12px' }}>
                    <p style={{ fontSize: 11, color: t.textSubtle, margin: '0 0 2px' }}>Perimeter</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: t.textPri, margin: 0 }}>{perimeter.toFixed(0)} LF</p>
                  </div>
                )}
              </div>
            </div>

            {area && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 10 }}>Adjusted ({pitch} pitch, {waste}% waste)</p>
                <div style={{ background: '#F0FDFA', border: '1.5px solid #14B8A6', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 11, color: '#14B8A6', margin: '0 0 2px' }}>Adjusted squares</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#0F766E', margin: 0 }}>{adjustedSq.toFixed(1)}</p>
                  <p style={{ fontSize: 11, color: '#14B8A6', margin: '4px 0 0' }}>sq × {PITCH_FACTORS[pitch]} × {1 + waste/100}</p>
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={pushToCalculator} disabled={!area}
                style={{ padding: '12px', borderRadius: 12, border: 'none', background: area ? '#0F766E' : '#9CA3AF', color: 'white', fontSize: 13, fontWeight: 700, cursor: area ? 'pointer' : 'default', textAlign: 'center' }}>
                Push to Calculator →
              </button>
              <p style={{ fontSize: 11, color: t.textSubtle, textAlign: 'center', margin: 0 }}>
                {area ? 'Opens roofing calculator with these measurements' : 'Drop ≥3 pins to calculate area'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

export default function ProMeasurePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading ProMeasure…</div>}>
      <ProMeasureInner />
    </Suspense>
  )
}
