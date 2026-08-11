import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors, getTradeConfig } from '@/lib/trades/_registry'

// ── /api/trade-config ─────────────────────────────────────────────────────────
// Canonical trade configuration: the stage STRUCTURE (keys, order, terminal,
// anchors) that every surface and both clients key off. This is the single
// source for "what stages exist and in what order" — mobile consumes it instead
// of hardcoding kRoofingStages, so structural changes propagate automatically.
//
// Display is intentionally NOT forced here: web (icons/subLabels) and mobile
// (short rail labels) keep their own presentation layer keyed by stage key.
// We return a canonical label + color as sensible defaults/fallbacks only.
//
// Accepts ?pro_id= (resolves the pro's trade) or ?trade= directly.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const proId = url.searchParams.get('pro_id')
  let tradeSlug = url.searchParams.get('trade')

  if (!tradeSlug && proId) {
    const sb = getSupabaseAdmin()
    const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).single()
    tradeSlug = proRow?.trade_slug ?? null
  }

  const tc      = getTradeConfig(tradeSlug)
  const anchors = getStageAnchors(tradeSlug)

  const stages = tc.stages.map((s: any, i: number) => ({
    key:      s.key,
    label:    s.label,          // canonical/default label; clients may override for display
    order:    i,
    terminal: !!s.terminal,
    isEntry:  s.key === anchors.entry,
    isWon:    s.key === anchors.won,
    color:    s.color ?? null,
    bg:       s.bg ?? null,
  }))

  return NextResponse.json({
    trade: tradeSlug ?? 'default',
    anchors: {
      entry: anchors.entry,
      won:   anchors.won,
    },
    terminalKeys: stages.filter(s => s.terminal).map(s => s.key),
    stages,
  })
}
