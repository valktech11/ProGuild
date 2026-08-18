import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recordCheckoutPayment } from '@/lib/stripe/recordCheckoutPayment'

// POST /api/webhooks/stripe
// Handles platform-level Stripe events (subscription billing, etc.).
// checkout.session.completed for PLATFORM charges (no stripeAccount) are also
// handled here for backward compat — though new sessions go through Connect.

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  const secret    = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    console.warn('[webhooks/stripe] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' })

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

  const session = event.data.object as Stripe.Checkout.Session
  const sb      = getSupabaseAdmin()
  const result  = await recordCheckoutPayment(session, sb)

  if (!result.ok && result.error && result.error !== 'Missing metadata') {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const { ok: _ok, ...rest } = result
  return NextResponse.json({ ok: true, ...rest })
}
