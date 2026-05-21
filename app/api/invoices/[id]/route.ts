import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'

// ── GET /api/invoices/[id] ───────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data: invoice, error } = await getSupabaseAdmin()
    .from('invoices')
    .select(`
      *,
      roofing:roofing_invoice_data(
        insurance_company, claim_number, approved_amount, deductible,
        supplement_amount, supplement_submitted, supplement_approved,
        permit_number, permit_status,
        lien_waiver_signed, lien_waiver_r2_key,
        certificate_of_completion, final_payment_note
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const roofing = (invoice as any).roofing ?? {}
  const { roofing: _roofing, ...invoiceClean } = invoice as any

  const timeline = buildTimeline(invoiceClean)
  return NextResponse.json({
    invoice: {
      ...invoiceClean,
      timeline,
      // Roofing extension — null for non-roofing invoices
      roofing_data: Object.keys(roofing).length > 0 ? roofing : null,
    }
  })
}

// ── PATCH /api/invoices/[id] ─────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body   = await req.json()
  const sb     = getSupabaseAdmin()

  const allowed = [
    'status', 'payment_terms', 'due_date', 'notes', 'terms',
    'sent_at', 'viewed_at', 'paid_at', 'amount_paid', 'balance_due',
    'contact_name', 'contact_email', 'contact_phone',
    'deposit_paid', 'items', 'subtotal', 'discount', 'tax_rate', 'tax_amount', 'total',
  ]
  const payload: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await sb.from('invoices').update(payload).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Invoice paid → auto-advance lead to job_won ──────────────────────────
  if (body.status === 'paid' && data?.lead_id) {
    const { data: leadRow } = await sb
      .from('leads').select('lead_status, pro_id').eq('id', data.lead_id).single()
    if (leadRow) {
      const { data: proRow } = await sb
        .from('pros').select('trade_slug').eq('id', leadRow.pro_id).single()
      const anchors = getStageAnchors(proRow?.trade_slug)
      // Only advance if not already won/lost/unqualified
      const terminal = [anchors.won, anchors.lost ?? 'lost', 'unqualified']
      if (!terminal.includes(leadRow.lead_status)) {
        await sb.from('leads')
          .update({ lead_status: anchors.won })
          .eq('id', data.lead_id)
      }
    }
  }

  // ── Roofing-specific invoice fields → roofing_invoice_data ─────────────
  const ROOFING_INVOICE_FIELDS = [
    'insurance_company','claim_number','approved_amount','deductible',
    'supplement_amount','supplement_submitted','supplement_approved',
    'permit_number','permit_status','lien_waiver_signed','lien_waiver_r2_key',
    'certificate_of_completion','final_payment_note',
  ]
  const roofingPayload: Record<string, unknown> = {}
  for (const field of ROOFING_INVOICE_FIELDS) {
    if (field in body) roofingPayload[field] = body[field]
  }
  if (Object.keys(roofingPayload).length > 0 && data?.pro_id) {
    roofingPayload.invoice_id = id
    roofingPayload.pro_id     = data.pro_id
    roofingPayload.updated_at = new Date().toISOString()
    await getSupabaseAdmin()
      .from('roofing_invoice_data')
      .upsert(roofingPayload, { onConflict: 'invoice_id' })
  }

  return NextResponse.json({ invoice: { ...data, timeline: buildTimeline(data) } })
}

// ── DELETE /api/invoices/[id] (void) ────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await getSupabaseAdmin()
    .from('invoices').update({ status: 'void' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function buildTimeline(inv: any) {
  return [
    { event: 'sent',    label: 'Sent to client',   timestamp: inv.sent_at    ?? null },
    { event: 'viewed',  label: 'Viewed by client',  timestamp: inv.viewed_at  ?? null },
    { event: 'paid',    label: 'Payment received',  timestamp: inv.paid_at    ?? null },
  ]
}
