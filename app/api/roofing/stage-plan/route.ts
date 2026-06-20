import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { evaluateStagePlan } from '@/lib/trades/roofing/stage-rules'
import { gatherRoofingStageContext } from '@/lib/trades/roofing/stage-context'
import type { RoofingStage } from '@/lib/trades/roofing/types'

// ── GET /api/roofing/stage-plan?lead_id=<id>&pro_id=<id> ──────────────────────
//
// THE single place that decides what stage moves are allowed for a lead. Web and
// mobile both call this and render the result — neither evaluates gates on its
// own anymore (replaces web evalGate + mobile _gateReason). One server decision,
// two identical move sheets.
//
// READ-ONLY. Gathers the lead's context (address, insurance, estimate, invoice,
// dates) and runs the canonical stage-rules evaluator.

export async function GET(req: NextRequest) {
  const sp     = req.nextUrl.searchParams
  const leadId = sp.get('lead_id')
  const proId  = sp.get('pro_id')

  if (!leadId || !proId) {
    return NextResponse.json({ error: 'lead_id and pro_id are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Lead — current stage + the fields the gates read + created_at for lead_in date.
  const { data: lead } = await sb
    .from('leads')
    .select('lead_status, property_address, scheduled_date, inspection_date, created_at')
    .eq('id', leadId)
    .eq('pro_id', proId)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Insurance flags, estimate + invoice, and the StageContext — shared gatherer
  // (same logic the stage PATCH route enforces against, so they can never drift).
  const { ctx, bestEst, inv } = await gatherRoofingStageContext(
    leadId, proId, lead.lead_status as RoofingStage,
    {
      property_address: lead.property_address ?? null,
      scheduled_date:   lead.scheduled_date ?? null,
      inspection_date:  lead.inspection_date ?? null,
    },
  )

  // ── Per-stage "happened on" date — server-computed so web + mobile show the
  // same timeline. Auto stages don't advance via stage_changed, so events alone
  // miss them; we overlay the authoritative source column per stage. ──
  const { data: events } = await sb
    .from('pipeline_events')
    .select('event_type, event_data, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })   // earliest entry into a stage wins

  const dates: Partial<Record<RoofingStage, string | null>> = {}
  for (const e of (events ?? [])) {
    const t = e.created_at as string
    if (e.event_type === 'lead_created') {
      dates['lead_in'] ??= t
    } else if (e.event_type === 'insurance_auto_approved') {
      dates['insurance_approved'] ??= t
    } else if (e.event_type === 'stage_changed') {
      const to = (e.event_data as { to?: RoofingStage } | null)?.to
      if (to) dates[to] ??= t
    }
  }
  // Ladder dates mean ONE thing: when the lead REACHED that stage. The appointment
  // dates (inspection date, job date) are NOT reach-events — they belong on the lead
  // header / job details, not the stage ladder — so inspection_scheduled and scheduled
  // use their event-reached time, never lead.inspection_date / lead.scheduled_date.
  // (lead_in uses created_at, and sent/signed/paid are the events that ARE the reach.)
  dates['lead_in']              = (lead.created_at as string | null) ?? dates['lead_in'] ?? null
  dates['inspection_scheduled'] = dates['inspection_scheduled'] ?? null
  dates['proposal_sent']        = (bestEst?.sent_at ?? undefined) ?? dates['proposal_sent'] ?? (bestEst?.created_at ?? undefined) ?? null
  dates['proposal_signed']      = (bestEst?.approved_at ?? undefined) ?? dates['proposal_signed'] ?? (bestEst?.created_at ?? undefined) ?? null
  dates['scheduled']            = dates['scheduled'] ?? null
  dates['job_won']              = (inv?.paid_at ?? undefined) ?? dates['job_won'] ?? null

  const plan = evaluateStagePlan(ctx)

  // Each entry carries its own "happened on" date (null if it hasn't yet).
  // A date belongs only to a stage the lead has actually reached. Future stages
  // (and skipped branch stages) never show one — even if a source timestamp like a
  // draft estimate's created_at happens to exist.
  const stagesWithDates = plan.stages.map(s => ({
    ...s,
    date: (s.isComplete || s.isCurrent) ? (dates[s.key] ?? null) : null,
  }))

  return NextResponse.json({
    current_stage: plan.currentStage,
    stages:        stagesWithDates,
    // Echo the context the decision was made from — useful for client debugging
    // and so the move sheet can prefill date pickers without a second fetch.
    context: {
      property_address: ctx.propertyAddress,
      insurance_claim:  ctx.insuranceClaim,
      claim_status:     ctx.claimStatus,
      estimate:         ctx.estimate,
      invoice:          ctx.invoice,
      scheduled_date:   ctx.scheduledDate,
      inspection_date:  ctx.inspectionDate,
    },
  })
}
