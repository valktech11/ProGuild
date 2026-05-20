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

  return NextResponse.json({
    estimate: {
      ...safe,
      // Pro info safe to expose
      pro_name:  pro?.full_name ?? null,
      pro_city:  pro?.city ?? null,
      pro_state: pro?.state ?? null,
      pro_phone: pro?.phone_cell ?? null,
      // Roofing measurements
      square_count:      roofingData?.square_count ?? null,
      pitch:             roofingData?.pitch ?? null,
      waste_pct:         roofingData?.waste_pct ?? null,
      // Insurance (public facing — only show if claim)
      insurance_claim:   roofingData?.insurance_claim ?? false,
      deductible:        roofingData?.deductible ?? null,
      // Payment milestones
      payment_milestones: milestones.length > 0 ? milestones.map((m: any) => ({
        id: m.id, name: m.milestone_name, pct: m.percentage ?? 0,
        amount: m.amount, due_when: m.due_at ?? '',
      })) : null,
    }
  })
}
