'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'
import { timeAgo } from '@/lib/utils'

interface Property {
  id: string; address_line1: string; address_line2: string | null
  city: string | null; state: string | null; zip_code: string | null
  roof_type: string | null; sq_footage: number | null; created_at: string
}

function Ic({ children, size = 16, color = 'currentColor' }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  )
}

// Stroke icon components matching nav style
function IconProperties({ size = 18, color = '#0F766E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <rect x="9" y="12" width="6" height="9" rx="1"/>
    </svg>
  )
}

export default function PropertyListPage() {
  const router = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newAddr, setNewAddr] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newState, setNewState] = useState('')
  const [newZip, setNewZip] = useState('')

  // Google Places autocomplete
  const addrInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null)

  useEffect(() => { if (!session) router.push('/login') }, [session, router])

  const fetchProperties = useCallback(async () => {
    if (!session) return
    const r = await fetch(`/api/properties?pro_id=${session.id}${search ? '&search=' + encodeURIComponent(search) : ''}`)
    const d = await r.json()
    setProperties(d.properties || [])
  }, [session, search])

  useEffect(() => {
    fetchProperties().finally(() => setLoading(false))
  }, [fetchProperties])

  // Load Google Maps Places script and init autocomplete when modal opens
  // BUG FIXES:
  // 1. Input is UNCONTROLLED — no value=/onChange on the input element.
  //    Controlled inputs cause React re-renders that reset the input value
  //    and close the Places dropdown mid-selection.
  // 2. ac.unbindAll() before re-creating to prevent duplicate instances
  //    when modal is opened, closed, then re-opened (old cleanup nulled
  //    the ref but left the old Autocomplete attached to the DOM input).
  // 3. Check both 'gp-script' and 'gmap-script' IDs (ProMeasure loads
  //    with gmap-script) so we don't inject a duplicate script tag.
  useEffect(() => {
    if (!showAdd) return

    function initAutocomplete() {
      const g = (window as any).google
      if (!addrInputRef.current || !g?.maps?.places) return

      // Unbind previous instance if re-opening modal (prevents duplicate listeners)
      if (autocompleteRef.current) {
        try { autocompleteRef.current.unbindAll() } catch { /* ignore */ }
        autocompleteRef.current = null
      }

      const ac = new g.maps.places.Autocomplete(addrInputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address'],
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place.address_components) return

        let streetNum = '', route = '', city = '', state = '', zip = ''
        for (const comp of place.address_components) {
          const t = comp.types[0]
          if (t === 'street_number') streetNum = comp.long_name
          if (t === 'route') route = comp.long_name
          if (t === 'locality') city = comp.long_name
          if (t === 'administrative_area_level_1') state = comp.short_name
          if (t === 'postal_code') zip = comp.long_name
        }
        const fullAddr = `${streetNum} ${route}`.trim()
        setNewAddr(fullAddr)
        // Also update the uncontrolled input value so it shows the full address
        if (addrInputRef.current) addrInputRef.current.value = fullAddr
        setNewCity(city)
        setNewState(state)
        setNewZip(zip)
      })
      autocompleteRef.current = ac
    }

    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!mapsKey) {
      console.warn('[Places] NEXT_PUBLIC_GOOGLE_MAPS_KEY not set — autocomplete disabled')
      return
    }

    if ((window as any).google?.maps?.places) {
      // Already loaded (e.g. navigated from ProMeasure which loads gmap-script)
      setTimeout(initAutocomplete, 100)
    } else if (!document.getElementById('gp-script') && !document.getElementById('gmap-script')) {
      // Neither script loaded yet — inject ours
      const script = document.createElement('script')
      script.id = 'gp-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places`
      script.async = true
      script.onload = () => setTimeout(initAutocomplete, 100)
      script.onerror = () => console.warn('[Places] Maps JS script failed to load — check API key and referrer allowlist')
      document.head.appendChild(script)
    } else {
      // Script tag exists but may still be loading — poll for up to 5 seconds
      let waited = 0
      const check = setInterval(() => {
        waited += 200
        if ((window as any).google?.maps?.places) { clearInterval(check); initAutocomplete() }
        else if (waited >= 5000) { clearInterval(check); console.warn('[Places] Maps JS took >5s to load') }
      }, 200)
    }

    // No cleanup null — let the unbindAll() in next init handle cleanup
  }, [showAdd])

  async function handleAdd() {
    if (!session || !newAddr.trim()) return
    setAdding(true)
    const r = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, address_line1: newAddr.trim(), city: newCity || null, state: newState || null, zip_code: newZip || null }),
    })
    const d = await r.json()
    if (r.ok && d.property) {
      router.push('/dashboard/roofing/property/' + d.property.id)
    }
    setAdding(false)
  }

  if (!session) return null

  const filtered = properties.filter(p =>
    !search || p.address_line1.toLowerCase().includes(search.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(search.toLowerCase())
  )

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: `1.5px solid ${t.inputBorder}`,
    background: dk ? '#1E293B' : '#FFFFFF',
    color: t.textPri,
    fontSize: 14,
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>Property Profiles</h1>
            <p style={{ fontSize: 14, color: t.textSubtle, marginTop: 2 }}>Address-centric job history & roof data</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ic size={14} color="white"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ic>
            Add Property
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by address or city…"
            style={{ width: '100%', padding: '11px 14px 11px 38px', borderRadius: 12, border: `1.5px solid ${t.inputBorder}`, background: dk ? '#1E293B' : '#FFFFFF', color: t.textPri, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Ic size={15} color={t.textSubtle}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Ic>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.textSubtle }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#EFF6FF', border: '1.5px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <IconProperties size={28} color="#2563EB" />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: t.textPri, margin: '0 0 6px' }}>No properties yet</p>
            <p style={{ fontSize: 14, color: t.textSubtle, margin: '0 0 20px' }}>Add a property to track roof details, job history, and measurements.</p>
            <button onClick={() => setShowAdd(true)}
              style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Add First Property
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => (
              <div key={p.id}
                onClick={() => router.push('/dashboard/roofing/property/' + p.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14, border: `1px solid ${t.cardBorder}`, background: t.cardBg, cursor: 'pointer', transition: 'background 0.1s, box-shadow 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = t.cardBgHover; e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,118,110,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = t.cardBg; e.currentTarget.style.boxShadow = 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: '#EFF6FF', border: '1.5px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <IconProperties size={20} color="#2563EB" />
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: t.textPri, margin: '0 0 2px' }}>{p.address_line1}</p>
                    <p style={{ fontSize: 13, color: t.textSubtle, margin: 0 }}>
                      {[p.city, p.state, p.zip_code].filter(Boolean).join(', ')}
                      {p.roof_type && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 8, background: '#F0FDFA', color: '#0F766E', fontSize: 11, fontWeight: 700 }}>{p.roof_type}</span>}
                      {p.sq_footage && <span style={{ marginLeft: 6, color: t.textSubtle, fontSize: 12 }}>{p.sq_footage.toLocaleString()} sq ft</span>}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: t.textSubtle }}>{timeAgo(p.created_at)}</span>
                  <Ic size={14} color={t.textSubtle}><polyline points="9 18 15 12 9 6"/></Ic>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Property Modal */}
        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => { setShowAdd(false); if (addrInputRef.current) addrInputRef.current.value = '' }}>
            <div style={{ background: dk ? '#1E293B' : '#FFFFFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 32px 64px rgba(0,0,0,0.4)', border: `1px solid ${t.cardBorder}` }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: '#EFF6FF', border: '1.5px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconProperties size={22} color="#2563EB" />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: t.textPri, margin: 0 }}>Add Property</h2>
                  <p style={{ fontSize: 13, color: t.textSubtle, margin: 0 }}>Start typing to search the address</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Address — Places autocomplete */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Street Address *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}>
                      <Ic size={15} color="#0F766E"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></Ic>
                    </div>
                    <input
                      ref={addrInputRef}
                      defaultValue=""
                      placeholder="Start typing an address…"
                      autoComplete="off"
                      style={{ ...inputStyle, paddingLeft: 36 }}
                      onFocus={e => (e.target.style.borderColor = '#14B8A6')}
                      onBlur={e => {
                        e.target.style.borderColor = t.inputBorder
                        // Sync uncontrolled input value to state on blur
                        // (handles manual typing fallback when Places not used)
                        if (e.target.value && e.target.value !== newAddr) {
                          setNewAddr(e.target.value)
                        }
                      }}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: t.textSubtle, margin: '4px 0 0', opacity: 0.7 }}>
                    Powered by Google Places — select from dropdown for auto-fill
                  </p>
                </div>

                {/* City / State / ZIP — auto-filled by Places, editable */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 110px', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>City</label>
                    <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="Jacksonville"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#14B8A6')}
                      onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>St</label>
                    <input value={newState} onChange={e => setNewState(e.target.value.toUpperCase().slice(0, 2))} placeholder="FL"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#14B8A6')}
                      onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>ZIP</label>
                    <input value={newZip} onChange={e => setNewZip(e.target.value)} placeholder="32216"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#14B8A6')}
                      onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button onClick={() => { setShowAdd(false); if (addrInputRef.current) addrInputRef.current.value = ''; setNewAddr(''); setNewCity(''); setNewState(''); setNewZip('') }}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1.5px solid ${t.cardBorder}`, background: 'transparent', color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={adding || !newAddr.trim()}
                  style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: newAddr.trim() ? 'linear-gradient(135deg,#14B8A6,#0F766E)' : '#D1D5DB', color: 'white', fontSize: 13, fontWeight: 700, cursor: newAddr.trim() ? 'pointer' : 'default', boxShadow: newAddr.trim() ? '0 4px 14px rgba(15,118,110,0.3)' : 'none', transition: 'all 0.15s' }}>
                  {adding ? 'Adding…' : 'Add Property →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
