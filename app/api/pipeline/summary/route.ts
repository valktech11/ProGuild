import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'
import { wonInMonth, closedPipelineKeys } from '@/lib/metrics/won'
import { daysInStage, isStalled } from '@/lib/metrics/sla'

// ── /api/pipeline/summary ─────────────────────────────────────────────────────
// Two jobs:
//   1. Command-bar globals: newCount, activeCount, pipelineValue, wonThisMonth
//   2. Four action cards (clickable filters on the board):
//      - needsContact      : entry leads >24h with no contact
//      - awaitingSignature : estimates sent/viewed 48h+ unsigned
//      - insuranceFollowUp : leads in insurance_approved >14 days (FL wedge)
//      - stalledLeads      : leads exceeding stage-specific SLA (not flat >3d)
//
// Stage-specific SLAs (Stalled card):
//   lead_in              >1 day
//   inspection_scheduled >3 days
//   insurance_approved   >14 days  (carrier cycles are long in FL)
//   proposal_sent        >7 days
//   proposal_signed      >14 days  (unscheduled)
//   scheduled            >7 days
//   in_progress          >7 days

const DAY = 86400000

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).single()
  const tradeSlug = proRow?.trade_slug ?? null
  const anchors   = getStageAnchors(tradeSlug)

  const closedKeys = closedPipelineKeys(tradeSlug, anchors.won)

  // Fetch leads + estimates in parallel
  const [leadsRes, estRes] = await Promise.all([
    sb.from('leads')
      .select('id, lead_status, created_at, lead_status_changed_at, quoted_amount, roofing_job_data(approved_amount)')
      .eq('pro_id', proId),
    sb.from('estimates')
      .select('status, sent_at, valid_until')
      .eq('pro_id', proId),
  ])

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  const leads     = leadsRes.data || []
  const estimates = estRes.data   || []
  const now       = Date.now()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()

  const entryLeads = leads.filter(l => l.lead_status === anchors.entry)
  const openLeads  = leads.filter(l => !closedKeys.has(l.lead_status as string))

  // ── Action card 1: Needs Contact ──────────────────────────────────────────
  // Entry leads where time in stage > 24h (no contact = still in lead_in)
  const needsContact = entryLeads.filter(l => daysInStage(l, now) >= 1).length

  // ── Action card 2: Awaiting Signature ────────────────────────────────────
  // Estimates in sent/viewed state, sent 48h+ ago, not yet approved
  const awaitingSignature = estimates.filter(e => {
    if (!['sent', 'viewed'].includes(e.status as string)) return false
    if (!e.sent_at) return false
    return (now - new Date(e.sent_at as string).getTime()) / DAY >= 2
  }).length

  // ── Action card 3: Insurance Follow-Up (FL wedge) ────────────────────────
  // Leads stuck in insurance_approved > 14 days — carrier cycle overdue
  const insuranceFollowUp = leads.filter(l =>
    l.lead_status === 'insurance_approved' && daysInStage(l, now) >= 14
  ).length

  // ── Action card 4: Stalled Leads ─────────────────────────────────────────
  // Open leads past their stage-specific SLA. Each lead lives in exactly one
  // card, so Stalled excludes the entry stage (Needs Contact) and
  // insurance_approved (Insurance Follow-Up) — see lib/metrics/sla.ts.
  const stalledOpen  = openLeads.filter(l => isStalled(l, anchors.entry, now))
  const stalledLeads = stalledOpen.length
  // The exact leads behind the count — so the page renders the alert from this
  // server-defined set instead of recomputing its own "overdue" rule.
  const stalledList  = stalledOpen.map(l => (l as any).id)

  // approvedValue: sum of carrier-approved amounts on open insurance leads.
  // Only leads where approved_amount > 0 count — this is the "carrier locked in" number.
  const approvedValue = Math.round(
    openLeads.reduce((s, l) => {
      const rjd = Array.isArray((l as any).roofing_job_data)
        ? (l as any).roofing_job_data[0]
        : (l as any).roofing_job_data
      const approved = rjd?.approved_amount
      return s + (approved != null && approved > 0 ? approved : 0)
    }, 0) * 100) / 100

  return NextResponse.json({
    // ── Command bar ──────────────────────────────────────────────────────────
    newCount:      entryLeads.length,
    activeCount:   openLeads.length,
    pipelineValue: Math.round(openLeads.reduce((s, l) => s + ((l.quoted_amount as number) || 0), 0) * 100) / 100,
    approvedValue,
    wonThisMonth:  wonInMonth(leads as never[], anchors.won, 0).length,
    newThisMonth:  leads.filter(l => new Date(l.created_at as string).getTime() >= monthStart).length,
    // ── Action cards ─────────────────────────────────────────────────────────
    needsContact,
    awaitingSignature,
    insuranceFollowUp,
    stalledLeads,
    stalledList,
  })
}
