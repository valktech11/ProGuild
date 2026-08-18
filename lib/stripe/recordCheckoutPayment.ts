import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { getStageAnchors } from '@/lib/trades/_registry'
import { resolveClientForLead } from '@/lib/leads/resolveClientForLead'
import { notifyRoofer } from '@/lib/notifyRoofer'

// Shared logic for recording a completed Stripe Checkout payment.
// Called by both the platform webhook (/api/webhooks/stripe) and the
// Connect webhook (/api/webhooks/stripe-connect).

export async function recordCheckoutPayment(
  session: Stripe.Checkout.Session,
  sb: SupabaseClient
): Promise<{ ok: boolean; skipped?: string; status?: string; balance_due?: number; error?: string }> {
  const invoice_id  = session.metadata?.invoice_id
  const milestoneNm = session.metadata?.milestone_name
  const amount      = parseFloat(session.metadata?.amount ?? '0')

  if (!invoice_id || !milestoneNm || !amount) {
    console.error('[recordCheckoutPayment] Missing metadata on session:', session.id)
    return { ok: false, error: 'Missing metadata' }
  }

  const { data: inv } = await sb
    .from('invoices')
    .select('id, status, total, amount_paid, balance_due, payment_history, lead_id, pro_id')
    .eq('id', invoice_id)
    .single()

  if (!inv) {
    console.error('[recordCheckoutPayment] Invoice not found:', invoice_id)
    return { ok: false, error: 'Invoice not found' }
  }

  // Idempotency — skip if this session already recorded
  const existing = (inv.payment_history as any[]) ?? []
  const alreadyRecorded = existing.some(
    (p: any) => p.milestone_name === milestoneNm && p.stripe_session_id === session.id
  )
  if (alreadyRecorded) return { ok: true, skipped: 'duplicate' }

  const newPayment = {
    id:                crypto.randomUUID(),
    milestone_name:    milestoneNm,
    amount,
    method:            'card',
    reference:         (session.payment_intent as string) ?? null,
    stripe_session_id: session.id,
    date:              new Date().toISOString().split('T')[0],
    recorded_at:       new Date().toISOString(),
    source:            'stripe',
  }

  const history    = [...existing, newPayment]
  const totalPaid  = history.reduce((s: number, p: any) => s + Number(p.amount), 0)
  const balanceDue = Math.max(0, Number(inv.total) - totalPaid)
  const newStatus  = balanceDue <= 0 ? 'paid' : 'partial_payment'

  await sb.from('invoices').update({
    payment_history: history,
    amount_paid:     totalPaid,
    balance_due:     balanceDue,
    status:          newStatus,
    paid_at:         balanceDue <= 0 ? new Date().toISOString() : null,
    updated_at:      new Date().toISOString(),
  }).eq('id', invoice_id)

  // Auto-advance lead to won when fully paid
  if (balanceDue <= 0 && inv.lead_id) {
    const { data: leadRow } = await sb
      .from('leads').select('lead_status, pro_id').eq('id', inv.lead_id).single()
    if (leadRow) {
      const { data: proRow } = await sb
        .from('pros').select('trade_slug').eq('id', leadRow.pro_id ?? inv.pro_id).single()
      const anchors  = getStageAnchors(proRow?.trade_slug)
      const terminal = [anchors.won, anchors.lost ?? 'lost', 'unqualified']
      if (!terminal.includes(leadRow.lead_status)) {
        await sb.from('leads').update({
          lead_status:            anchors.won,
          lead_status_changed_at: new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        }).eq('id', inv.lead_id)
      }
      await resolveClientForLead(sb, inv.lead_id, leadRow.pro_id ?? inv.pro_id)
    }
  }

  // Write pipeline_event for activity feed
  if (inv.lead_id) {
    await sb.from('pipeline_events').insert({
      lead_id:    inv.lead_id,
      pro_id:     inv.pro_id,
      event_type: 'payment_received',
      event_data: {
        milestone:   milestoneNm,
        amount,
        method:      'card',
        balance_due: balanceDue,
        invoice_id,
      },
      actor_type: 'homeowner',
      created_at: new Date().toISOString(),
    })
  }

  // Notify roofer
  const { data: invForNotif } = await sb
    .from('invoices')
    .select('pro_id, lead_id, lead_name, invoice_number, balance_due')
    .eq('id', invoice_id)
    .maybeSingle()

  if (invForNotif) {
    const amtFmt   = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    const balFmt   = `$${Math.max(balanceDue, 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    const isPaidFull = balanceDue <= 0
    await notifyRoofer({
      proId:    invForNotif.pro_id,
      subject:  isPaidFull
        ? `💰 Invoice paid in full — ${invForNotif.lead_name}`
        : `💳 Payment received — ${invForNotif.lead_name}`,
      headline: isPaidFull ? 'Invoice Paid in Full' : 'Payment Received',
      body: isPaidFull
        ? `${invForNotif.lead_name} has paid invoice ${invForNotif.invoice_number} in full (${amtFmt}). The job is complete.`
        : `${invForNotif.lead_name} paid ${amtFmt} (${milestoneNm}). Balance remaining: ${balFmt}.`,
      leadId: invForNotif.lead_id,
      sb,
    })
  }

  console.log(`[recordCheckoutPayment] ✓ ${milestoneNm} $${amount} recorded for invoice ${invoice_id}`)
  return { ok: true, status: newStatus, balance_due: balanceDue }
}
