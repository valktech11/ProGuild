import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors, getTerminalStages } from '@/lib/trades/_registry'
import { wonInMonth } from '@/lib/metrics/won'

// ── /api/pipeline/summary ─────────────────────────────────────────────────────
// Global command-bar aggregates for the Pipeline page. "Active" = open deals
// only — terminal stages (Lost) + won + Paid excluded. Matches the KPI card
// formula in LeadPipeline.tsx exactly so command bar and cards agree.
// KPI cards compute locally over filteredLeads (filter-reactive); this endpoint
// is filter-unaware and always returns the full-book global snapshot.

const DAY = 86400000

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).single()
  const tradeSlug = proRow?.trade_slug ?? null
  const anchors   = getStageAnchors(tradeSlug)

  // Exclusion set mirrors LeadPipeline.tsx kpiTermKeys exactly:
  // terminal stages (e.g. Lost) + won anchor + legacy 'Paid' key
  const closedKeys = new Set([
    ...getTerminalStages(tradeSlug).map(s => s.key),
    anchors.won,
    'Paid',
  ])

  const { data, error } = await sb
    .from('leads')
    .select('lead_status, created_at, lead_status_changed_at, quoted_amount')
    .eq('pro_id', proId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads      = data || []
  const now        = Date.now()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()

  const entryLeads  = leads.filter(l => l.lead_status === anchors.entry)
  const openLeads   = leads.filter(l => !closedKeys.has(l.lead_status as string))

  // overdue = entry leads stale in current stage >= 3 days
  // uses lead_status_changed_at (time in stage) not created_at (total age)
  const overdueCount = entryLeads.filter(l => {
    const changed = l.lead_status_changed_at ?? l.created_at
    return (now - new Date(changed as string).getTime()) / DAY >= 3
  }).length

  return NextResponse.json({
    // command bar
    newCount:      entryLeads.length,
    activeCount:   openLeads.length,
    pipelineValue: openLeads.reduce((s, l) => s + ((l.quoted_amount as number) || 0), 0),
    overdueCount,
    wonThisMonth:  wonInMonth(leads as never[], anchors.won, 0).length,
    // for mobile pipeline screen (cards compute locally on web)
    newThisMonth:  leads.filter(l => new Date(l.created_at as string).getTime() >= monthStart).length,
  })
}
