import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { computeInsuranceReconciliation } from '@/lib/insurance/reconciliation'

// Same gating as the web calculator panel: only meaningful for an approved
// insurance claim with a job cost.
const APPROVED_STATUSES = ['Approved', 'Supplement Approved']

// GET /api/roofing/reconciliation?lead_id=<id>&pro_id=<id>
// Server-authoritative insurance reconciliation for a lead. Mobile renders the
// returned 3 lines verbatim; it never re-derives the formula.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const proId  = searchParams.get('pro_id')
  if (!leadId || !proId) {
    return NextResponse.json({ error: 'lead_id and pro_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Insurance inputs live on roofing_job_data (job-level).
  const { data: lead } = await sb
    .from('leads')
    .select('roofing_job_data(insurance_claim, approved_amount, supplement_amount, deductible, claim_status)')
    .eq('id', leadId)
    .eq('pro_id', proId)
    .maybeSingle()

  const rjd = (lead as any)?.roofing_job_data ?? null
  const isInsurance = !!rjd?.insurance_claim
  const claimStatus = String(rjd?.claim_status ?? '')

  // Job cost = the lead's current estimate total. We READ the stored total
  // (authoritative since the single-source totals fix) — never re-sum here.
  const { data: est } = await sb
    .from('estimates')
    .select('total, status, created_at')
    .eq('lead_id', leadId)
    .eq('pro_id', proId)
    .not('status', 'in', '("void","declined")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const jobCost = Number((est as any)?.total) || 0

  const approvedAmount = Number(rjd?.approved_amount)   || 0
  const supplement     = Number(rjd?.supplement_amount) || 0
  const deductible     = Number(rjd?.deductible)        || 0

  const reconciliation = computeInsuranceReconciliation({ jobCost, approvedAmount, supplement, deductible })

  const hasAmounts = approvedAmount > 0 || supplement > 0 || deductible > 0
  const show = isInsurance && APPROVED_STATUSES.includes(claimStatus) && jobCost > 0

  return NextResponse.json({ isInsurance, claimStatus, hasAmounts, show, ...reconciliation })
}
