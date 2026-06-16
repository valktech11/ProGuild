'use client'
// ── Roofing OverviewWidget ────────────────────────────────────────────────────
// Renders two roofing-specific sections on the /dashboard overview page:
//   1. Today's Schedule — time-sorted list of today's inspections/jobs
//   2. Revenue Forecast — pipeline funnel in dollar terms
//
// Props are passed by app/dashboard/page.tsx via plugin.components.OverviewWidget
// Shell page never knows this is roofing — it just renders whatever the slot provides.

import { useRouter } from 'next/navigation'
import { theme, T, BRAND } from '@/lib/tokens'
import type { OverviewWidgetProps } from '@/lib/trades/_registry/types'

const TEAL = '#0F766E'

function fmtCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n.toLocaleString()}`
}

function fmtTime(timeStr: string | null | undefined): string {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function stageLabel(status: string): string {
  const map: Record<string, string> = {
    lead_in:               'New Lead',
    inspection_scheduled:  'Inspection',
    proposal_sent:         'Estimate',
    proposal_signed:       'Proposal Signed',
    insurance_approved:    'Insurance Job',
    scheduled:             'Scheduled',
    in_progress:           'In Progress',
    job_won:               'Job Won',
  }
  return map[status] || status
}

function stageColor(status: string): string {
  const map: Record<string, string> = {
    inspection_scheduled: '#0284C7',
    scheduled:            '#2563EB',
    in_progress:          '#EA580C',
    proposal_signed:      '#059669',
    insurance_approved:   '#0891B2',
  }
  return map[status] || TEAL
}

export default function RoofingOverviewWidget({ leads, session, dk, overview }: OverviewWidgetProps) {
  const router = useRouter()
  const t = theme(dk)

  const today = new Date().toISOString().split('T')[0]

  // ── Today's Schedule ─────────────────────────────────────────────────────
  // A lead is "on today's schedule" if either its job is scheduled for today
  // (scheduled_date) OR an inspection is booked for today (inspection_date).
  const todayLeads = leads
    .filter(l =>
      l.scheduled_date?.startsWith(today) ||
      l.inspection_date?.startsWith(today)
    )
    .sort((a, b) => {
      if (!a.scheduled_time) return 1
      if (!b.scheduled_time) return -1
      return a.scheduled_time.localeCompare(b.scheduled_time)
    })

  // ── Scorecard + Revenue Forecast — all from /api/overview (single source) ──
  // No client-side metric math: web and mobile read the same computed block, so
  // they can't drift. Stage/threshold logic lives in the endpoint + won.ts only.
  const stats = overview?.stats ?? {}
  const openStages: any[] = overview?.openPipelineByStage ?? []
  const openPipeline = openStages.reduce((sum: number, s: any) => sum + (s.amount || 0), 0)

  const wonMo        = stats.jobsWonThisMonth ?? 0
  const decided      = stats.decidedThisMonth ?? 0
  const winRate      = stats.winRate ?? null
  const avgTicket    = stats.avgTicket ?? 0
  const revDelta     = stats.revenueDeltaPct ?? null
  const totalWonJobs = stats.totalWonJobs ?? 0

  const scorecard = [
    { label: 'Revenue · this month', value: fmtCurrency(stats.revenueThisMonth ?? 0),
      sub: revDelta == null ? `${wonMo} won` : `${revDelta >= 0 ? '▲' : '▼'} ${Math.abs(revDelta)}% vs last mo`,
      subColor: revDelta == null ? '#94A3B8' : revDelta >= 0 ? '#059669' : '#DC2626', accent: '#0F766E',
      sub2: `Total won: ${fmtCurrency(stats.totalWonRevenue ?? 0)} · ${totalWonJobs} job${totalWonJobs!==1?'s':''}` },
    { label: 'Jobs won', value: String(wonMo), sub: 'this month', subColor: '#94A3B8', accent: '#2563EB' },
    { label: 'Win rate', value: winRate == null ? '—' : `${winRate}%`,
      sub: decided > 0 ? `${wonMo}/${decided} decided` : 'no closes yet', subColor: '#94A3B8', accent: '#059669' },
    { label: 'Avg ticket', value: avgTicket > 0 ? fmtCurrency(Math.round(avgTicket)) : '—', sub: 'per won job', subColor: '#94A3B8', accent: '#D97706' },
    { label: 'Estimated value', value: fmtCurrency(stats.pipelineValue ?? 0), sub: 'in open estimates', subColor: '#94A3B8', accent: '#0891B2' },
  ]

  const card = t.cardBg
  const bdr  = t.cardBorder

  return (
    <>
      {/* ── Performance scorecard ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {scorecard.map(c => (
          <div key={c.label} style={{ backgroundColor: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c.accent }} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' as const, color: t.textSubtle }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: t.textPri, marginTop: 6, letterSpacing: '-0.02em' }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.subColor, marginTop: 3 }}>{c.sub}</div>
            {(c as any).sub2 && <div style={{ fontSize: 13, fontWeight: 700, color: t.textPri, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${bdr}` }}>{(c as any).sub2}</div>}
          </div>
        ))}
      </div>

      {/* ── Today's Schedule ───────────────────────────────────────────────── */}
      <div className="rounded-2xl mb-5" style={{
        backgroundColor: card, border: `1px solid ${bdr}`,
        boxShadow: '0 2px 12px rgba(10,22,40,0.05)',
      }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${bdr}` }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#0F766E22,#14B8A622)', border: '1px solid rgba(15,118,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                <polyline points="9 16 11 18 15 14"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.textPri, letterSpacing: '-0.01em' }}>Today&apos;s Schedule</div>
              <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 1 }}>
                {todayLeads.length === 0
                  ? 'Nothing scheduled today'
                  : `${todayLeads.length} job${todayLeads.length !== 1 ? 's' : ''} on your calendar`}
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/calendar')}
            style={{ fontSize: 12, fontWeight: 700, color: TEAL, background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            View Calendar
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>

        {todayLeads.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' as const }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#F0FDFA,#CCFBF1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri, marginBottom: 4 }}>Free day ahead</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Nothing scheduled today — a good time to follow up on leads.</div>
            <button
              onClick={() => router.push('/dashboard/pipeline')}
              style={{ fontSize: 12, fontWeight: 700, color: TEAL, background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
              View pipeline →
            </button>
          </div>
        ) : (
          <div>
            {todayLeads.map((lead: any, i: number) => {
              const color = stageColor(lead.lead_status)
              return (
                <button
                  key={lead.id}
                  onClick={() => router.push(`/dashboard/pipeline/${lead.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 20px', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderTop: i > 0 ? `1px solid ${bdr}` : 'none',
                  }}>
                  {/* Time */}
                  <div style={{ width: 56, flexShrink: 0, textAlign: 'right' }}>
                    {lead.scheduled_time ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{fmtTime(lead.scheduled_time)}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: t.textMuted }}>All day</span>
                    )}
                  </div>

                  {/* Color bar */}
                  <div style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />

                  {/* Lead info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.contact_name}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.property_address || lead.contact_city || '—'}
                    </div>
                  </div>

                  {/* Stage badge */}
                  <div style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    backgroundColor: `${color}18`, color, flexShrink: 0,
                  }}>
                    {stageLabel(lead.lead_status)}
                  </div>

                  {/* Arrow */}
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth={2.5} strokeLinecap="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Open pipeline by stage ───────────────────────────────────────────── */}
      {openStages.length > 0 && (
        <div className="rounded-2xl mb-5" style={{ backgroundColor: card, border: `1px solid ${bdr}` }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${bdr}` }}>
            <div className="flex items-center gap-2">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15,118,110,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💰</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>Open pipeline by stage</div>
                <div style={{ fontSize: 12, color: t.textSubtle }}>Money in deals you haven&apos;t won yet</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openStages.map((stage: any) => (
              <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 160, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.textPri }}>{stage.label}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{stage.count} lead{stage.count !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: dk ? '#1E293B' : '#F1F5F9', overflow: 'hidden' }}>
                  {openPipeline > 0 && (
                    <div style={{
                      height: '100%',
                      borderRadius: 4,
                      backgroundColor: stageColor(stage.key),
                      width: `${Math.max((stage.amount / openPipeline) * 100, 2)}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  )}
                </div>
                <div style={{ width: 70, textAlign: 'right', fontSize: 14, fontWeight: 700, color: stageColor(stage.key), flexShrink: 0 }}>
                  {fmtCurrency(stage.amount)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '0 20px 16px' }}>
            <button
              onClick={() => router.push('/dashboard/pipeline')}
              style={{ fontSize: 12, fontWeight: 700, color: TEAL, background: 'none', border: 'none', cursor: 'pointer' }}>
              View full pipeline →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
