'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Card }      from '@/components/ui/Card'
import { Input, FormField } from '@/components/ui/Input'
import { Modal }     from '@/components/ui/Modal'
import { Btn }       from '@/components/ui/Btn'
import { ListItem }  from '@/components/ui/ListItem'
import { PageTitle, BodyText, MetaText } from '@/components/ui/Typography'
import { EmptyState } from '@/components/ui/EmptyState'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme, T, BRAND } from '@/lib/tokens'
import { timeAgo }   from '@/lib/utils'

interface ReportSummary {
  id: string; total_squares_order: number; dominant_pitch: string
  waste_factor: number; created_at: string
}

interface Property {
  id: string; address_line1: string; address_line2: string | null
  city: string | null; state: string | null; zip_code: string | null
  roof_type: string | null; sq_footage: number | null; created_at: string
  roof_reports?: ReportSummary[]
  report_count?: number
  latest_sq?: number | null
  latest_pitch?: string | null
  last_report_at?: string | null
}

const HouseIcon = ({ color = BRAND.teal }: { color?: string }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <rect x="9" y="12" width="6" height="9" rx="1"/>
  </svg>
)

const SearchIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

const PinIcon = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={BRAND.teal}
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)

export default function PropertyListPage() {
  const router    = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  const [properties, setProperties] = useState<Property[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [showAdd,    setShowAdd]    = useState(false)
  const [adding,     setAdding]     = useState(false)

  // Form state
  const [newAddr,  setNewAddr]  = useState('')
  const [newCity,  setNewCity]  = useState('')
  const [newState, setNewState] = useState('')
  const [newZip,   setNewZip]   = useState('')
  const [predictions, setPredictions] = useState<Array<{description: string; place_id: string}>>([])
  const [showPredictions, setShowPredictions] = useState(false)
  const [addrInputVal, setAddrInputVal] = useState('')

  useEffect(() => { if (!_authLoading && !session) router.push('/login') }, [_authLoading, session, router])



  const fetchProperties = useCallback(async () => {
    if (!session) return
    const r = await fetch(`/api/properties?pro_id=${session.id}${search ? '&search=' + encodeURIComponent(search) : ''}`)
    const d = await r.json()
    setProperties(d.properties || [])
  }, [session, search])

  useEffect(() => {
    fetchProperties().finally(() => setLoading(false))
  }, [fetchProperties])

  // ── Address autocomplete via Places Autocomplete API (server-side proxy) ───
  // No widget, no shadow DOM, no script loading conflicts.
  // Calls our own API route which proxies to Google Places Autocomplete.
  useEffect(() => {
    if (!addrInputVal || addrInputVal.length < 3) {
      setPredictions([]); setShowPredictions(false); return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(addrInputVal)}`)
        if (!res.ok) return
        const data = await res.json()
        setPredictions(data.predictions || [])
        setShowPredictions(true)
      } catch { /* ignore */ }
    }, 250)
    return () => clearTimeout(timer)
  }, [addrInputVal])

  async function selectPrediction(pred: { description: string; place_id: string }) {
    setShowPredictions(false)
    // Fetch place details to get address components
    try {
      const res = await fetch(`/api/places/details?place_id=${pred.place_id}`)
      if (!res.ok) { setNewAddr(pred.description.split(',')[0].trim()); return }
      const data = await res.json()
      const comps = data.result?.address_components || []
      let streetNum = '', route = '', city = '', state = '', zip = ''
      for (const comp of comps) {
        const types: string[] = comp.types || []
        if (types.includes('street_number')) streetNum = comp.long_name
        if (types.includes('route'))         route     = comp.long_name
        if (types.includes('locality'))      city      = comp.long_name
        if (!city && types.includes('sublocality_level_1')) city = comp.long_name
        if (types.includes('administrative_area_level_1')) state = comp.short_name
        if (types.includes('postal_code'))   zip       = comp.long_name
      }
      const streetAddr = `${streetNum} ${route}`.trim() || pred.description.split(',')[0].trim()
      setAddrInputVal(streetAddr)
      setNewAddr(streetAddr)
      setNewCity(city)
      setNewState(state)
      setNewZip(zip)
    } catch {
      setNewAddr(pred.description.split(',')[0].trim())
    }
  }

  function closeModal() {
    setShowAdd(false)
    setNewAddr(''); setNewCity(''); setNewState(''); setNewZip('')
    setAddrInputVal(''); setPredictions([]); setShowPredictions(false)
  }

  async function handleAdd() {
    const addr = newAddr.trim()
    if (!session || !addr) return
    setAdding(true)
    const r = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id:       session.id,
        address_line1: addr,
        city:         newCity  || null,
        state:        newState || null,
        zip_code:     newZip   || null,
      }),
    })
    const d = await r.json()
    if (r.ok && d.property) router.push('/dashboard/roofing/property/' + d.property.id)
    setAdding(false)
  }

  if (!session) return null

  const filtered = properties.filter(p =>
    !search ||
    p.address_line1.toLowerCase().includes(search.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: `${T.sp6}px ${T.sp4}px` }}>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: T.sp5, gap: T.sp3 }}>
          <div>
            <PageTitle dk={dk}>Property Profiles</PageTitle>
            <BodyText dk={dk} muted style={{ marginTop: T.sp1 }}>
              Address-centric job history &amp; roof data
            </BodyText>
          </div>

        </div>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: T.sp4 }}>
          <Input
            dk={dk}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by address or city…"
            prefixIcon={<SearchIcon color={t.textSubtle} />}
          />
        </div>

        {/* ── Property list ─────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: `${T.sp10}px 0`, color: t.textSubtle }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <Card dk={dk} pad="none">
            <EmptyState
              dk={dk}
              icon="🏠"
              title={search ? 'No properties match' : 'No properties yet'}
              description={search ? 'Try a different address or city.' : 'Properties are created automatically when you add a lead with an address. Use "+ Add New Lead" in the sidebar to get started.'}
              ctaLabel={search ? undefined : 'Add Property Manually'}
              onCta={search ? undefined : () => setShowAdd(true)}
            />
          </Card>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: T.sp3,
          }}>
            {filtered.map(p => {
              const reports = p.roof_reports ?? []
              const latest  = reports.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              // Prefer the server-derived summary; fall back to client derivation.
              const reportCount = p.report_count ?? reports.length
              const sq    = p.latest_sq    ?? latest?.total_squares_order ?? null
              const pitch = p.latest_pitch ?? latest?.dominant_pitch ?? null
              const hasReport = sq != null
              return (
                <Card key={p.id} dk={dk} pad="md" shadow hover
                  onClick={() => router.push('/dashboard/roofing/property/' + p.id)}
                  style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp3 }}>
                    {/* Icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: T.radSm, flexShrink: 0,
                      background: hasReport ? (dk ? '#0D2820' : '#F0FDFA') : (dk ? '#1A2130' : '#F9F8F6'),
                      border: `1.5px solid ${hasReport ? (dk ? '#0F4A3A' : '#99F6E4') : (dk ? '#2D3A4A' : '#E8E2D9')}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <HouseIcon color={hasReport ? BRAND.teal : (dk ? '#475569' : '#9CA3AF')} />
                    </div>
                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: T.fontEmphasis, fontWeight: 700, color: t.textPri,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.address_line1}
                      </div>
                      <div style={{ fontSize: T.fontSub, color: t.textMuted, marginTop: T.sp1 }}>
                        {[p.city, p.state, p.zip_code].filter(Boolean).join(', ')}
                      </div>
                      {/* Report chip or No-report nudge */}
                      {hasReport ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, marginTop: T.sp2, flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: T.fontBadge, fontWeight: 700, color: BRAND.teal,
                            background: dk ? '#0D2820' : '#F0FDFA', border: `1px solid ${dk ? '#0F4A3A' : '#99F6E4'}`,
                            borderRadius: T.radXs, padding: '2px 8px' }}>
                            {sq!.toFixed(1)} sq
                          </span>
                          <span style={{ fontSize: T.fontBadge, fontWeight: 600, color: t.textMuted,
                            background: t.cardBgAlt, borderRadius: T.radXs, padding: '2px 8px' }}>
                            {pitch}
                          </span>
                          {p.roof_type && (
                            <span style={{ fontSize: T.fontBadge, color: t.textSubtle }}>
                              {p.roof_type}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: T.fontBadge, color: t.textSubtle, marginTop: T.sp2, fontStyle: 'italic' }}>
                          No report yet
                        </div>
                      )}
                    </div>
                    {/* Meta */}
                    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: T.sp1, flexShrink: 0 }}>
                      <span style={{ fontSize: T.fontBadge, color: t.textSubtle }}>{timeAgo(p.created_at)}</span>
                      {reportCount > 0 && (
                        <span style={{ fontSize: T.fontBadge, color: t.textMuted }}>
                          {reportCount} report{reportCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke={t.textSubtle} strokeWidth={2.5} strokeLinecap="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Property Modal — inline (not Modal component) so pac-container
          z-index works correctly. Modal component zIndex:9999 interferes
          with Google Places pac-container positioning. Original pattern. */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp4 }}
          onClick={closeModal}>
          <div style={{ background: t.cardBg, borderRadius: T.radLg, padding: T.sp6,
              width: '100%', maxWidth: 460,
              boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
              border: `1px solid ${t.cardBorder}`,
              overflow: 'visible' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: T.sp3, marginBottom: T.sp5 }}>
              <div style={{ width: 40, height: 40, borderRadius: T.radSm, flexShrink: 0,
                  background: dk ? '#0D2820' : '#F0FDFA',
                  border: `1.5px solid ${dk ? '#0F4A3A' : '#99F6E4'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HouseIcon />
              </div>
              <div>
                <h2 style={{ fontSize: T.fontHeading, fontWeight: 800, color: t.textPri, margin: 0 }}>Add Property</h2>
                <p style={{ fontSize: T.fontSub, color: t.textMuted, margin: `${T.sp1}px 0 0` }}>Start typing to search the address</p>
              </div>
            </div>

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp4 }}>

              {/* Street address — custom autocomplete, no widget */}
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: T.fontBadge, fontWeight: 700, color: t.textMuted,
                    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                    display: 'block', marginBottom: T.sp1 }}>
                  Street Address <span style={{ color: BRAND.danger }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 11, top: '50%',
                      transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}>
                    <PinIcon />
                  </div>
                  <input
                    value={addrInputVal}
                    onChange={e => { setAddrInputVal(e.target.value); setNewAddr(e.target.value) }}
                    onFocus={() => predictions.length > 0 && setShowPredictions(true)}
                    onBlur={() => setTimeout(() => setShowPredictions(false), 150)}
                    placeholder="Start typing an address…"
                    autoComplete="off"
                    style={{ width: '100%', boxSizing: 'border-box' as const,
                      padding: `${T.sp3}px ${T.sp4}px ${T.sp3}px 36px`,
                      fontSize: T.fontBody, fontFamily: 'inherit', color: t.textPri,
                      background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
                      borderRadius: T.radSm, outline: 'none', transition: 'border-color 0.12s' }}
                    onFocusCapture={e => { e.currentTarget.style.borderColor = BRAND.teal }}
                    onBlurCapture={e => { e.currentTarget.style.borderColor = t.inputBorder }}
                  />
                </div>
                {/* Predictions dropdown */}
                {showPredictions && predictions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                    borderRadius: T.radSm, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    marginTop: 4, overflow: 'hidden',
                  }}>
                    {predictions.map((pred, i) => (
                      <div key={pred.place_id}
                        onMouseDown={() => selectPrediction(pred)}
                        style={{
                          padding: `${T.sp3}px ${T.sp4}px`,
                          fontSize: T.fontBody, color: t.textPri, cursor: 'pointer',
                          borderTop: i > 0 ? `1px solid ${t.divider}` : 'none',
                          display: 'flex', alignItems: 'center', gap: T.sp3,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                          stroke={t.textMuted} strokeWidth={2} strokeLinecap="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span>{pred.description}</span>
                      </div>
                    ))}
                    <div style={{ padding: `${T.sp2}px ${T.sp4}px`, borderTop: `1px solid ${t.divider}`,
                        display: 'flex', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: T.fontBadge, color: t.textSubtle }}>
                        Powered by Google
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* City / State / ZIP */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px', gap: T.sp3 }}>
                {[
                  { label: 'City',  val: newCity,  set: setNewCity,  ph: 'Jacksonville', tf: (v: string) => v },
                  { label: 'State', val: newState, set: setNewState, ph: 'FL',           tf: (v: string) => v.toUpperCase().slice(0, 2) },
                  { label: 'ZIP',   val: newZip,   set: setNewZip,   ph: '32216',        tf: (v: string) => v },
                ].map(({ label, val, set, ph, tf }) => (
                  <div key={label}>
                    <label style={{ fontSize: T.fontBadge, fontWeight: 700, color: t.textMuted,
                        letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                        display: 'block', marginBottom: T.sp1 }}>
                      {label}
                    </label>
                    <input value={val} onChange={e => set(tf(e.target.value))} placeholder={ph}
                      style={{ width: '100%', boxSizing: 'border-box' as const,
                        padding: `${T.sp3}px ${T.sp4}px`,
                        fontSize: T.fontBody, fontFamily: 'inherit', color: t.textPri,
                        background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
                        borderRadius: T.radSm, outline: 'none', transition: 'border-color 0.12s' }}
                      onFocus={e => { e.currentTarget.style.borderColor = BRAND.teal }}
                      onBlur={e => { e.currentTarget.style.borderColor = t.inputBorder }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: T.sp3, marginTop: T.sp6 }}>
              <Btn variant="ghost" dk={dk} fullWidth onClick={closeModal}>Cancel</Btn>
              <Btn variant="primary" dk={dk} fullWidth loading={adding}
                disabled={!newAddr.trim()} onClick={handleAdd}
                style={{ flex: 2 }}>
                Add Property
              </Btn>
            </div>
          </div>
        </div>
      )}

    </DashboardShell>
  )
}
