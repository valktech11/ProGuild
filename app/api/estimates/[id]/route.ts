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
    items,
    subtotal,
    discount,
    tax_rate,
    tax_amount,
    total,
    require_deposit,
    deposit_percent,
    terms,
    status,
  } = body

  // Update estimate header
  const { error: estError } = await sb
    .from('estimates')
    .update({
      subtotal,
      discount,
      tax_rate,
      tax_amount,
      total,
      require_deposit,
      deposit_percent,
      terms,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (estError) return NextResponse.json({ error: estError.message }, { status: 500 })

  // Upsert line items
  if (Array.isArray(items) && items.length > 0) {
    const upsertItems = items.map((item: any) => ({
      id: item.id,
      estimate_id: id,
      name: item.name,
      description: item.description,
      qty: item.qty,
      unit_price: item.unit_price,
      amount: item.qty * item.unit_price,
    }))

    const { error: itemsError } = await sb
      .from('estimate_items')
      .upsert(upsertItems, { onConflict: 'id' })

    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

    // Delete removed items (items in DB but not in current payload)
    const incomingIds = items.map((i: any) => i.id)
    await sb
      .from('estimate_items')
      .delete()
      .eq('estimate_id', id)
      .not('id', 'in', `(${incomingIds.join(',')})`)
  }

  return NextResponse.json({ ok: true })
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildTimeline(estimate: any) {
  return [
    {
      event: 'sent',
      label: 'Sent to client',
      timestamp: estimate.sent_at ?? null,
    },
    {
      event: 'viewed',
      label: estimate.viewed_count > 1
        ? `Viewed by client (${estimate.viewed_count} times)`
        : 'Viewed by client',
      timestamp: estimate.viewed_at ?? null,
    },
    {
      event: 'approved',
      label: 'Approved by client',
      timestamp: estimate.approved_at ?? null,
    },
    {
      event: 'paid',
      label: 'Payment received',
      timestamp: estimate.paid_at ?? null,
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
