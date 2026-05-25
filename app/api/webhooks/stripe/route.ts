import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'

// Stripe sends: checkout.session.completed when payment succeeds
// We: record the milestone payment, update invoice, advance lead stage

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  const secret    = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    console.warn('[webhooks/stripe] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (err: any) {
    console.error('[webhooks/stripe] Signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ ok: true, skipped: event.type })
  }

  const session       = event.data.object as Stripe.Checkout.Session
  const invoice_id    = session.metadata?.invoice_id
  const milestoneNm   = session.metadata?.milestone_name
  const amount        = parseFloat(session.metadata?.amount ?? '0')

  if (!invoice_id || !milestoneNm || !amount) {
    console.error('[webhooks/stripe] Missing metadata on session:', session.id)
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: inv } = await sb
    .from('invoices')
    .select('id, status, total, amount_paid, balance_due, payment_history, lead_id, pro_id')
    .eq('id', invoice_id)
    .single()

  if (!inv) {
    console.error('[webhooks/stripe] Invoice not found:', invoice_id)
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Idempotency — skip if this milestone already recorded
  const existing = (inv.payment_history as any[]) ?? []
  const alreadyRecorded = existing.some(
    p => p.milestone_name === milestoneNm && p.stripe_session_id === session.id
  )
  if (alreadyRecorded) return NextResponse.json({ ok: true, skipped: 'duplicate' })

  const newPayment = {
    id:               crypto.randomUUID(),
    milestone_name:   milestoneNm,
    amount,
    method:           'card',
    reference:        session.payment_intent as string ?? null,
    stripe_session_id: session.id,
    date:             new Date().toISOString().split('T')[0],
    recorded_at:      new Date().toISOString(),
    source:           'stripe',
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

  // Auto-advance lead to job_won when fully paid
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
    }
  }

  console.log(`[webhooks/stripe] ✓ ${milestoneNm} $${amount} recorded for invoice ${invoice_id}`)
  return NextResponse.json({ ok: true, status: newStatus, balance_due: balanceDue })
}
