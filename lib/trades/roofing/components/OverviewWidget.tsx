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

export default function RoofingOverviewWidget({ leads, session, dk }: OverviewWidgetProps) {
  const router = useRouter()
  const t = theme(dk)

  const today = new Date().toISOString().split('T')[0]

  // ── Today's Schedule ─────────────────────────────────────────────────────
  const todayLeads = leads
    .filter(l => l.scheduled_date?.startsWith(today))
    .sort((a, b) => {
      if (!a.scheduled_time) return 1
      if (!b.scheduled_time) return -1
      return a.scheduled_time.localeCompare(b.scheduled_time)
    })

  // ── Revenue Forecast ──────────────────────────────────────────────────────
  // Dollar amounts per roofing stage — shows where money is in the funnel
  const forecastStages = [
    { key: 'proposal_sent',       label: 'Proposals Sent',   color: '#D97706', bg: '#FEF3C7' },
    { key: 'proposal_signed',     label: 'Proposals Signed', color: '#059669', bg: '#D1FAE5' },
    { key: 'insurance_approved',  label: 'Insurance Approved', color: '#0891B2', bg: '#CFFAFE' },
    { key: 'scheduled',           label: 'Scheduled',        color: '#2563EB', bg: '#DBEAFE' },
    { key: 'in_progress',         label: 'In Progress',      color: '#EA580C', bg: '#FFEDD5' },
  ]

  const forecastData = forecastStages.map(stage => ({
    ...stage,
    count:  leads.filter(l => l.lead_status === stage.key).length,
    amount: leads
      .filter(l => l.lead_status === stage.key)
      .reduce((sum, l) => sum + (l.quoted_amount || 0), 0),
  })).filter(s => s.count > 0)

  const wonThisMonth = leads.filter(l => {
    if (l.lead_status !== 'job_won') return false
    const updated = new Date(l.updated_at)
    const now = new Date()
    return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear()
  })
  const wonRevenue = wonThisMonth.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const totalForecast = forecastData.reduce((sum, s) => sum + s.amount, 0) + wonRevenue

  const card = t.cardBg
  const bdr  = t.cardBorder

  return (
    <>
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
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>No jobs scheduled today — a good time to follow up on leads.</div>
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

      {/* ── Revenue Forecast ─────────────────────────────────────────────────── */}
      {(forecastData.length > 0 || wonRevenue > 0) && (
        <div className="rounded-2xl mb-5" style={{ backgroundColor: card, border: `1px solid ${bdr}` }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${bdr}` }}>
            <div className="flex items-center gap-2">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15,118,110,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💰</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>Revenue Forecast</div>
                <div style={{ fontSize: 12, color: t.textSubtle }}>Where your money is in the pipeline</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 2 }}>Expected total</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEAL }}>{fmtCurrency(totalForecast)}</div>
            </div>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {forecastData.map(stage => (
              <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Stage label + count */}
                <div style={{ width: 160, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.textPri }}>{stage.label}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{stage.count} lead{stage.count !== 1 ? 's' : ''}</div>
                </div>

                {/* Bar */}
                <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: dk ? '#1E293B' : '#F1F5F9', overflow: 'hidden' }}>
                  {totalForecast > 0 && (
                    <div style={{
                      height: '100%',
                      borderRadius: 4,
                      backgroundColor: stage.color,
                      width: `${Math.max((stage.amount / totalForecast) * 100, 2)}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  )}
                </div>

                {/* Amount */}
                <div style={{ width: 70, textAlign: 'right', fontSize: 14, fontWeight: 700, color: stage.color, flexShrink: 0 }}>
                  {fmtCurrency(stage.amount)}
                </div>
              </div>
            ))}

            {/* Won this month */}
            {wonRevenue > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: `1px solid ${bdr}` }}>
                <div style={{ width: 160, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>✅ Won This Month</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{wonThisMonth.length} job{wonThisMonth.length !== 1 ? 's' : ''} completed</div>
                </div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: dk ? '#1E293B' : '#F1F5F9', overflow: 'hidden' }}>
                  {totalForecast > 0 && (
                    <div style={{ height: '100%', borderRadius: 4, backgroundColor: '#059669', width: `${Math.max((wonRevenue / totalForecast) * 100, 2)}%` }} />
                  )}
                </div>
                <div style={{ width: 70, textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#059669', flexShrink: 0 }}>
                  {fmtCurrency(wonRevenue)}
                </div>
              </div>
            )}
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
