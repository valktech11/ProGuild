import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { wonInMonth, leadRevenue } from '@/lib/metrics/won'

// Ordered roofing funnel stages (matches lib/trades/roofing/config.ts).
const FUNNEL = [
  { key: 'lead_in', label: 'Lead In' },
  { key: 'inspection_scheduled', label: 'Inspection Scheduled' },
  { key: 'insurance_approved', label: 'Insurance Approved' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'proposal_signed', label: 'Proposal Signed' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'job_won', label: 'Job Won' },
]
const pretty = (s: string) => s.replace(/_/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const [leadsRes, eventsRes] = await Promise.all([
    sb.from('leads')
      .select('id, lead_status, lead_source, created_at, lead_status_changed_at, updated_at, quoted_amount, roofing_job_data(approved_amount)')
      .eq('pro_id', proId),
    sb.from('pipeline_events')
      .select('lead_id, event_data')
      .eq('pro_id', proId)
      .eq('event_type', 'stage_changed'),
  ])
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  const leads = leadsRes.data || []
  const events = eventsRes.data || []

  // ── Win rate (all-time + this month) ──────────────────────────────────────
  const wonAll = leads.filter(l => l.lead_status === 'job_won')
  const lostAll = leads.filter(l => l.lead_status === 'lost')
  const decided = wonAll.length + lostAll.length
  const winRate = decided ? Math.round((wonAll.length / decided) * 100) : null
  const wonMo = wonInMonth(leads as never[], 'job_won', 0).length
  const lostMo = wonInMonth(leads as never[], 'lost', 0).length
  const winRateMo = (wonMo + lostMo) ? Math.round((wonMo / (wonMo + lostMo)) * 100) : null

  // ── Avg sales cycle (created -> won), days ────────────────────────────────
  const cycles = wonAll
    .map(l => (new Date((l.lead_status_changed_at || l.updated_at || l.created_at) as string).getTime() - new Date(l.created_at as string).getTime()) / 86400000)
    .filter(d => d >= 0)
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null

  // ── Conversion funnel (how far leads get; from event history + current) ────
  const reachedByLead = new Map<string, Set<string>>()
  for (const e of events) {
    const to = (e.event_data as { to?: string } | null)?.to
    if (!to) continue
    const set = reachedByLead.get(e.lead_id) || new Set<string>()
    set.add(to); reachedByLead.set(e.lead_id, set)
  }
  const idxOf = (k: string) => FUNNEL.findIndex(s => s.key === k)
  const funnelCounts = new Array(FUNNEL.length).fill(0)
  for (const l of leads) {
    const reached = reachedByLead.get(l.id) || new Set<string>()
    reached.add(l.lead_status as string)
    let maxIdx = 0 // every lead starts at Lead In
    for (const k of reached) { const i = idxOf(k); if (i > maxIdx) maxIdx = i }
    for (let i = 0; i <= maxIdx; i++) funnelCounts[i]++
  }
  const base = funnelCounts[0] || 0
  const funnel = FUNNEL.map((s, i) => ({
    stage: s.label,
    count: funnelCounts[i],
    conversion: i === 0 ? 100 : base ? Math.round((funnelCounts[i] / base) * 100) : 0,
  }))

  // ── Lead-source effectiveness ─────────────────────────────────────────────
  const srcMap = new Map<string, { leads: number; won: number; revenue: number }>()
  for (const l of leads) {
    const k = (l.lead_source || 'unknown') as string
    const e = srcMap.get(k) || { leads: 0, won: 0, revenue: 0 }
    e.leads += 1
    if (l.lead_status === 'job_won') { e.won += 1; e.revenue += leadRevenue(l as never) }
    srcMap.set(k, e)
  }
  const bySource = [...srcMap.entries()]
    .map(([source, v]) => ({ source: pretty(source), leads: v.leads, won: v.won, winRate: v.leads ? Math.round((v.won / v.leads) * 100) : 0, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)

  return NextResponse.json({
    winRate, winRateMo, wonAll: wonAll.length, lostAll: lostAll.length,
    avgCycle, funnel, bySource, totalLeads: leads.length,
  })
}
