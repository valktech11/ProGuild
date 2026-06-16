'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme, T } from '@/lib/tokens'
import { invoiceStatusStyle } from '@/lib/design'
import { timeAgo, capName, fmtCurrency } from '@/lib/utils'

type InvoiceSummary = {
  id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'viewed' | 'partial_payment' | 'paid' | 'void'
  lead_name: string
  trade: string
  total: number
  balance_due: number
  due_date: string | null
  created_at: string
}



export default function InvoicesPage() {
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

  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [summary,  setSummary]  = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<string>('all')
  // Responsive: collapse the 2-up stat cards to single column on narrow screens
  // so the Collected value stops clipping. Matches the >=900px breakpoint used
  // elsewhere. isWide defaults true so SSR first paint is the desktop layout.
  const [isWide, setIsWide] = useState(true)
  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    // Raw list powers the table (search/filter — UI state). Summary powers the
    // KPI cards (derived metrics — single source for web + mobile).
    Promise.all([
      fetch(`/api/invoices?pro_id=${session.id}`).then(r => r.json()).catch(() => ({ invoices: [] })),
      fetch(`/api/invoices/summary?pro_id=${session.id}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([d, sum]) => {
        const raw: InvoiceSummary[] = d.invoices || []
        const seen = new Set<string>()
        setInvoices(raw.filter(inv => { if (seen.has(inv.id)) return false; seen.add(inv.id); return true }))
        setSummary(sum)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, router])

  const t   = theme(dk)
  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.lead_name.toLowerCase().includes(search.toLowerCase()) || inv.invoice_number.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || inv.status === filter
    return matchSearch && matchFilter
  })

  // KPI metrics — from /api/invoices/summary (single source for web + mobile).
  const totalOutstanding = summary?.outstanding ?? invoices.filter(i => !['paid','void'].includes(i.status)).reduce((s, i) => s + (i.balance_due || 0), 0)
  const totalPaid        = summary?.collected   ?? invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)

  const inputStyle: React.CSSProperties = {
    fontSize: 14, padding: '9px 14px', borderRadius: 10,
    border: `1.5px solid ${t.inputBorder}`, background: t.inputBg,
    color: t.textPri, outline: 'none',
  }

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: T.fontStat, fontWeight: 800, color: t.textPri, margin: 0 }}>Invoices</h1>
            <p style={{ fontSize: 14, color: t.textMuted, marginTop: 4 }}>Track and manage client payments</p>
          </div>

          {/* Stats */}
          {(() => {
            const overdueAmt = summary?.overdue ?? 0
            const overdueN   = summary?.overdueCount ?? 0
            const cards = [
              { label: 'Outstanding', value: fmt(totalOutstanding), sub: 'money owed to you', color: totalOutstanding > 0 ? '#B45309' : t.textPri, bg: totalOutstanding > 0 ? '#FFFBEB' : t.cardBg },
              { label: 'Collected',   value: fmt(totalPaid),        sub: 'paid invoices',     color: '#15803D', bg: '#F0FDF4' },
              ...(overdueAmt > 0 ? [{ label: `Overdue${overdueN > 0 ? ` · ${overdueN}` : ''}`, value: fmt(overdueAmt), sub: 'past due date', color: '#DC2626', bg: '#FEF2F2' }] : []),
            ]
            const cols = isWide ? cards.length : 1
            return (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 24 }}>
                {cards.map(s => (
                  <div key={s.label} style={{ background: dk ? t.cardBg : s.bg, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: '14px 20px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: T.fontStat, fontWeight: 800, color: dk ? t.textPri : s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: t.textSubtle, marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Search + filter */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by client or invoice #..."
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              onFocus={e => (e.target.style.borderColor = '#0F766E')}
              onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
            <select value={filter} onChange={e => setFilter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: 110, maxWidth: 130 }}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="partial_payment">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {/* Invoice list */}
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 24 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 60, borderRadius: 8, background: t.cardBgAlt, marginBottom: 8 }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                <p style={{ fontSize: 16, fontWeight: 700, color: t.textPri, margin: '0 0 6px' }}>
                  {search || filter !== 'all' ? 'No invoices match' : 'No invoices yet'}
                </p>
                <p style={{ fontSize: 14, color: t.textMuted, margin: '0 0 20px' }}>
                  {search || filter !== 'all'
                    ? 'Try adjusting your search or filter'
                    : 'Invoices are created from approved estimates. Get a client to approve an estimate first.'}
                </p>
                {!search && filter === 'all' && (
                  <a href="/dashboard/estimates" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 20px', borderRadius:10, background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize: 14, fontWeight:700, textDecoration:'none' }}>
                    Go to Estimates →
                  </a>
                )}
              </div>
            ) : filtered.map((inv, i) => {
              const s = invoiceStatusStyle(inv.status, dk)
              const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && ['sent','viewed','partial_payment'].includes(inv.status)
              return (
                <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', textDecoration: 'none', background: i % 2 === 1 ? t.tableRowAlt : 'transparent' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = t.tableRowHover)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? t.tableRowAlt : 'transparent')}
                >
                  {/* Invoice icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: dk ? '#1E293B' : s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s.text} strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: t.textPri }}>{inv.invoice_number}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: dk ? t.cardBgAlt : s.bg, color: s.text }}>{s.label}</span>
                      {isOverdue && <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#FEF2F2', color: '#B91C1C' }}>Overdue</span>}
                    </div>
                    <div style={{ fontSize: 14, color: t.textMuted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {capName(inv.lead_name)}
                      {inv.due_date && <span> · Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: inv.status === 'paid' ? '#15803D' : t.textPri }}>
                      {fmt(inv.status === 'paid' ? inv.total : (inv.balance_due ?? inv.total))}
                    </div>
                    <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>
                      {inv.status === 'paid' ? 'Paid' : 'Balance due'} · {timeAgo(inv.created_at)}
                    </div>
                  </div>

                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={t.textSubtle} strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 4l4 4-4 4"/>
                  </svg>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
