import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors, getTradeConfig } from '@/lib/trades/_registry'
import { wonInMonth } from '@/lib/metrics/won'

// ── /api/pipeline/summary ─────────────────────────────────────────────────────
// Header aggregates for the Pipeline (Jobs) board, computed server-side so web
// and mobile show identical numbers. The board itself (grouping leads into stage
// columns, user filters) stays client-side — that's deterministic presentation
// over the shared /api/leads, not a drift-prone metric.
//
// Mirrors the formulas the dashboard pipeline page used inline.

const DAY = 86400000

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).single()
  const anchors = getStageAnchors(proRow?.trade_slug)
  const tc      = getTradeConfig(proRow?.trade_slug)
  const terminalKeys = tc.stages.filter(s => s.terminal).map(s => s.key)

  const { data, error } = await sb.from('leads')
    .select('lead_status, created_at, lead_status_changed_at, updated_at, quoted_amount')
    .eq('pro_id', proId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads = data || []
  const now = Date.now()

  const newLeads     = leads.filter(l => l.lead_status === anchors.entry)
  const activeLeads  = leads.filter(l => !terminalKeys.some(k => k === l.lead_status))
  const overdue      = newLeads.filter(l =>
    (now - new Date(l.created_at as string).getTime()) / DAY >= 3)

  return NextResponse.json({
    newCount:      newLeads.length,
    activeCount:   activeLeads.length,
    pipelineValue: activeLeads.reduce((s, l) => s + ((l.quoted_amount as number) || 0), 0),
    overdueCount:  overdue.length,
    wonThisMonth:  wonInMonth(leads as never[], anchors.won, 0).length,
  })
}
