import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'

// ── GET /api/estimates/[id] ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // ── Fetch estimate + related data as separate queries (no joins = no join failures) ──
  const { data: estimate, error } = await sb
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !estimate) {
    // Log full error details for debugging
    console.error('[estimates GET] id:', id, 'error:', JSON.stringify(error), 'hasData:', !!estimate)
    return NextResponse.json({ 
      error: error?.message ?? 'Estimate not found',
      code: error?.code,
      hint: error?.hint,
      details: error?.details,
    }, { status: 404 })
  }

  // Parallel fetch of all related data — each can fail independently without killing the response
  const [itemsRes, proRes, leadRes, roofingRes] = await Promise.all([
    sb.from('estimate_items').select('*').eq('estimate_id', id),
    sb.from('pros').select('trade_slug, full_name, phone_cell, city, state, signature_r2_key').eq('id', estimate.pro_id).maybeSingle(),
    estimate.lead_id
      ? sb.from('leads').select('property_address, contact_phone, contact_email, contact_name').eq('id', estimate.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('roofing_estimate_data').select('estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct').eq('estimate_id', id).maybeSingle(),
  ])

  const items   = (itemsRes.data ?? []).map((item: any) => ({
    id:          item.id,
    name:        item.name        ?? item.description ?? '',
    description: item.description ?? item.name        ?? '',
    qty:         item.qty         ?? item.quantity     ?? 1,
    unit_price:  item.unit_price  ?? 0,
    amount:      item.amount      ?? item.total        ?? 0,
    sort_order:  item.sort_order  ?? 0,
  }))
  const pro:     any = proRes.data     ?? {}
  const lead:    any = (leadRes as any).data ?? {}
  const roofing: any = roofingRes.data ?? {}

  // Build approval timeline from status fields
  const timeline = buildTimeline(estimate)

  // pro, lead, roofing are now fetched separately above
  const estClean = estimate as any

  const tradeSlugResolved = estClean.trade_slug ?? pro.trade_slug ?? null

  // Fetch roofing_job_data — always fetch when lead_id present
  // Also fetch leads.lead_status as insurance fallback (stage=insurance_approved implies insurance job)
  let roofingJobData: any = null
  if (estClean.lead_id) {
    const { data: rd, error: rdErr } = await sb
      .from('roofing_job_data')
      .select('square_count, pitch, waste_pct, insurance_claim, approved_amount, deductible, supplement_amount, insurance_company, claim_number, adjuster_name, claim_status')
      .eq('lead_id', estClean.lead_id)
      .maybeSingle()
      // Fallback: if no roofing_job_data row, check lead_status — insurance_approved stage means it IS an insurance job
    if (!rd) {
      const { data: leadRow } = await sb
        .from('leads')
        .select('lead_status')
        .eq('id', estClean.lead_id)
        .maybeSingle()
      const isInsuranceStage = leadRow?.lead_status === 'insurance_approved'
      roofingJobData = isInsuranceStage ? { insurance_claim: true } : null
    } else {
      roofingJobData = rd
    }
  }

  return NextResponse.json({
    estimate: {
      ...estClean,
      items,  // from separate estimate_items query
      timeline,
      trade_slug:    tradeSlugResolved,
      // Pro info
      pro_name:      pro.full_name  ?? null,
      pro_phone:     pro.phone_cell ?? null,
      pro_city:      pro.city       ?? null,
      pro_signature: pro.signature_r2_key ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''}/${pro.signature_r2_key}` : null,
      pro_state:     pro.state      ?? null,
      // ── Roofing estimate data — source of truth: roofing_estimate_data only ──
      // estClean fallbacks removed — columns dropped from estimates in v95
      estimate_type:      roofing.estimate_type      ?? 'tiered',
      tiered_data:        roofing.tiered_data        ?? null,
      scope_of_work:      roofing.scope_of_work      ?? null,
      payment_milestones: roofing.payment_milestones ?? null,
      // Property address — roofing_estimate_data → lead (estimates column dropped)
      property_address:   lead.property_address ?? roofing.property_address ?? null,  // lead is golden source
      // Measurements — roofing_estimate_data first, then roofing_job_data (live job data)
      square_count:  roofing.square_count ?? roofingJobData?.square_count ?? null,
      pitch:         roofing.pitch        ?? roofingJobData?.pitch        ?? null,
      waste_pct:     roofing.waste_pct    ?? roofingJobData?.waste_pct    ?? null,
      // Contact info — prefer lead (live source of truth), fall back to estimate copy
      contact_email: lead.contact_email ?? estClean.contact_email ?? null,
      contact_phone: lead.contact_phone ?? estClean.contact_phone ?? null,
      lead_name:     lead.contact_name  ?? estClean.lead_name     ?? null,
      // Insurance (always from roofing_job_data — live claim state)
      insurance_claim:   roofingJobData?.insurance_claim || !!(roofingJobData?.claim_number || roofingJobData?.approved_amount) || false,
      approved_amount:   roofingJobData?.approved_amount   ?? null,
      claim_status:      roofingJobData?.claim_status       ?? null,
      deductible:        roofingJobData?.deductible         ?? null,
      supplement_amount: roofingJobData?.supplement_amount ?? null,
      insurance_company: roofingJobData?.insurance_company ?? null,
      claim_number:      roofingJobData?.claim_number       ?? null,
      adjuster_name:     roofingJobData?.adjuster_name      ?? null,
    }
  })
}

// ── PATCH /api/estimates/[id] ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const sb = getSupabaseAdmin()

  const {
    items, subtotal, discount, discount_type, tax_rate, tax_amount, total,
    require_deposit, deposit_percent, terms, status, notes,
    contact_phone, contact_email, sent_at,
    voided_at, void_reason, declined_at, decline_reason,
    // Roofing-specific — written to roofing_estimate_data, NOT estimates
    estimate_type, tiered_data, scope_of_work, payment_milestones,
    property_address, square_count, pitch, waste_pct,
  } = body

  // ── Universal estimate fields → estimates table ──────────────────────────
  // CRITICAL: only include fields explicitly present in payload
  // Undefined values would null out existing DB data (e.g. total → 0)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (subtotal        !== undefined) updatePayload.subtotal        = subtotal
  if (discount        !== undefined) updatePayload.discount        = discount
  if (discount_type   !== undefined) updatePayload.discount_type   = discount_type
  if (tax_rate        !== undefined) updatePayload.tax_rate        = tax_rate
  if (tax_amount      !== undefined) updatePayload.tax_amount      = tax_amount
  if (total           !== undefined) updatePayload.total           = total
  if (require_deposit !== undefined) updatePayload.require_deposit = require_deposit
  if (deposit_percent !== undefined) updatePayload.deposit_percent = deposit_percent
  if (terms           !== undefined) updatePayload.terms           = terms
  if (status          !== undefined) updatePayload.status          = status
  if (notes           !== undefined) updatePayload.notes           = notes
  if (contact_phone   !== undefined) updatePayload.contact_phone   = contact_phone || null
  if (contact_email   !== undefined) updatePayload.contact_email   = contact_email || null
  if (sent_at         !== undefined) updatePayload.sent_at         = sent_at
  if (voided_at       !== undefined) updatePayload.voided_at       = voided_at
  if (void_reason     !== undefined) updatePayload.void_reason     = void_reason
  if (declined_at     !== undefined) updatePayload.declined_at     = declined_at
  if (decline_reason  !== undefined) updatePayload.decline_reason  = decline_reason

  const { error: estError } = await sb.from('estimates').update(updatePayload).eq('id', id)
  if (estError) return NextResponse.json({ error: estError.message }, { status: 500 })

  // ── Roofing-specific fields → roofing_estimate_data ──────────────────────
  // Only upsert if any roofing field is present in the payload
  const hasRoofingFields = [
    estimate_type, tiered_data, scope_of_work, payment_milestones,
    property_address, square_count, pitch, waste_pct,
  ].some(v => v !== undefined)

  if (hasRoofingFields) {
    // Need pro_id for RLS — fetch from estimate
    const { data: estRow } = await sb.from('estimates').select('pro_id, tax_rate').eq('id', id).single()
    if (estRow?.pro_id) {
      const roofingPayload: Record<string, unknown> = {
        estimate_id: id,
        pro_id:      estRow.pro_id,
        updated_at:  new Date().toISOString(),
      }
      if (estimate_type      !== undefined) roofingPayload.estimate_type      = estimate_type
      if (tiered_data        !== undefined) roofingPayload.tiered_data        = tiered_data
      if (scope_of_work      !== undefined) roofingPayload.scope_of_work      = scope_of_work
      if (payment_milestones !== undefined) roofingPayload.payment_milestones = payment_milestones
      // property_address NOT written to roofing_estimate_data — leads.property_address is golden source
      if (square_count       !== undefined) roofingPayload.square_count       = square_count
      if (pitch              !== undefined) roofingPayload.pitch              = pitch
      if (waste_pct          !== undefined) roofingPayload.waste_pct          = waste_pct

      await sb.from('roofing_estimate_data')
        .upsert(roofingPayload, { onConflict: 'estimate_id' })

      // Sync estimates.total when GBB tiered_data is saved
      // Use selected_tier subtotal if set, otherwise use the upgraded (middle) tier
      if (tiered_data?.tiers?.length > 0 && estRow?.pro_id) {
        const tiers = tiered_data.tiers as any[]
        const selKey = tiered_data.selected_tier
        const selTier = selKey
          ? tiers.find((t: any) => t.key === selKey)
          : tiers.find((t: any) => t.key === 'upgraded') ?? tiers[Math.floor(tiers.length / 2)]
        if (selTier?.subtotal !== undefined) {
          const txRate   = estRow.tax_rate ?? 0
          const newSub   = selTier.subtotal
          const newTax   = Math.round(newSub * (txRate / 100) * 100) / 100
          const newTotal = newSub + newTax
          // Only update if total !== undefined (not already in payload — avoid double-write)
          if (total === undefined) {
            await sb.from('estimates').update({
              subtotal:   newSub,
              tax_amount: newTax,
              total:      newTotal,
              updated_at: new Date().toISOString(),
            }).eq('id', id)
          }
        }
      }
    }
  }

  // B10 FIX: always process items array — even empty (to delete all removed items)
  if (Array.isArray(items)) {
    if (items.length > 0) {
      const upsertItems = items.map((item: any) => ({
        id: item.id, estimate_id: id,
        name: item.name, description: item.description,
        qty: item.qty, unit_price: item.unit_price,
        amount: Math.round(item.qty * item.unit_price * 100) / 100,
      }))
      const { error: itemsError } = await sb.from('estimate_items').upsert(upsertItems, { onConflict: 'id' })
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
    // Always delete items not in the incoming array (handles empty array = delete all)
    const incomingIds = items.map((i: any) => i.id)
    if (incomingIds.length > 0) {
      await sb.from('estimate_items').delete().eq('estimate_id', id).not('id', 'in', `(${incomingIds.join(',')})`)
    } else {
      await sb.from('estimate_items').delete().eq('estimate_id', id)
    }
  }

  // ── Auto-stage lead based on estimate status ────────────────────────────────
  // Reads stageAnchors so logic never hardcodes stage key strings.
  const { data: estimateData } = await sb
    .from('estimates').select('lead_id, pro_id').eq('id', id).single()

  if (estimateData?.lead_id && status) {
    // Resolve trade slug from the lead's pro so anchors are trade-correct
    const { data: proRow } = await sb
      .from('pros').select('trade_slug').eq('id', estimateData.pro_id).single()
    const anchors = getStageAnchors(proRow?.trade_slug)

    const leadUpdate: Record<string, unknown> = {}

    if (total !== undefined) {
      // Always sync quoted_amount when estimate has a total
      if (['sent','approved','invoiced','paid'].includes(status)) {
        leadUpdate.quoted_amount = Math.round(total * 100) / 100
      }
    }

    // Auto-advance lead stage — only move forward, never backward
    if (status === 'sent') {
      // Estimate sent → proposal_sent (maps to stageAnchors entry neighbour)
      leadUpdate.lead_status = anchors.entry === 'lead_in' ? 'proposal_sent' : 'Quoted'
      leadUpdate.lead_status_changed_at = new Date().toISOString()
    } else if (status === 'approved') {
      // Homeowner approved estimate → proposal_signed (deposit trigger)
      leadUpdate.lead_status = (anchors as any).depositTrigger ?? 'proposal_signed'
      leadUpdate.lead_status_changed_at = new Date().toISOString()
    }
    // Note: invoice paid → job_won is handled in /api/invoices/[id]/route.ts

    if (Object.keys(leadUpdate).length > 0) {
      await sb.from('leads').update(leadUpdate).eq('id', estimateData.lead_id)
    }
  }

  return NextResponse.json({ ok: true })
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildTimeline(estimate: any) {
  const isDeclined = estimate.status === 'declined'
  const isVoid     = estimate.status === 'void'

  return [
    { event: 'sent',     label: 'Sent to client',   timestamp: estimate.sent_at     ?? null },
    {
      event: 'viewed',
      label: estimate.viewed_count > 1 ? `Viewed by client (${estimate.viewed_count} times)` : 'Viewed by client',
      timestamp: estimate.viewed_at ?? null,
    },
    {
      event: isDeclined ? 'declined' : 'approved',
      label: isDeclined ? 'Declined by client' : 'Approved by client',
      timestamp: isDeclined ? (estimate.declined_at ?? null) : (estimate.approved_at ?? null),
    },
    { event: 'invoiced', label: 'Invoice created',   timestamp: estimate.invoiced_at ?? null },
    {
      event: isVoid ? 'void' : 'paid',
      label: isVoid ? 'Estimate voided' : 'Payment received',
      timestamp: isVoid ? (estimate.voided_at ?? null) : (estimate.paid_at ?? null),
    },
  ]
}

// ── DELETE /api/estimates/[id] ───────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await getSupabaseAdmin()
    .from('estimates')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
