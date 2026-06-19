import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { evaluateStagePlan, type StageContext } from '@/lib/trades/roofing/stage-rules'
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

  // Lead — current stage + the fields the gates read.
  const { data: lead } = await sb
    .from('leads')
    .select('lead_status, property_address, scheduled_date, inspection_date')
    .eq('id', leadId)
    .eq('pro_id', proId)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Insurance flags live on the roof-report row.
  const { data: rjd } = await sb
    .from('roofing_job_data')
    .select('insurance_claim, claim_status')
    .eq('lead_id', leadId)
    .maybeSingle()

  // Live estimate for this lead — same priority pick as POST /api/estimates and
  // the calculator librarian, so "the estimate" means the same thing everywhere.
  const { data: estimates } = await sb
    .from('estimates')
    .select('id, status, total, created_at')
    .eq('pro_id', proId)
    .eq('lead_id', leadId)
    .not('status', 'in', '("void","declined")')
    .order('created_at', { ascending: false })
    .limit(10)

  const estPriority = ['approved', 'invoiced', 'paid', 'sent', 'viewed', 'draft']
  const bestEst = (estimates && estimates.length > 0)
    ? [...estimates].sort((a, b) => estPriority.indexOf(a.status) - estPriority.indexOf(b.status))[0]
    : null

  // Latest non-void invoice — drives the paid-in-full check for Job Won.
  const { data: invoices } = await sb
    .from('invoices')
    .select('id, status, balance_due, created_at')
    .eq('lead_id', leadId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)

  const inv = (invoices && invoices.length > 0) ? invoices[0] : null

  const ctx: StageContext = {
    currentStage:    lead.lead_status as RoofingStage,
    propertyAddress: lead.property_address ?? null,
    insuranceClaim:  rjd?.insurance_claim === true,
    claimStatus:     (rjd?.claim_status as string | null) ?? null,
    estimate: bestEst
      ? { exists: true, status: bestEst.status as string, total: bestEst.total as number }
      : { exists: false },
    invoice: inv
      ? { exists: true, status: inv.status as string, balanceDue: inv.balance_due as number }
      : { exists: false },
    scheduledDate:   lead.scheduled_date ?? null,
    inspectionDate:  lead.inspection_date ?? null,
  }

  const plan = evaluateStagePlan(ctx)

  return NextResponse.json({
    current_stage: plan.currentStage,
    stages:        plan.stages,
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
