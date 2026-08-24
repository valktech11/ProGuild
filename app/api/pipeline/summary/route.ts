import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'
import { wonInMonth, closedPipelineKeys } from '@/lib/metrics/won'
import { daysInStage, isStalled } from '@/lib/metrics/sla'
import { requirePro } from '@/lib/pro-auth'

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
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const proId = __auth.proId
  const _pipCompanyId = __auth.companyId
  const _pipRole = __auth.role
  if (!_pipCompanyId) return NextResponse.json({ error: 'No company context' }, { status: 400 })
  let _pipLeadIds: string[] | null = null
  if (_pipRole === 'member' && proId) {
    const { data: _ml } = await getSupabaseAdmin().from('leads').select('id')
      .eq('company_id', _pipCompanyId).eq('assigned_to_pro_id', proId).is('deleted_at', null)
    _pipLeadIds = (_ml ?? []).map((l: any) => l.id)
  }

  const sb = getSupabaseAdmin()
  const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).single()
  const tradeSlug = proRow?.trade_slug ?? null
  const anchors   = getStageAnchors(tradeSlug)

  const closedKeys = closedPipelineKeys(tradeSlug, anchors.won)

  // Fetch leads + estimates in parallel (member: assigned leads only)
  const [leadsRes, estRes] = await Promise.all([
    (() => { let q = sb.from('leads').select('id, lead_status, created_at, lead_status_changed_at, quoted_amount, roofing_job_data(approved_amount)').eq('company_id', _pipCompanyId); if (_pipLeadIds !== null) q = q.in('id', _pipLeadIds); return q })(),
    (() => { let q = sb.from('estimates').select('status, sent_at, valid_until').eq('company_id', _pipCompanyId); if (_pipLeadIds !== null) q = q.in('lead_id', _pipLeadIds); return q })(),
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

  // ── HVAC: Maintenance Due this week ─────────────────────────────────────────
  // Count pending reminders due within 7 days — shown in the HVAC board card.
  // Only queried when the trade is HVAC (non-zero cost query avoided for others).
  let maintenanceDue = 0
  const isHVAC = tradeSlug === 'hvac-technician' || tradeSlug === 'hvac' || tradeSlug === 'hvac-contractor' || tradeSlug === 'air-conditioning'
  if (isHVAC) {
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const todayISO    = new Date().toISOString().slice(0, 10)
    const { count } = await sb
      .from('hvac_maintenance_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('pro_id', proId)
      .eq('status', 'Pending')
      .gte('due_date', todayISO)
      .lte('due_date', weekFromNow)
    maintenanceDue = count ?? 0
  }

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
    maintenanceDue,
  })
}
