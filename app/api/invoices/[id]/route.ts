import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auditedAdmin } from '@/lib/audit-context'
import { requirePro } from '@/lib/pro-auth'
import { getStageAnchors } from '@/lib/trades/_registry'
import { resolveClientForLead } from '@/lib/leads/resolveClientForLead'

// Always read fresh from the database — never serve a cached response.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
      pro:pros(full_name, business_name, city, state, phone_cell, license_number, logo_url, plan_tier),
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
  const pro     = (invoice as any).pro ?? null
  const { roofing: _roofing, pro: _pro, ...invoiceClean } = invoice as any

  // If invoice has no line items, pull from the linked estimate's items
  let resolvedItems = invoiceClean.items
  if ((!resolvedItems || resolvedItems.length === 0) && invoiceClean.estimate_id) {
    const { data: estItems } = await getSupabaseAdmin()
      .from('estimate_items')
      .select('id, name, description, qty, unit_price, amount')
      .eq('estimate_id', invoiceClean.estimate_id)
    if (estItems?.length) resolvedItems = estItems
  }

  const timeline = buildTimeline(invoiceClean)
  return NextResponse.json({
    invoice: {
      ...invoiceClean,
      items: resolvedItems ?? [],
      timeline,
      pro,
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
  // IDOR fix: was unguarded update-by-id. Now auth-scoped + audited.
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error || !__auth.proId) return __auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = __auth.proId
  const body   = await req.json()
  const sb     = auditedAdmin(req, { actorId: proId, actorType: 'pro' })

  // Ownership: confirm the invoice belongs to this pro before any write.
  const { data: ownerRow, error: ownerErr } = await sb
    .from('invoices').select('pro_id').eq('id', id).single()
  if (ownerErr || !ownerRow) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (ownerRow.pro_id !== proId) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const allowed = [
    'status', 'payment_terms', 'due_date', 'notes', 'terms',
    'sent_at', 'viewed_at', 'paid_at', 'amount_paid', 'balance_due',
    'contact_name', 'contact_email', 'contact_phone',
    'deposit_paid', 'items', 'subtotal', 'discount', 'tax_rate', 'tax_amount', 'total',
    'payment_history', 'payment_milestones', 'require_deposit', 'deposit_percent', 'deposit_amount',
    'resend_message_id', 'sent_to_email', 'email_status', 'email_bounce_reason',
  ]
  const payload: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await sb.from('invoices').update(payload).eq('id', id).eq('pro_id', proId).select().single()
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
        const wonAt = new Date().toISOString()
        await sb.from('leads')
          .update({ lead_status: anchors.won, lead_status_changed_at: wonAt })
          .eq('id', data.lead_id)
        // Log the transition — see record-payment route for the same fix.
        await sb.from('pipeline_events').insert({
          lead_id:    data.lead_id,
          pro_id:     leadRow.pro_id,
          event_type: 'stage_changed',
          event_data: { from: leadRow.lead_status, to: anchors.won, auto: 'invoice_paid' },
          actor_type: 'system',
          created_at: wonAt,
        })
      }
      // A won job must have a customer record.
      await resolveClientForLead(sb, data.lead_id, leadRow.pro_id)
    }
  }

  // ── Invoice paid → sync linked estimate so its tracker reflects payment ──
  if (body.status === 'paid' && data?.estimate_id) {
    const nowTs = new Date().toISOString()
    const { data: estRow } = await sb
      .from('estimates').select('invoiced_at').eq('id', data.estimate_id).single()
    await sb.from('estimates').update({
      status:      'paid',
      paid_at:     nowTs,
      invoiced_at: estRow?.invoiced_at ?? nowTs,
    }).eq('id', data.estimate_id)
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // IDOR fix: was unguarded void-by-id. Now auth-scoped + audited.
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error || !__auth.proId) return __auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = __auth.proId
  const sb = auditedAdmin(req, { actorId: proId, actorType: 'pro' })
  // Read the invoice's estimate link before voiding so we can reset the parent
  const { data: invRow } = await sb
    .from('invoices').select('estimate_id').eq('id', id).eq('pro_id', proId).maybeSingle()
  const { error } = await sb
    .from('invoices').update({ status: 'void' }).eq('id', id).eq('pro_id', proId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Reset the parent estimate so it can be re-invoiced — clears the stale
  // invoice_id pointer that would otherwise redirect to a voided invoice.
  if (invRow?.estimate_id) {
    await sb.from('estimates')
      .update({ status: 'approved', invoice_id: null, invoiced_at: null })
      .eq('id', invRow.estimate_id).eq('pro_id', proId)
  }
  return NextResponse.json({ ok: true })
}

function buildTimeline(inv: any) {
  return [
    { event: 'sent',    label: 'Sent to client',   timestamp: inv.sent_at    ?? null },
    { event: 'viewed',  label: 'Viewed by client',  timestamp: inv.viewed_at  ?? null },
    { event: 'paid',    label: 'Payment received',  timestamp: inv.paid_at    ?? null },
  ]
}
