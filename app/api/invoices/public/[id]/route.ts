import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── GET /api/invoices/public/[id] — client-facing, no auth ───────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: invoice, error } = await sb
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Block draft and void from public view
  if (invoice.status === 'draft' || invoice.status === 'void') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  // Track view (session dedup handled client-side)
  if (invoice.status === 'sent') {
    await sb.from('invoices').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', id)
    invoice.status = 'viewed'
  }

  // If invoice has no line items, pull from the linked estimate's items
  let resolvedItems = invoice.items
  if ((!resolvedItems || resolvedItems.length === 0) && invoice.estimate_id) {
    const { data: estItems } = await sb
      .from('estimate_items')
      .select('id, name, description, qty, unit_price, amount')
      .eq('estimate_id', invoice.estimate_id)
    if (estItems?.length) resolvedItems = estItems
  }

  return NextResponse.json({ invoice: { ...invoice, items: resolvedItems ?? [] } })
}
