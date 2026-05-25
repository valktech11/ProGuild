import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── GET /api/invoices/public/[id] — client-facing, no auth ───────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // Select only fields safe to expose to homeowner — no internal IDs or pro data
  const { data: invoice, error } = await sb
    .from('invoices')
    .select(`
      id, invoice_number, status, lead_name, contact_name, contact_phone,
      items, subtotal, discount, discount_type, tax_rate, tax_amount, total,
      deposit_paid, balance_due, amount_paid, deposit_percent, deposit_amount,
      payment_terms, payment_milestones, payment_history,
      issue_date, due_date, sent_at, viewed_at, paid_at, notes, terms,
      estimate_id, lead_id, pro_id,
      pro:pros(full_name, business_name, city, state, phone_cell, logo_url, license_number)
    `)
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
      .select('id, name, description, amount')  // unit_price deliberately excluded — protects pro margin
      .eq('estimate_id', invoice.estimate_id)
    if (estItems?.length) resolvedItems = estItems
  }

  // Build safe public response — strip internal fields not needed by homeowner
  const { pro_id: _proId, resend_message_id: _mid, email_status: _es,
    email_bounce_reason: _ebr, sent_to_email: _ste,
    pro: _proRaw, ...safeInvoice } = invoice as any
  const pro = (invoice as any).pro ?? null

  return NextResponse.json({ invoice: {
    ...safeInvoice,
    items: resolvedItems ?? [],
    pro,
  } })
}
