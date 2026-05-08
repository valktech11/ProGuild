import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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
      items:estimate_items(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    // Return 404 — page falls back to MOCK_ESTIMATE until table exists
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  // Build approval timeline from status fields
  const timeline = buildTimeline(estimate)

  return NextResponse.json({ estimate: { ...estimate, timeline } })
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
  } = body

  const updatePayload: Record<string, unknown> = {
    subtotal, discount, discount_type, tax_rate, tax_amount, total,
    require_deposit, deposit_percent, terms, status, notes,
    contact_phone: contact_phone || undefined,
    contact_email: contact_email || undefined,
    updated_at: new Date().toISOString(),
  }
  if (sent_at      !== undefined) updatePayload.sent_at      = sent_at
  if (voided_at    !== undefined) updatePayload.voided_at    = voided_at
  if (void_reason  !== undefined) updatePayload.void_reason  = void_reason
  if (declined_at  !== undefined) updatePayload.declined_at  = declined_at
  if (decline_reason !== undefined) updatePayload.decline_reason = decline_reason

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

  // Sync quoted_amount and lead_status based on estimate status
  const { data: estimateData } = await sb.from('estimates').select('lead_id').eq('id', id).single()
  if (estimateData?.lead_id && total !== undefined && status) {
    if (status === 'sent') {
      // Estimate sent → update quoted_amount AND move lead to Quoted stage
      await sb.from('leads').update({
        quoted_amount: Math.round(total * 100) / 100,
        lead_status: 'Quoted',
      }).eq('id', estimateData.lead_id)
    } else if (['approved', 'invoiced', 'paid'].includes(status)) {
      // Approved/invoiced/paid → update quoted_amount only (pro controls stage)
      await sb.from('leads').update({
        quoted_amount: Math.round(total * 100) / 100,
      }).eq('id', estimateData.lead_id)
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
