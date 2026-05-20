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

  const { data: estimate, error } = await sb
    .from('estimates')
    .select(`
      *,
      items:estimate_items(*),
      pro:pros(trade_slug, full_name, phone_cell, city, state),
      lead:leads(property_address, contact_phone, contact_email, contact_name)
    `)
    .eq('id', id)
    .single()

  if (error) {
    // Return 404 — page falls back to MOCK_ESTIMATE until table exists
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  // Build approval timeline from status fields
  const timeline = buildTimeline(estimate)

  const pro  = (estimate as any).pro  ?? {}
  const lead = (estimate as any).lead ?? {}
  const { pro: _pro, lead: _lead, ...estClean } = estimate as any

  // Fetch roofing measurements from roofing_job_data if roofing trade + has lead
  let roofingData: any = null
  const tradeSlugResolved = estClean.trade_slug ?? pro.trade_slug ?? null
  if (estClean.lead_id && tradeSlugResolved?.includes('roof')) {
    const { data: rd } = await sb
      .from('roofing_job_data')
      .select('square_count, pitch, waste_pct, insurance_claim, approved_amount, deductible, supplement_amount, insurance_company, claim_number, adjuster_name')
      .eq('lead_id', estClean.lead_id)
      .maybeSingle()
    roofingData = rd
  }

  return NextResponse.json({
    estimate: {
      ...estClean,
      timeline,
      // Trade routing — primary source: estimate.trade_slug; fallback: pro.trade_slug
      trade_slug:        tradeSlugResolved,
      // Pro info for estimate builder header
      pro_name:          pro.full_name   ?? null,
      pro_phone:         pro.phone_cell  ?? null,
      pro_city:          pro.city        ?? null,
      pro_state:         pro.state       ?? null,
      // Property address — from estimate if saved, fallback to lead
      property_address:  estClean.property_address ?? lead.property_address ?? null,
      // Roofing measurements — pre-fill the builder
      square_count:      roofingData?.square_count     ?? null,
      pitch:             roofingData?.pitch             ?? null,
      waste_pct:         roofingData?.waste_pct         ?? null,
      // Insurance data
      insurance_claim:   roofingData?.insurance_claim  ?? false,
      approved_amount:   roofingData?.approved_amount  ?? null,
      deductible:        roofingData?.deductible        ?? null,
      supplement_amount: roofingData?.supplement_amount ?? null,
      insurance_company: roofingData?.insurance_company ?? null,
      claim_number:      roofingData?.claim_number      ?? null,
      adjuster_name:     roofingData?.adjuster_name     ?? null,
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
    estimate_type, tiered_data,
  } = body

  const updatePayload: Record<string, unknown> = {
    subtotal, discount, discount_type, tax_rate, tax_amount, total,
    require_deposit, deposit_percent, terms, status, notes,
    contact_phone: contact_phone || undefined,
    contact_email: contact_email || undefined,
    updated_at: new Date().toISOString(),
  }
  if (sent_at        !== undefined) updatePayload.sent_at        = sent_at
  if (voided_at      !== undefined) updatePayload.voided_at      = voided_at
  if (void_reason    !== undefined) updatePayload.void_reason    = void_reason
  if (declined_at    !== undefined) updatePayload.declined_at    = declined_at
  if (decline_reason !== undefined) updatePayload.decline_reason = decline_reason
  if (estimate_type  !== undefined) updatePayload.estimate_type  = estimate_type
  if (tiered_data    !== undefined) updatePayload.tiered_data    = tiered_data

  const { error: estError } = await sb.from('estimates').update(updatePayload).eq('id', id)
  if (estError) return NextResponse.json({ error: estError.message }, { status: 500 })

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
    } else if (status === 'approved') {
      // Homeowner approved estimate → proposal_signed (deposit trigger)
      leadUpdate.lead_status = (anchors as any).depositTrigger ?? 'proposal_signed'
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
