'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'

interface RevenueData {
  thisMonth: { revenue: number; jobs: number }
  lastMonth: { revenue: number; jobs: number }
  monthly: { label: string; revenue: number; jobs: number }[]
  byCarrier: { carrier: string; jobs: number; revenue: number; avg: number }[]
  periodTotal: number
  periodJobs?: number
  momChangePct?: number | null
  totalYTD: number
  totalAll: number
}

const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString()}`)

export default function RevenuePage() {
  const router = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  const toggleDark = () => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'mtd'|'ytd'|'12mo'|'all'>('all')

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    const s = session
    fetch(`/api/roofing/revenue?pro_id=${s.id}&period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router, period])

  const t = theme(dk)
  const maxRev = data ? Math.max(...data.monthly.map(m => m.revenue), 1) : 1
  // MoM % is derived once server-side (momChangePct); fall back to inline calc.
  const delta = data
    ? (data.momChangePct ?? (data.lastMonth.revenue > 0
        ? Math.round(((data.thisMonth.revenue - data.lastMonth.revenue) / data.lastMonth.revenue) * 100) : null))
    : null

  const card: React.CSSProperties = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '16px 18px' }
  const cardLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle }
  const cardValue: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: t.textPri, marginTop: 6, letterSpacing: '-0.02em' }

  return (
    <DashboardShell session={session} newLeads={0} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <Link href="/dashboard" style={{ fontSize: 14, color: t.textMuted, textDecoration: 'none' }}>Dashboard</Link>
              <span style={{ color: t.textSubtle }}>/</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>Revenue</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: t.textPri, margin: 0 }}>Revenue</h1>
            <p style={{ fontSize: 14, color: t.textMuted, marginTop: 2 }}>
              Won jobs by month and by carrier. Revenue uses the approved insurance amount where available, otherwise the quote.
            </p>
          </div>

          {loading ? (
            <div style={{ color: t.textMuted }}>Loading…</div>
          ) : !data ? (
            <div style={{ color: t.textMuted }}>No data yet.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
                <div style={card}>
                  <div style={cardLabel}>This month</div>
                  <div style={cardValue}>{fmt(data.thisMonth.revenue)}</div>
                  <div style={{ fontSize: 12, color: delta == null ? t.textMuted : delta >= 0 ? '#059669' : '#DC2626', marginTop: 2 }}>
                    {data.thisMonth.jobs} job{data.thisMonth.jobs !== 1 ? 's' : ''}{delta != null ? ` · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last mo` : ''}
                  </div>
                </div>
                <div style={card}>
                  <div style={cardLabel}>Last month</div>
                  <div style={cardValue}>{fmt(data.lastMonth.revenue)}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{data.lastMonth.jobs} job{data.lastMonth.jobs !== 1 ? 's' : ''}</div>
                </div>
                <div style={card}>
                  <div style={cardLabel}>This year</div>
                  <div style={cardValue}>{fmt(data.totalYTD)}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>year to date</div>
                </div>
                <div style={card}>
                  <div style={cardLabel}>Total won</div>
                  <div style={cardValue}>{fmt(data.totalAll)}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>all time</div>
                </div>
              </div>

              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 16 }}>Monthly won revenue · last 6 months</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 170 }}>
                  {data.monthly.map(m => (
                    <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.textPri, minHeight: 14 }}>{m.revenue > 0 ? fmt(m.revenue) : ''}</div>
                      <div style={{ width: '100%', maxWidth: 56, background: m.revenue > 0 ? '#0F766E' : (dk ? '#1E293B' : '#F1F5F9'), borderRadius: '6px 6px 0 0', height: `${Math.max((m.revenue / maxRev) * 120, m.revenue > 0 ? 4 : 2)}px`, transition: 'height .3s' }} />
                      <div style={{ fontSize: 11, color: t.textMuted }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>By insurance carrier</div>
                  <div style={{ display: 'flex', gap: 4, background: dk ? '#0F172A' : '#F1F5F9', borderRadius: 8, padding: 3 }}>
                    {([['mtd','This month'],['ytd','This year'],['12mo','12 mo'],['all','All time']] as const).map(([k, lbl]) => (
                      <button key={k} onClick={() => setPeriod(k)}
                        style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: period === k ? (dk ? '#1E293B' : '#fff') : 'transparent',
                          color: period === k ? '#0F766E' : t.textMuted,
                          boxShadow: period === k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>
                  Where your won revenue comes from — {fmt(data.periodTotal)} across {data.periodJobs ?? data.byCarrier.reduce((s,c)=>s+c.jobs,0)} job{(data.periodJobs ?? data.byCarrier.reduce((s,c)=>s+c.jobs,0))!==1?'s':''} in this period.
                </div>
                {data.byCarrier.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 13 }}>No won jobs yet.</div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle, padding: '6px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                      <div>Carrier</div>
                      <div style={{ textAlign: 'right' }}>Jobs</div>
                      <div style={{ textAlign: 'right' }}>Revenue</div>
                      <div style={{ textAlign: 'right' }}>Avg</div>
                    </div>
                    {data.byCarrier.map(c => (
                      <div key={c.carrier} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr', fontSize: 13, color: t.textPri, padding: '10px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                        <div style={{ fontWeight: 600 }}>{c.carrier}</div>
                        <div style={{ textAlign: 'right' }}>{c.jobs}</div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(c.revenue)}</div>
                        <div style={{ textAlign: 'right', color: t.textMuted }}>{fmt(c.avg)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
