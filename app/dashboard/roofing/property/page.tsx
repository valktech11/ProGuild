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
import { Session }   from '@/types'
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
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [showAdd,    setShowAdd]    = useState(false)
  const [adding,     setAdding]     = useState(false)

  // Form state
  const [newAddr,  setNewAddr]  = useState('')
  const [newCity,  setNewCity]  = useState('')
  const [newState, setNewState] = useState('')
  const [newZip,   setNewZip]   = useState('')

  // Autocomplete
  const addrInputRef    = useRef<HTMLInputElement>(null)
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

  // ── Google Places autocomplete ─────────────────────────────────────────────
  useEffect(() => {
    if (!showAdd) return

    function initAutocomplete() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google
      if (!addrInputRef.current || !g?.maps?.places) return

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
        const full = `${streetNum} ${route}`.trim()
        setNewAddr(full)
        setNewCity(city)
        setNewState(state)
        setNewZip(zip)
      })
      autocompleteRef.current = ac
    }

    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!mapsKey) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) {
      setTimeout(initAutocomplete, 100)
    } else if (!document.getElementById('gp-script') && !document.getElementById('gmap-script')) {
      const script = document.createElement('script')
      script.id  = 'gp-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places`
      script.async = true
      script.onload = () => setTimeout(initAutocomplete, 100)
      script.onerror = () => console.warn('[Places] Script load failed')
      document.head.appendChild(script)
    } else {
      let waited = 0
      const check = setInterval(() => {
        waited += 200
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).google?.maps?.places) { clearInterval(check); initAutocomplete() }
        else if (waited >= 5000) clearInterval(check)
      }, 200)
    }
  }, [showAdd])

  function closeModal() {
    setShowAdd(false)
    setNewAddr(''); setNewCity(''); setNewState(''); setNewZip('')
    if (addrInputRef.current) addrInputRef.current.value = ''
  }

  async function handleAdd() {
    const addr = addrInputRef.current?.value?.trim() || newAddr.trim()
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
          <Btn variant="primary" dk={dk} onClick={() => setShowAdd(true)}
            icon={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
            style={{ flexShrink: 0 }}>
            Add Property
          </Btn>
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
              description={search ? 'Try a different address or city.' : 'Add a property to track roof details, measurements, and job history.'}
              ctaLabel={search ? undefined : '+ Add First Property'}
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
              const latest  = reports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              const hasReport = !!latest
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
                            {latest.total_squares_order.toFixed(1)} sq
                          </span>
                          <span style={{ fontSize: T.fontBadge, fontWeight: 600, color: t.textMuted,
                            background: t.cardBgAlt, borderRadius: T.radXs, padding: '2px 8px' }}>
                            {latest.dominant_pitch}
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
                      {reports.length > 0 && (
                        <span style={{ fontSize: T.fontBadge, color: t.textMuted }}>
                          {reports.length} report{reports.length !== 1 ? 's' : ''}
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

      {/* ── Add Property Modal ────────────────────────────────────────────── */}
      <Modal
        open={showAdd}
        onClose={closeModal}
        dk={dk}
        width={460}
        icon={<HouseIcon />}
        title="Add Property"
        subtitle="Start typing to search the address"
      >
        <Modal.Body dk={dk}>
          {/* Street address — raw <input>, not the <Input> component.
              Google Places Autocomplete uses getBoundingClientRect() to
              position the pac-container. Component wrappers with position/
              transform can offset it. Controlled input (value+onChange) is
              fine now that backdropFilter stacking context is removed. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp1 }}>
            <label style={{ fontSize: T.fontBadge, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
              Street Address <span style={{ color: BRAND.danger }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}>
                <PinIcon />
              </div>
              <input
                ref={addrInputRef}
                value={newAddr}
                placeholder="Start typing an address…"
                autoComplete="off"
                style={{
                  width: '100%', boxSizing: 'border-box' as const,
                  padding: `${T.sp3}px ${T.sp4}px ${T.sp3}px 36px`,
                  fontSize: T.fontBody, fontFamily: 'inherit',
                  color: t.textPri, background: t.inputBg,
                  border: `1.5px solid ${t.inputBorder}`,
                  borderRadius: T.radSm, outline: 'none',
                  transition: 'border-color 0.12s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = BRAND.teal }}
                onBlur={e => { e.currentTarget.style.borderColor = t.inputBorder }}
                onChange={e => setNewAddr(e.target.value)}
              />
            </div>
            <p style={{ fontSize: T.fontBadge, color: t.textSubtle, margin: 0 }}>
              Select from dropdown for auto-fill
            </p>
          </div>

          {/* City / State / ZIP */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px', gap: T.sp3 }}>
            <FormField label="City" dk={dk}>
              <Input dk={dk} value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="Jacksonville" />
            </FormField>
            <FormField label="State" dk={dk}>
              <Input dk={dk} value={newState} onChange={e => setNewState(e.target.value.toUpperCase().slice(0, 2))} placeholder="FL" />
            </FormField>
            <FormField label="ZIP" dk={dk}>
              <Input dk={dk} value={newZip} onChange={e => setNewZip(e.target.value)} placeholder="32216" />
            </FormField>
          </div>
        </Modal.Body>

        <Modal.Footer dk={dk}>
          <Btn variant="ghost" dk={dk} fullWidth onClick={closeModal}>Cancel</Btn>
          <Btn variant="primary" dk={dk} fullWidth loading={adding}
            disabled={!newAddr.trim()}
            onClick={handleAdd}>
            Add Property
          </Btn>
        </Modal.Footer>
      </Modal>

    </DashboardShell>
  )
}
