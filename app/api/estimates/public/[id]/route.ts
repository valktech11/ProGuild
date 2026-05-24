import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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

  // Fetch roofing job data if roofing trade
  let roofingData: any = null
  if (estimate.lead_id && (estimate.pro as any)?.trade_slug?.includes('roof')) {
    const { data } = await sb
      .from('roofing_job_data')
      .select('square_count, pitch, waste_pct, insurance_claim, approved_amount, deductible, supplement_amount')
      .eq('lead_id', estimate.lead_id)
      .maybeSingle()
    roofingData = data
  }

  // Fetch payment milestones
  let milestones: any[] = []
  const { data: ms } = await sb
    .from('payment_schedules')
    .select('id, milestone_name, percentage, amount, due_at')
    .eq('invoice_id', estimate.id)  // future: link to estimate too
    .order('sort_order')
  milestones = ms ?? []

  const pro = estimate.pro as any

  // Build safe public response — no internal fields
  const { contact_email, contact_phone, pro_id, pro: _pro, ...safe } = estimate

  // Strip unit_price and qty from items — homeowner sees name + amount only
  if (Array.isArray(safe.items)) {
    safe.items = safe.items.map(({ id, name, amount, description }: any) => ({ id, name, amount, description }))
  }

  return NextResponse.json({
    estimate: {
      ...safe,
      // Pro info safe to expose
      pro_name:  pro?.full_name ?? null,
      pro_city:  pro?.city ?? null,
      pro_state: pro?.state ?? null,
      pro_phone: pro?.phone_cell ?? null,
      // Roofing estimate type + tiers — from roofing_estimate_data
      estimate_type:      roofingEstData?.estimate_type ?? 'standard',
      tiered_data:        roofingEstData?.tiered_data   ?? null,
      scope_of_work:      roofingEstData?.scope_of_work ?? null,
      property_address:   roofingEstData?.property_address ?? null,
      // Roofing measurements — roofing_estimate_data first, then roofing_job_data
      square_count:      roofingEstData?.square_count ?? roofingData?.square_count ?? null,
      pitch:             roofingEstData?.pitch        ?? roofingData?.pitch        ?? null,
      waste_pct:         roofingEstData?.waste_pct    ?? roofingData?.waste_pct    ?? null,
      // Insurance (public facing — only show if claim)
      insurance_claim:   roofingData?.insurance_claim ?? false,
      deductible:        roofingData?.deductible ?? null,
      // Payment milestones — roofing_estimate_data is source of truth; fall back to payment_schedules
      payment_milestones: roofingEstData?.payment_milestones
        ?? (milestones.length > 0 ? milestones.map((m: any) => ({
            id: m.id, name: m.milestone_name, pct: m.percentage ?? 0,
            amount: m.amount, due_when: m.due_at ?? '',
          })) : null),
    }
  })
}
