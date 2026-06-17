import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { computeMilestones } from '@/lib/estimates/milestones'

// Public GET — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: estimate, error } = await sb
    .from('estimates')
    .select(`
      *,
      items:estimate_items(*),
      pro:pros(full_name, city, state, phone_cell, trade_slug, roofing_material_prices, gbb_templates)
    `)
    .eq('id', id)
    .single()

  if (error || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  if (['draft', 'void'].includes(estimate.status)) {
    return NextResponse.json({ error: 'Estimate not available' }, { status: 404 })
  }

  // Fetch roofing_estimate_data — estimate_type and tiered_data live here, not on estimates table
  const { data: roofingEstData } = await sb
    .from('roofing_estimate_data')
    .select('estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct')
    .eq('estimate_id', id)
    .maybeSingle()

  // Fetch lead contact_name + property_address — leads table is golden source for both
  let leadContactName: string | null = null
  let leadPropertyAddress: string | null = null
  if (estimate.lead_id) {
    const { data: leadRow } = await sb
      .from('leads')
      .select('contact_name, property_address')
      .eq('id', estimate.lead_id)
      .maybeSingle()
    leadContactName     = leadRow?.contact_name    ?? null
    leadPropertyAddress = leadRow?.property_address ?? null
  }

  // Fetch roofing job data if roofing trade
  let roofingData: any = null
  if (estimate.lead_id && (estimate.pro as any)?.trade_slug?.includes('roof')) {
    const { data } = await sb
      .from('roofing_job_data')
      .select('square_count, pitch, waste_pct, insurance_claim, approved_amount, deductible, supplement_amount, claim_status')
      .eq('lead_id', estimate.lead_id)
      .maybeSingle()
    roofingData = data
  }


  const pro = estimate.pro as any

  // Build safe public response — no internal fields
  const { contact_email, contact_phone, pro_id, pro: _pro, ...safe } = estimate

  // Strip unit_price and qty from items — homeowner sees name + amount only
  if (Array.isArray(safe.items)) {
    safe.items = safe.items.map(({ id, name, amount, description }: any) => ({ id, name, amount, description }))
  }

  // Defensive: if stored totals are 0/missing (legacy bug where standard-estimate
  // totals saved as 0 due to string-amount concat), recompute from line items so
  // the homeowner email + public proposal never show $0.
  const itemsSum = Array.isArray(safe.items)
    ? safe.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
    : 0
  if ((Number(safe.total) || 0) === 0 && itemsSum > 0) {
    const rate = Number(safe.tax_rate) || 0
    safe.subtotal   = itemsSum
    // Cents-accurate tax (same rule as the authoritative server derivation) —
    // was Math.round(itemsSum * rate/100) which rounded tax to whole dollars and
    // diverged from every other surface.
    safe.tax_amount = Math.round(itemsSum * (rate / 100) * 100) / 100
    safe.total      = safe.subtotal + safe.tax_amount
  }

  return NextResponse.json({
    estimate: {
      ...safe,
      // Override lead_name with live contact_name from leads — estimates.lead_name may be stale/address
      lead_name: leadContactName ?? safe.lead_name ?? null,
      // Pro info safe to expose
      pro_name:  pro?.full_name ?? null,
      pro_city:  pro?.city ?? null,
      pro_state: pro?.state ?? null,
      pro_phone: pro?.phone_cell ?? null,
      // Roofing estimate type + tiers — from roofing_estimate_data
      estimate_type:      roofingEstData?.estimate_type ?? 'standard',
      tiered_data:        roofingEstData?.tiered_data   ?? null,
      scope_of_work:      roofingEstData?.scope_of_work ?? null,
      property_address:   leadPropertyAddress ?? roofingEstData?.property_address ?? null,  // lead is golden source
      // Roofing measurements — roofing_estimate_data first, then roofing_job_data
      square_count:      roofingEstData?.square_count ?? roofingData?.square_count ?? null,
      pitch:             roofingEstData?.pitch        ?? roofingData?.pitch        ?? null,
      waste_pct:         roofingEstData?.waste_pct    ?? roofingData?.waste_pct    ?? null,
      // Insurance (public facing — only show if claim)
      insurance_claim:   roofingData?.insurance_claim ?? false,
      deductible:        roofingData?.deductible        ?? null,
      approved_amount:   roofingData?.approved_amount   ?? null,
      claim_status:      roofingData?.claim_status      ?? null,
      supplement_amount: roofingData?.supplement_amount ?? null,
      insurance_company: roofingData?.insurance_company ?? null,
      claim_number:      roofingData?.claim_number      ?? null,
      // Payment milestones — ALWAYS computed fresh from the authoritative total
      // (single source: lib/estimates/milestones), never the stored value, so the
      // homeowner sees the same schedule as the contractor and it can't go stale.
      payment_milestones: computeMilestones(Number(safe.total) || 0),
    }
  })
}
