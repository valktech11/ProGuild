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

interface Property {
  id: string; address_line1: string; address_line2: string | null
  city: string | null; state: string | null; zip_code: string | null
  roof_type: string | null; sq_footage: number | null; created_at: string
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
        if (addrInputRef.current) addrInputRef.current.value = full
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

  const canAdd = !!(addrInputRef.current?.value?.trim() || newAddr.trim())

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
          <Card dk={dk} pad="none" shadow>
            {filtered.map((p, i) => (
              <ListItem
                key={p.id}
                dk={dk}
                separator={i > 0}
                icon={<HouseIcon />}
                iconBg={dk ? '#0D2820' : '#F0FDFA'}
                title={p.address_line1}
                subtitle={[p.city, p.state, p.zip_code].filter(Boolean).join(', ')}
                chip={[
                  p.roof_type,
                  p.sq_footage ? `${p.sq_footage.toLocaleString()} sq ft` : null,
                ].filter(Boolean).join(' · ') || undefined}
                meta={timeAgo(p.created_at)}
                onClick={() => router.push('/dashboard/roofing/property/' + p.id)}
              />
            ))}
          </Card>
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
          {/* Street address — uncontrolled (Google Places writes directly to DOM) */}
          <FormField label="Street Address" required hint="Select from dropdown for auto-fill" dk={dk}>
            <Input
              ref={addrInputRef}
              dk={dk}
              defaultValue=""
              placeholder="Start typing an address…"
              autoComplete="off"
              prefixIcon={<PinIcon />}
              onBlur={e => {
                // Sync manual typing to state
                if (e.target.value && e.target.value !== newAddr) setNewAddr(e.target.value)
              }}
            />
          </FormField>

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
            style={{ flex: 2, opacity: canAdd || newCity ? 1 : 0.6 }}
            onClick={handleAdd}>
            Add Property
          </Btn>
        </Modal.Footer>
      </Modal>

    </DashboardShell>
  )
}
