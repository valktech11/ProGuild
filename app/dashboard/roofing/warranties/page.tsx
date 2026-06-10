'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'

type Warranty = {
  id: string
  lead_id: string | null
  shingle_brand: string | null
  shingle_model: string | null
  warranty_term: string | null
  install_date: string | null
  expiry_date: string | null
  created_at: string | null
  homeowner_name: string | null
  property_address: string | null
  property_city: string | null
  property_state: string | null
}

// Status derived from expiry_date. Dates from the DB arrive as strings; parse defensively.
function warrantyStatus(expiry: string | null): { label: string; bg: string; text: string; dot: string } {
  const today = new Date()
  const exp = expiry ? new Date(expiry) : null
  const valid = exp && !isNaN(exp.getTime())
  if (!valid) return { label: 'No expiry', bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' }
  const days = Math.floor((exp!.getTime() - today.getTime()) / 86400000)
  if (days < 0)    return { label: 'Expired',       bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' }
  if (days <= 365) return { label: 'Expiring soon', bg: '#FFFBEB', text: '#B45309', dot: '#D97706' }
  return { label: 'Active', bg: '#F0FDF4', text: '#15803D', dot: '#16A34A' }
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WarrantiesPage() {
  const router = useRouter()

  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    const s = session
    fetch(`/api/roofing/warranties?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setWarranties(d.warranties || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const t = theme(dk)

  const q = search.trim().toLowerCase()
  const filtered = warranties.filter(w => {
    if (!q) return true
    return [w.homeowner_name, w.property_address, w.shingle_brand, w.shingle_model, w.warranty_term]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
  })

  const inputStyle: React.CSSProperties = {
    padding: '11px 14px', fontSize: 14, borderRadius: 10,
    border: `1px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri,
    outline: 'none', width: '100%',
  }

  return (
    <DashboardShell session={session} newLeads={0} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link href="/dashboard" style={{ fontSize: 14, color: t.textMuted, textDecoration: 'none' }}>Dashboard</Link>
              <span style={{ color: t.textSubtle }}>/</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>Warranties</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: t.textPri, margin: 0 }}>Warranties</h1>
            <p style={{ fontSize: 14, color: t.textMuted, marginTop: 2 }}>
              {warranties.length} warranty record{warranties.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 20 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by homeowner, address, brand, or model..."
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#0F766E')}
              onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
          </div>

          {/* List */}
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 64, borderRadius: 10, animation: 'shimmer 1.4s ease-in-out infinite', background: 'linear-gradient(90deg, #F3F4F6 25%, #E9EAEC 50%, #F3F4F6 75%)', backgroundSize: '200% 100%' }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 24px' }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>🛡️</div>
                <p style={{ fontSize: 16, fontWeight: 600, color: t.textPri, marginBottom: 4 }}>
                  {search ? 'No warranties match your search' : 'No warranty records yet'}
                </p>
                <p style={{ fontSize: 14, color: t.textMuted }}>
                  {search ? 'Try a different homeowner, address, or shingle brand' : 'Record a warranty from a completed job on the lead page'}
                </p>
              </div>
            ) : filtered.map((w, i) => {
              const st = warrantyStatus(w.expiry_date)
              const addr = [w.property_address, w.property_city, w.property_state].filter(Boolean).join(', ')
              const shingle = [w.shingle_brand, w.shingle_model].filter(Boolean).join(' · ')
              const row = (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: t.textPri }}>
                        {w.homeowner_name || 'Unknown homeowner'}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.text }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                        {st.label}
                      </span>
                    </div>
                    {addr && <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</div>}
                    {shingle && <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 2 }}>{shingle}{w.warranty_term ? ` · ${w.warranty_term}` : ''}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, color: t.textMuted }}>Installed {fmtDate(w.install_date)}</div>
                    <div style={{ fontSize: 13, color: t.textSubtle }}>Expires {fmtDate(w.expiry_date)}</div>
                  </div>
                </>
              )
              const rowStyle: React.CSSProperties = {
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                borderTop: i > 0 ? `1px solid ${t.divider}` : 'none',
                textDecoration: 'none', transition: 'background 0.15s',
                background: i % 2 === 1 ? t.tableRowAlt : 'transparent',
              }
              // Link to the originating lead when we have one; otherwise a plain row.
              return w.lead_id ? (
                <Link key={w.id} href={`/dashboard/pipeline/${w.lead_id}`} style={rowStyle}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = t.tableRowHover)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? t.tableRowAlt : 'transparent')}>
                  {row}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={t.textSubtle} strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </Link>
              ) : (
                <div key={w.id} style={rowStyle}>{row}</div>
              )
            })}
          </div>

        </div>
      </div>
    </DashboardShell>
  )
}
