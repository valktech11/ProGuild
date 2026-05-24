import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/estimates/duplicate — duplicates an estimate as a new draft
export async function POST(req: NextRequest) {
  const { estimate_id, pro_id } = await req.json()
  if (!estimate_id || !pro_id) return NextResponse.json({ error: 'estimate_id and pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Fetch original estimate + items
  const { data: orig, error } = await sb
    .from('estimates')
    .select('*, items:estimate_items(*)')
    .eq('id', estimate_id)
    .single()

  if (error || !orig) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

  // Fetch roofing_estimate_data — all roofing-specific fields live here
  const { data: origRoofing } = await sb
    .from('roofing_estimate_data')
    .select('estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct')
    .eq('estimate_id', estimate_id)
    .maybeSingle()

  // B11 FIX: use same RPC as main create route to avoid number collisions
  const { data: numData } = await sb.rpc('next_estimate_number')
  const estimateNumber: string = numData || `EST-${Date.now().toString().slice(-4)}`

  // Create new draft estimate
  const { data: newEst, error: createErr } = await sb.from('estimates').insert({
    pro_id,
    lead_id:         orig.lead_id,
    lead_name:       orig.lead_name,
    lead_source:     orig.lead_source,
    trade:           orig.trade,
    job_description: orig.job_description,
    estimate_number: estimateNumber,
    status:          'draft',
    subtotal:        orig.subtotal,
    discount:        orig.discount,
    discount_type:   orig.discount_type,
    tax_rate:        orig.tax_rate,
    tax_amount:      orig.tax_amount,
    total:           orig.total,
    deposit_percent: orig.deposit_percent,
    require_deposit: orig.require_deposit,
    terms:           orig.terms,
    notes:           orig.notes,
    contact_phone:   orig.contact_phone,
    contact_email:   orig.contact_email,
    valid_until:     new Date(Date.now() + 14 * 86400000).toISOString(),
  }).select().single()

  if (createErr || !newEst) return NextResponse.json({ error: createErr?.message || 'Failed to create' }, { status: 500 })

  // Copy standard items (standard estimates only)
  if (orig.items?.length > 0) {
    const newItems = orig.items.map((item: any) => ({
      estimate_id:  newEst.id,
      name:         item.name,
      description:  item.description,
      qty:          item.qty,
      unit_price:   item.unit_price,
      amount:       item.amount,
    }))
    await sb.from('estimate_items').insert(newItems)
  }

  // Copy roofing_estimate_data — estimate_type, tiered_data, scope_of_work etc live here
  if (origRoofing) {
    await sb.from('roofing_estimate_data').upsert({
      estimate_id:       newEst.id,
      pro_id:            orig.pro_id,
      estimate_type:     origRoofing.estimate_type     ?? 'tiered',
      tiered_data:       origRoofing.tiered_data       ?? null,
      scope_of_work:     origRoofing.scope_of_work     ?? null,
      payment_milestones: origRoofing.payment_milestones ?? null,
      property_address:  origRoofing.property_address  ?? null,
      square_count:      origRoofing.square_count      ?? null,
      pitch:             origRoofing.pitch             ?? null,
      waste_pct:         origRoofing.waste_pct         ?? null,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'estimate_id' })
  }

  return NextResponse.json({ estimate: newEst }, { status: 201 })
}
