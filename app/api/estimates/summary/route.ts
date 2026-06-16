import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── /api/estimates/summary ────────────────────────────────────────────────────
// Single source of truth for estimate aggregates. Web (estimates/page.tsx) and
// mobile both read from here so the KPI numbers can never disagree.
//
// Returns:
//   totalEstimates  — all estimates for the pro
//   sentCount       — status in {sent, viewed}  ("Sent / In Review")
//   activeValue     — Σ best-estimate-per-lead .total over active statuses
//   draftCount      — status === 'draft'
//   archivedCount   — status in {void, declined}
//
// activeValue dedup: a lead can have multiple estimates; count only the most
// progressed one per lead so re-issued/revised estimates don't double-count.

const ACTIVE_STATUSES = ['sent', 'viewed', 'approved', 'invoiced']
const ARCHIVED_STATUSES = ['void', 'declined']
// Lower number = more progressed = the one that represents the lead's value.
const STATUS_PRIORITY: Record<string, number> = { invoiced: 1, approved: 2, viewed: 3, sent: 4 }

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('estimates')
    .select('id, lead_id, status, total')
    .eq('pro_id', proId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const estimates = data || []

  const totalEstimates = estimates.length
  const sentCount      = estimates.filter(e => e.status === 'sent' || e.status === 'viewed').length
  const draftCount     = estimates.filter(e => e.status === 'draft').length
  const archivedCount  = estimates.filter(e => ARCHIVED_STATUSES.includes(e.status as string)).length

  // Best estimate per lead across active statuses, then sum its total.
  const bestPerLead = Object.values(
    estimates
      .filter(e => ACTIVE_STATUSES.includes(e.status as string))
      .reduce((acc: Record<string, typeof estimates[number]>, e) => {
        const key = (e.lead_id as string) || (e.id as string)
        const existing = acc[key]
        const rank = STATUS_PRIORITY[e.status as string] ?? 99
        const existingRank = existing ? (STATUS_PRIORITY[existing.status as string] ?? 99) : 99
        if (!existing || rank < existingRank) acc[key] = e
        return acc
      }, {})
  )
  const activeValue = Math.round(
    bestPerLead.reduce((s, e) => s + ((e.total as number) || 0), 0) * 100) / 100

  return NextResponse.json({
    totalEstimates,
    sentCount,
    activeValue,
    draftCount,
    archivedCount,
  })
}
