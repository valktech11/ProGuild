import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'
import { computeInvoiceBalances } from '@/lib/invoices/balances'

// POST /api/invoices/[id]/record-payment
// Body: { amount, method, date?, reference?, milestone_name?, pro_id? }
//
// The client sends ONLY the new payment. The server appends it to
// payment_history and derives amount_paid / balance_due / status / paid_at via
// the one calculator (lib/invoices/balances), then runs the paid-in-full side
// effects (advance lead → won, mark linked estimate paid). Clients render the
// returned invoice; they never compute balances themselves.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const sb = getSupabaseAdmin()

  const amount = Number(body.amount)
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const { data: inv, error: loadErr } = await sb
    .from('invoices')
    .select('id, pro_id, lead_id, estimate_id, total, payment_history, status, paid_at')
    .eq('id', id)
    .single()
  if (loadErr || !inv) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Optional ownership guard (web passes pro_id; if present it must match)
  if (body.pro_id && inv.pro_id && body.pro_id !== inv.pro_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const total = Number(inv.total) || 0
  const existing = (inv.payment_history as Array<{ amount?: number | null }> | null) ?? []
  const currentPaid = Math.round(existing.reduce((s, p) => s + (Number(p?.amount) || 0), 0) * 100) / 100
  const currentBalance = Math.round((total - currentPaid) * 100) / 100

  if (currentBalance <= 0) {
    return NextResponse.json({ error: 'Invoice is already paid in full' }, { status: 400 })
  }
  if (amount > currentBalance + 0.005) {
    return NextResponse.json({ error: 'Payment exceeds the balance due' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const history = [
    ...existing,
    {
      id: crypto.randomUUID(),
      milestone_name: body.milestone_name ?? 'Payment',
      amount: Math.round(amount * 100) / 100,
      method: body.method ?? 'other',
      reference: body.reference ?? '',
      date: body.date ?? now.slice(0, 10),
      recorded_at: now,
    },
  ]

  const balances = computeInvoiceBalances({
    total,
    payment_history: history,
    current_status: inv.status,
    current_paid_at: inv.paid_at,
    now,
  })

  const { data: updated, error: updErr } = await sb
    .from('invoices')
    .update({
      payment_history: history,
      amount_paid: balances.amount_paid,
      balance_due: balances.balance_due,
      status: balances.status,
      paid_at: balances.paid_at,
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single()
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // ── Paid in full → side effects (mirror the PATCH path exactly) ──────────
  if (balances.status === 'paid') {
    if (inv.lead_id) {
      const { data: leadRow } = await sb
        .from('leads').select('lead_status, pro_id').eq('id', inv.lead_id).single()
      if (leadRow) {
        const { data: proRow } = await sb
          .from('pros').select('trade_slug').eq('id', leadRow.pro_id).single()
        const anchors = getStageAnchors(proRow?.trade_slug)
        const terminal = [anchors.won, anchors.lost ?? 'lost', 'unqualified']
        if (!terminal.includes(leadRow.lead_status)) {
          await sb.from('leads')
            .update({ lead_status: anchors.won, lead_status_changed_at: now })
            .eq('id', inv.lead_id)
        }
      }
    }
    if (inv.estimate_id) {
      const { data: estRow } = await sb
        .from('estimates').select('invoiced_at').eq('id', inv.estimate_id).single()
      await sb.from('estimates')
        .update({ status: 'paid', paid_at: now, invoiced_at: estRow?.invoiced_at ?? now })
        .eq('id', inv.estimate_id)
    }
  }

  // ── Write activity feed event — every roofer-recorded payment ────────────
  // The homeowner pay-milestone route already does this; this path was missing
  // it, so roofer/mobile offline payments never appeared in the activity feed.
  if (inv.lead_id) {
    await sb.from('pipeline_events').insert({
      lead_id:    inv.lead_id,
      pro_id:     inv.pro_id,
      event_type: 'payment_received',
      event_data: {
        milestone:   body.milestone_name ?? 'Payment',
        amount:      Math.round(amount * 100) / 100,
        method:      body.method ?? 'other',
        balance_due: balances.balance_due,
        invoice_id:  id,
      },
      actor_type: 'pro',
      created_at: now,
    })
  }

  return NextResponse.json({ invoice: updated })
}
