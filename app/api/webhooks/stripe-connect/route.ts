import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recordCheckoutPayment } from '@/lib/stripe/recordCheckoutPayment'

// POST /api/webhooks/stripe-connect
// Handles Connect account events:
//   account.updated             → sync stripe_charges_enabled / onboarding_status
//   checkout.session.completed  → record payment (fired for Connect direct charges)
//
// Uses STRIPE_CONNECT_WEBHOOK_SECRET (separate from platform webhook secret).

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  const secret    = process.env.STRIPE_CONNECT_WEBHOOK_SECRET

  if (!secret) {
    console.warn('[webhooks/stripe-connect] STRIPE_CONNECT_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (err: any) {
    console.error('[webhooks/stripe-connect] Signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // ── account.updated — sync Connect onboarding status ──────────────────────
  if (event.type === 'account.updated') {
    const account        = event.data.object as Stripe.Account
    const accountId      = account.id
    const chargesEnabled = account.charges_enabled ?? false
    const newStatus: string = chargesEnabled
      ? 'active'
      : account.details_submitted
        ? 'restricted'
        : 'pending'

    const { error } = await sb
      .from('pros')
      .update({
        stripe_charges_enabled:   chargesEnabled,
        stripe_onboarding_status: newStatus,
        updated_at:               new Date().toISOString(),
      })
      .eq('stripe_account_id', accountId)

    if (error) {
      console.error('[webhooks/stripe-connect] DB update failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[webhooks/stripe-connect] account.updated ${accountId} → charges_enabled=${chargesEnabled} status=${newStatus}`)
    return NextResponse.json({ ok: true, type: event.type })
  }

  // ── checkout.session.completed — record payment ────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const result  = await recordCheckoutPayment(session, sb)

    if (!result.ok && result.error && result.error !== 'Missing metadata') {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const { ok: _ok, ...rest } = result
    return NextResponse.json({ ok: true, ...rest })
  }

  return NextResponse.json({ ok: true, skipped: event.type })
}
