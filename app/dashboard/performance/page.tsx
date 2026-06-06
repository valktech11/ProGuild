'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'

interface PerfData {
  winRate: number | null
  winRateMo: number | null
  wonAll: number
  lostAll: number
  avgCycle: number | null
  funnel: { stage: string; count: number; conversion: number }[]
  bySource: { source: string; leads: number; won: number; winRate: number; revenue: number }[]
  totalLeads: number
}

const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString()}`)

export default function PerformancePage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [dk, setDk] = useState<boolean>(() => typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  const toggleDark = () => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }
  const [data, setData] = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.push('/login'); return }
    const s: Session = JSON.parse(raw); setSession(s)
    fetch(`/api/roofing/performance?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const t = theme(dk)
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
              <span style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>Performance</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: t.textPri, margin: 0 }}>Performance</h1>
            <p style={{ fontSize: 14, color: t.textMuted, marginTop: 2 }}>How your sales process is running — close rate, where deals drop off, and which lead sources pay off.</p>
          </div>

          {loading ? (
            <div style={{ color: t.textMuted }}>Loading…</div>
          ) : !data ? (
            <div style={{ color: t.textMuted }}>No data yet.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
                <div style={card}>
                  <div style={cardLabel}>Win rate · all time</div>
                  <div style={cardValue}>{data.winRate == null ? '—' : `${data.winRate}%`}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{data.wonAll} won · {data.lostAll} lost</div>
                </div>
                <div style={card}>
                  <div style={cardLabel}>Win rate · this month</div>
                  <div style={cardValue}>{data.winRateMo == null ? '—' : `${data.winRateMo}%`}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>of decided this month</div>
                </div>
                <div style={card}>
                  <div style={cardLabel}>Avg sales cycle</div>
                  <div style={cardValue}>{data.avgCycle == null ? '—' : `${data.avgCycle} d`}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>lead → won</div>
                </div>
                <div style={card}>
                  <div style={cardLabel}>Total leads</div>
                  <div style={cardValue}>{data.totalLeads}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>all time</div>
                </div>
              </div>

              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 4 }}>Conversion funnel</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>How far your leads get. The biggest drop between two stages is where you&apos;re losing deals.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.funnel.map((f, i) => {
                    const prev = i > 0 ? data.funnel[i - 1].count : f.count
                    const stepDrop = prev > 0 ? Math.round((1 - f.count / prev) * 100) : 0
                    return (
                      <div key={f.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 150, flexShrink: 0, fontSize: 13, fontWeight: 600, color: t.textPri }}>{f.stage}</div>
                        <div style={{ flex: 1, height: 22, borderRadius: 6, background: dk ? '#1E293B' : '#F1F5F9', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${f.conversion}%`, background: '#0F766E', borderRadius: 6, minWidth: f.count > 0 ? 2 : 0, transition: 'width .4s' }} />
                        </div>
                        <div style={{ width: 96, textAlign: 'right', flexShrink: 0, fontSize: 13 }}>
                          <span style={{ fontWeight: 700, color: t.textPri }}>{f.count}</span>
                          <span style={{ color: t.textMuted }}> · {f.conversion}%</span>
                        </div>
                        <div style={{ width: 56, textAlign: 'right', flexShrink: 0, fontSize: 12, fontWeight: 600, color: i > 0 && stepDrop >= 50 ? '#DC2626' : t.textSubtle }}>
                          {i > 0 ? `−${stepDrop}%` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 4 }}>Lead sources</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Which sources actually win work — put more into the ones that pay.</div>
                {data.bySource.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 13 }}>No leads yet.</div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle, padding: '6px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                      <div>Source</div>
                      <div style={{ textAlign: 'right' }}>Leads</div>
                      <div style={{ textAlign: 'right' }}>Won</div>
                      <div style={{ textAlign: 'right' }}>Win %</div>
                      <div style={{ textAlign: 'right' }}>Revenue</div>
                    </div>
                    {data.bySource.map(s => (
                      <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', fontSize: 13, color: t.textPri, padding: '10px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                        <div style={{ fontWeight: 600 }}>{s.source}</div>
                        <div style={{ textAlign: 'right' }}>{s.leads}</div>
                        <div style={{ textAlign: 'right' }}>{s.won}</div>
                        <div style={{ textAlign: 'right', color: s.winRate >= 50 ? '#059669' : t.textMuted }}>{s.winRate}%</div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(s.revenue)}</div>
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
