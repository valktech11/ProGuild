'use client'
import { useState, useEffect } from 'react'
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

  useEffect(() => { if (!session) router.push('/login') }, [session, router])

  async function fetchProperties() {
    if (!session) return
    const r = await fetch(`/api/properties?pro_id=${session.id}${search ? '&search=' + encodeURIComponent(search) : ''}`)
    const d = await r.json()
    setProperties(d.properties || [])
  }

  useEffect(() => {
    fetchProperties().finally(() => setLoading(false))
  }, [session, search])

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
          <Ic size={14} color={t.textSubtle}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </Ic>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by address or city…"
            style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 12, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Ic size={15} color={t.textSubtle}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Ic>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.textSubtle }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
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
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14, border: `1px solid ${t.cardBorder}`, background: t.cardBg, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                onMouseLeave={e => (e.currentTarget.style.background = t.cardBg)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0FDFA', border: '1.5px solid #14B8A6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic size={18} color="#0F766E">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </Ic>
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
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setShowAdd(false)}>
            <div style={{ background: t.cardBg, borderRadius: 20, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}
              onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: t.textPri, margin: '0 0 20px' }}>Add Property</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>STREET ADDRESS *</label>
                  <input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="123 Oak Street"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>CITY</label>
                    <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="Tampa"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>ST</label>
                    <input value={newState} onChange={e => setNewState(e.target.value.toUpperCase().slice(0, 2))} placeholder="FL"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>ZIP</label>
                    <input value={newZip} onChange={e => setNewZip(e.target.value)} placeholder="33601"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowAdd(false)}
                  style={{ flex: 1, padding: '11px', borderRadius: 12, border: `1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={adding || !newAddr.trim()}
                  style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: newAddr.trim() ? '#0F766E' : '#9CA3AF', color: 'white', fontSize: 13, fontWeight: 700, cursor: newAddr.trim() ? 'pointer' : 'default' }}>
                  {adding ? 'Adding…' : 'Add Property'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
