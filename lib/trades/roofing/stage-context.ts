// ── Shared roofing stage context ─────────────────────────────────────────────
// One place that assembles the StageContext (and the estimate/invoice rows behind
// it) from the database. Consumed by BOTH the stage-plan route (read) and the
// stage PATCH route (enforcement) so the two never drift on how "the estimate" or
// "the invoice" for a lead is chosen. The estimate priority here MUST match
// POST /api/estimates and the calculator librarian.

import { getSupabaseAdmin } from '@/lib/supabase'
import type { StageContext } from './stage-rules'
import type { RoofingStage } from './types'

export interface RoofingEstimateRow {
  id: string
  status: string
  total: number
  created_at: string
  sent_at: string | null
  approved_at: string | null
}

export interface RoofingInvoiceRow {
  id: string
  status: string
  balance_due: number
  created_at: string
  paid_at: string | null
}

export interface RoofingStageData {
  ctx: StageContext
  bestEst: RoofingEstimateRow | null
  inv: RoofingInvoiceRow | null
}

const EST_PRIORITY = ['approved', 'invoiced', 'paid', 'sent', 'viewed', 'draft']

export async function gatherRoofingStageContext(
  leadId: string,
  proId: string,
  currentStage: RoofingStage,
  leadFields: {
    property_address: string | null
    scheduled_date: string | null
    inspection_date: string | null
  },
): Promise<RoofingStageData> {
  const sb = getSupabaseAdmin()

  // Insurance flags live on the roof-report row.
  const { data: rjd } = await sb
    .from('roofing_job_data')
    .select('insurance_claim, claim_status')
    .eq('lead_id', leadId)
    .maybeSingle()

  // Live estimate for this lead — priority pick shared with POST /api/estimates.
  const { data: estimates } = await sb
    .from('estimates')
    .select('id, status, total, created_at, sent_at, approved_at')
    .eq('pro_id', proId)
    .eq('lead_id', leadId)
    .not('status', 'in', '("void","declined")')
    .order('created_at', { ascending: false })
    .limit(10)

  const bestEst = (estimates && estimates.length > 0)
    ? ([...estimates].sort(
        (a, b) => EST_PRIORITY.indexOf(a.status) - EST_PRIORITY.indexOf(b.status),
      )[0] as RoofingEstimateRow)
    : null

  // Latest non-void invoice — drives the paid-in-full check for Job Won.
  const { data: invoices } = await sb
    .from('invoices')
    .select('id, status, balance_due, created_at, paid_at')
    .eq('lead_id', leadId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)

  const inv = (invoices && invoices.length > 0) ? (invoices[0] as RoofingInvoiceRow) : null

  const ctx: StageContext = {
    currentStage,
    propertyAddress: leadFields.property_address ?? null,
    insuranceClaim:  rjd?.insurance_claim === true,
    claimStatus:     (rjd?.claim_status as string | null) ?? null,
    estimate: bestEst
      ? { exists: true, status: bestEst.status, total: bestEst.total }
      : { exists: false },
    invoice: inv
      ? { exists: true, status: inv.status, balanceDue: inv.balance_due }
      : { exists: false },
    scheduledDate:   leadFields.scheduled_date ?? null,
    inspectionDate:  leadFields.inspection_date ?? null,
  }

  return { ctx, bestEst, inv }
}
