'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'

interface PerfData {
  winRate: number | null
  winRateMo: number | null
  wonAll: number
  lostAll: number
  avgCycle: number | null
  funnel: { stage: string; count: number; conversion: number; drop: number | null }[]
  biggestDropIndex: number
  bySource: { source: string; leads: number; won: number; winRate: number; revenue: number; perLead: number }[]
  staleProposals: number
  totalLeads: number
}

const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString()}`)

export default function PerformancePage() {
  const router = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  const toggleDark = () => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }
  const [data, setData] = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    const s = session
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

              {data.staleProposals > 0 && (
                <a href="/dashboard/pipeline?stage=proposal_sent" style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, marginBottom: 20, background: dk ? 'rgba(234,88,12,0.12)' : '#FFF7ED', border: `1px solid ${dk ? '#7C2D12' : '#FED7AA'}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dk ? 'rgba(234,88,12,0.2)' : '#FFEDD5' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C2410C" strokeWidth="2.2" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>Needs attention</div>
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 1 }}>{data.staleProposals} proposal{data.staleProposals === 1 ? '' : 's'} sent over 7 days ago with no movement — follow up to close.</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={t.textSubtle} strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>
                  </div>
                </a>
              )}

              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 4 }}>Conversion funnel</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>How far your leads get. The biggest drop between two stages is where you&apos;re losing deals.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.funnel.map((f, i) => {
                    const isBiggest = i === data.biggestDropIndex
                    return (
                      <div key={f.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 150, flexShrink: 0, fontSize: 13, fontWeight: isBiggest ? 700 : 600, color: t.textPri }}>{f.stage}</div>
                        <div style={{ flex: 1, height: 22, borderRadius: 6, background: dk ? '#1E293B' : '#F1F5F9', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${f.conversion}%`, background: '#0F766E', borderRadius: 6, minWidth: f.count > 0 ? 2 : 0, transition: 'width .4s' }} />
                        </div>
                        <div style={{ width: 96, textAlign: 'right', flexShrink: 0, fontSize: 13 }}>
                          <span style={{ fontWeight: 700, color: t.textPri }}>{f.count}</span>
                          <span style={{ color: t.textMuted }}> · {f.conversion}%</span>
                        </div>
                        <div style={{ width: 124, textAlign: 'right', flexShrink: 0, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {isBiggest && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#C2410C', background: dk ? 'rgba(234,88,12,0.18)' : '#FFF7ED', border: `1px solid ${dk ? '#7C2D12' : '#FED7AA'}`, borderRadius: 6, padding: '1px 6px' }}>Biggest drop</span>
                          )}
                          <span style={{ color: f.drop != null && isBiggest ? '#C2410C' : (f.drop != null && f.drop >= 50 ? '#DC2626' : t.textSubtle) }}>
                            {f.drop != null ? `−${f.drop}%` : ''}
                          </span>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr 1.2fr', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle, padding: '6px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                      <div>Source</div>
                      <div style={{ textAlign: 'right' }}>Leads</div>
                      <div style={{ textAlign: 'right' }}>Won</div>
                      <div style={{ textAlign: 'right' }}>Win %</div>
                      <div style={{ textAlign: 'right' }}>Revenue</div>
                      <div style={{ textAlign: 'right' }}>$ / Lead</div>
                    </div>
                    {data.bySource.map(s => (
                      <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr 1.2fr', fontSize: 13, color: t.textPri, padding: '10px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                        <div style={{ fontWeight: 600 }}>{s.source}</div>
                        <div style={{ textAlign: 'right' }}>{s.leads}</div>
                        <div style={{ textAlign: 'right' }}>{s.won}</div>
                        <div style={{ textAlign: 'right', color: s.winRate >= 50 ? '#059669' : t.textMuted }}>{s.winRate}%</div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(s.revenue)}</div>
                        <div style={{ textAlign: 'right', color: t.textMuted }}>{s.perLead > 0 ? fmt(s.perLead) : '—'}</div>
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
