import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors, getTradeConfig } from '@/lib/trades/_registry'
import { wonInMonth, sumRevenue } from '@/lib/metrics/won'

// ── /api/overview ────────────────────────────────────────────────────────────
// Single source of truth for the dashboard Overview / mobile Home block.
// Web (dashboard/page.tsx) and mobile (home_screen.dart) BOTH consume this so the
// two surfaces can't disagree — no client recomputes any of these numbers.
// Metric math lives in lib/metrics/won.ts; stage config in the trade registry.

const DAY = 86400000

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Resolve the pro's trade so stage anchors/config come from the canonical
  // registry (never hardcoded here) — same pattern as the stage/invoice routes.
  const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).single()
  const anchors = getStageAnchors(proRow?.trade_slug)
  const tc      = getTradeConfig(proRow?.trade_slug)
  const terminalKeys = tc.stages.filter(s => s.terminal).map(s => s.key)

  const [leadsRes, estRes] = await Promise.all([
    sb.from('leads')
      .select('id, lead_status, created_at, lead_status_changed_at, updated_at, quoted_amount, scheduled_date, roofing_job_data(approved_amount)')
      .eq('pro_id', proId),
    sb.from('estimates')
      .select('status, valid_until, sent_at, created_at')
      .eq('pro_id', proId),
  ])
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  const leads = leadsRes.data || []
  const estimates = estRes.data || []
  const now = Date.now()
  const today = new Date().toISOString().split('T')[0]

  // ── Action Center (urgency signals) ───────────────────────────────────────
  const newLeads    = leads.filter(l => l.lead_status === anchors.entry)
  const uncontacted = newLeads.filter(l => (now - new Date(l.created_at as string).getTime()) / DAY >= 1)
  const expiring    = estimates.filter(e => {
    if (!e.valid_until || !['sent', 'viewed'].includes(e.status as string)) return false
    const daysLeft = (new Date(e.valid_until as string).getTime() - now) / DAY
    return daysLeft >= 0 && daysLeft <= 3
  })
  const awaitingSig = estimates.filter(e => {
    if (!['sent', 'viewed'].includes(e.status as string)) return false
    const sentAt = (e.sent_at || e.created_at) as string
    return (now - new Date(sentAt).getTime()) / DAY >= 2
  })
  const jobsToday = leads.filter(l => (l.scheduled_date as string | null)?.startsWith(today))
  const drafts    = estimates.filter(e => e.status === 'draft')

  // ── Stat strip (this-month, keyed off the real won date via won.ts) ────────
  const wonThisMonth    = wonInMonth(leads as never[], anchors.won, 0)
  const wonRevenue      = sumRevenue(wonThisMonth as never[])
  const wonLastMonth    = wonInMonth(leads as never[], anchors.won, 1)
  const wonRevenueLast  = sumRevenue(wonLastMonth as never[])
  // NOTE: 'lost' literal matches OverviewWidget today; revisit if multi-trade.
  const lostThisMonth   = wonInMonth(leads as never[], 'lost', 0).length
  const decided         = wonThisMonth.length + lostThisMonth
  const winRate         = decided > 0 ? Math.round((wonThisMonth.length / decided) * 100) : null
  const avgTicket       = wonThisMonth.length > 0 ? wonRevenue / wonThisMonth.length : 0
  const allWon          = leads.filter(l => l.lead_status === anchors.won)
  const totalWonRevenue = sumRevenue(allWon as never[])
  // estimatedValue: quoted_amount on canonical open leads (not terminal, not won,
  // not 'Paid'). Matches pipeline/summary route exactly so both screens agree.
  const closedForPipeline = new Set([...terminalKeys, anchors.won, 'Paid'])
  const openLeads = leads.filter(l => !closedForPipeline.has(l.lead_status as string))
  const pipelineValue = Math.round(
    openLeads.reduce((s, l) => s + ((l.quoted_amount as number) || 0), 0) * 100) / 100
  const revenueDeltaPct = wonRevenueLast > 0
    ? Math.round(((wonRevenue - wonRevenueLast) / wonRevenueLast) * 100) : null

  // ── Open pipeline by stage (money in deals not yet won) ────────────────────
  // Open = non-terminal, excluding entry and won — derived from config, not
  // hardcoded. (Adds inspection_scheduled vs the old curated web list.)
  const openStages = tc.stages.filter(
    s => !s.terminal && s.key !== anchors.entry && s.key !== anchors.won)
  const openPipelineByStage = openStages.map(s => {
    const inStage = leads.filter(l => l.lead_status === s.key)
    return {
      key: s.key, label: s.label,
      count: inStage.length,
      amount: inStage.reduce((sum, l) => sum + ((l.quoted_amount as number) || 0), 0),
    }
  }).filter(s => s.count > 0)

  // ── Smart sub-line ("2 homeowners waiting · $X at risk") ───────────────────
  const atRisk = uncontacted.reduce((sum, l) => sum + ((l.quoted_amount as number) || 0), 0)
  const parts: string[] = []
  if (uncontacted.length > 0) parts.push(`${uncontacted.length} homeowner${uncontacted.length !== 1 ? 's' : ''} waiting`)
  if (drafts.length > 0)      parts.push(`${drafts.length} estimate${drafts.length !== 1 ? 's' : ''} unsent`)
  if (atRisk > 0)             parts.push(`$${Math.round(atRisk).toLocaleString()} at risk`)

  return NextResponse.json({
    actionCenter: {
      uncontacted: uncontacted.length,
      expiring: expiring.length,
      awaitingSignature: awaitingSig.length,
      jobsToday: jobsToday.length,
      drafts: drafts.length,
    },
    stats: {
      revenueThisMonth: wonRevenue,
      revenueDeltaPct,
      jobsWonThisMonth: wonThisMonth.length,
      totalWonRevenue,
      totalWonJobs: allWon.length,
      winRate,
      decidedThisMonth: decided,
      avgTicket,
      pipelineValue,
    },
    openPipelineByStage,
    subLine: parts.join(' · '),
  })
}
