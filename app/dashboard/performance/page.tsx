'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'
import { apiFetch } from '@/lib/api-fetch'

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

const INDUSTRY_CLOSE = 25 // roofing industry avg close rate %

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
    apiFetch(`/api/roofing/performance?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, _authLoading, router])

  const t = theme(dk)
  const card: React.CSSProperties = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '16px 18px' }
  const cardLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle }
  const cardValue: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: t.textPri, marginTop: 6, letterSpacing: '-0.02em' }

  // Compute funnel taper: widths proportional to count relative to first stage
  const funnelMax = data?.funnel?.[0]?.count ?? 1

  const isEmpty = data && data.totalLeads === 0

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
          ) : isEmpty ? (
            /* ── Empty state ── */
            <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.textPri, marginBottom: 6 }}>No decided jobs yet</div>
              <div style={{ fontSize: 14, color: t.textMuted, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
                Once you win or lose your first job, your close rate, funnel, and lead source breakdown will appear here.
              </div>
              <Link href="/dashboard/pipeline" style={{ display: 'inline-block', marginTop: 20, padding: '10px 22px', borderRadius: 10, background: '#0F766E', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                Go to Pipeline →
              </Link>
            </div>
          ) : (
            <>
              {/* ── KPI Cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
                <div style={card}>
                  <div style={cardLabel}>Win rate · all time</div>
                  <div style={cardValue}>{data.winRate == null ? '—' : `${data.winRate}%`}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{data.wonAll} won · {data.lostAll} lost</div>
                  {data.winRate != null && (
                    <div style={{ fontSize: 11, marginTop: 6, color: data.winRate >= INDUSTRY_CLOSE ? '#059669' : '#EA580C', fontWeight: 600 }}>
                      {data.winRate >= INDUSTRY_CLOSE ? '▲' : '▼'} Industry avg {INDUSTRY_CLOSE}%
                    </div>
                  )}
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
                  {data.avgCycle != null && (
                    <div style={{ fontSize: 11, marginTop: 6, color: data.avgCycle <= 14 ? '#059669' : '#EA580C', fontWeight: 600 }}>
                      {data.avgCycle <= 14 ? '▲ Fast close' : '▼ Industry ~14 d'}
                    </div>
                  )}
                </div>
                <div style={card}>
                  <div style={cardLabel}>Total leads</div>
                  <div style={cardValue}>{data.totalLeads}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>all time · {data.wonAll + data.lostAll} decided</div>
                </div>
              </div>

              {/* ── Stale proposals banner ── */}
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

              {/* ── Tapered Conversion Funnel ── */}
              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 2 }}>Conversion funnel</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 18 }}>Each stage is sized by how many leads reach it. The highlighted gap is where you lose the most.</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                  {data.funnel.map((f, i) => {
                    const isBiggest = i === data.biggestDropIndex
                    const rawWidth = funnelMax > 0 ? (f.count / funnelMax) * 100 : 100
                    const barWidth = Math.max(rawWidth, f.count > 0 ? 8 : 0)
                    const barColor = isBiggest ? '#EA580C' : '#0F766E'
                    const showDropGap = i > 0 && f.drop != null

                    return (
                      <div key={f.stage} style={{ width: '100%' }}>
                        {/* Drop gap between stages */}
                        {showDropGap && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 22, marginBottom: 2 }}>
                            <div style={{ height: isBiggest ? 20 : 14, width: 2, background: isBiggest ? '#EA580C' : (dk ? '#334155' : '#CBD5E1'), borderRadius: 1, marginRight: 6 }} />
                            <span style={{
                              fontSize: 11,
                              fontWeight: isBiggest ? 800 : 600,
                              color: isBiggest ? '#EA580C' : t.textSubtle,
                              background: isBiggest ? (dk ? 'rgba(234,88,12,0.15)' : '#FFF7ED') : 'transparent',
                              border: isBiggest ? `1px solid ${dk ? '#7C2D12' : '#FED7AA'}` : 'none',
                              borderRadius: 6,
                              padding: isBiggest ? '1px 7px' : 0,
                            }}>
                              {isBiggest ? `↓ ${f.drop}% · biggest drop` : `↓ ${f.drop}%`}
                            </span>
                          </div>
                        )}

                        {/* Bar row */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                          {/* Stage label above */}
                          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: isBiggest ? 700 : 600, color: isBiggest ? '#EA580C' : t.textPri }}>
                              {f.stage}
                            </span>
                            <span style={{ fontSize: 12, color: t.textMuted }}>
                              <span style={{ fontWeight: 700, color: t.textPri }}>{f.count}</span>
                              {' '}leads · <span style={{ fontWeight: 600, color: i === 0 ? t.textMuted : (f.conversion >= 50 ? '#059669' : t.textMuted) }}>{f.conversion}%</span>
                            </span>
                          </div>
                          {/* Tapered bar — centered, shrinks as funnel narrows */}
                          <div style={{ width: `${barWidth}%`, height: 28, borderRadius: 8, background: barColor, transition: 'width 0.5s ease', boxShadow: isBiggest ? `0 0 0 2px ${dk ? '#7C2D12' : '#FED7AA'}` : undefined }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Industry benchmark note */}
                <div style={{ marginTop: 18, padding: '10px 14px', borderRadius: 10, background: dk ? 'rgba(15,118,110,0.1)' : '#F0FDF9', border: `1px solid ${dk ? '#134E4A' : '#A7F3D0'}`, fontSize: 12, color: t.textMuted }}>
                  <span style={{ fontWeight: 700, color: t.textPri }}>Industry benchmark:</span> Roofing contractors typically close <strong style={{ color: '#0F766E' }}>{INDUSTRY_CLOSE}–35%</strong> of leads. Your overall rate: <strong style={{ color: data.winRate != null && data.winRate >= INDUSTRY_CLOSE ? '#059669' : '#EA580C' }}>{data.winRate ?? '—'}%</strong>
                </div>
              </div>

              {/* ── Lead Sources ── */}
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 4 }}>Lead sources</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Which sources actually win work — put more into the ones that pay.</div>
                {data.bySource.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 13 }}>No leads yet.</div>
                ) : (
                  <div>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <div style={{ minWidth: 320 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 70px 70px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle, padding: '6px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                      <div>Source</div>
                      <div style={{ textAlign: 'right' }}>Leads</div>
                      <div style={{ textAlign: 'right' }}>Win%</div>
                      <div style={{ textAlign: 'right' }}>Revenue</div>
                      <div style={{ textAlign: 'right' }}>$/Lead</div>
                    </div>
                    {data.bySource.map(s => (
                      <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 70px 70px', fontSize: 13, color: t.textPri, padding: '10px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                        <div style={{ fontWeight: 600, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.source}</div>
                        <div style={{ textAlign: 'right' }}>{s.leads}</div>
                        <div style={{ textAlign: 'right', color: s.winRate >= 50 ? '#059669' : t.textMuted }}>{s.winRate}%</div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(s.revenue)}</div>
                        <div style={{ textAlign: 'right', color: t.textMuted }}>{s.perLead > 0 ? fmt(s.perLead) : '—'}</div>
                      </div>
                    ))}
                    </div></div>
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
