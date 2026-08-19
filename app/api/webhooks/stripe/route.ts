import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recordCheckoutPayment } from '@/lib/stripe/recordCheckoutPayment'

// POST /api/webhooks/stripe
// Handles platform-level Stripe events:
//   checkout.session.completed  → invoice payment recording (legacy / direct charges)
//   customer.subscription.created / updated → activate pro plan, clear trial gate
//   customer.subscription.deleted           → downgrade pro to free

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

  const sb = getSupabaseAdmin()

  // ── Invoice payment (existing flow) ──────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // Subscription checkout — activate plan
    if (session.mode === 'subscription') {
      const proId = session.metadata?.pro_id
      if (proId) {
        await sb.from('pros').update({
          plan_tier:     'Pro',
          trial_ends_at: null,   // clear trial gate — they're now paying
          updated_at:    new Date().toISOString(),
        }).eq('id', proId)
        console.log(`[webhooks/stripe] Subscription activated for pro ${proId}`)
      }
      return NextResponse.json({ ok: true, type: event.type, mode: 'subscription' })
    }

    // One-off payment checkout — invoice recording
    const result = await recordCheckoutPayment(session, sb)
    if (!result.ok && result.error && result.error !== 'Missing metadata') {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    const { ok: _ok, ...rest } = result
    return NextResponse.json({ ok: true, ...rest })
  }

  // ── Subscription activated / renewed ─────────────────────────────────────
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    if (sub.status === 'active' || sub.status === 'trialing') {
      // Look up pro by stripe_customer_id
      const { data: pro } = await sb
        .from('pros')
        .select('id')
        .eq('stripe_customer_id', sub.customer as string)
        .maybeSingle()

      if (pro) {
        await sb.from('pros').update({
          plan_tier:     'Pro',
          trial_ends_at: null,
          updated_at:    new Date().toISOString(),
        }).eq('id', pro.id)
        console.log(`[webhooks/stripe] Plan activated via subscription for pro ${pro.id}`)
      }
    }
    return NextResponse.json({ ok: true, type: event.type })
  }

  // ── Subscription cancelled / expired ─────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const { data: pro } = await sb
      .from('pros')
      .select('id')
      .eq('stripe_customer_id', sub.customer as string)
      .maybeSingle()

    if (pro) {
      await sb.from('pros').update({
        plan_tier:  'Free',
        updated_at: new Date().toISOString(),
      }).eq('id', pro.id)
      console.log(`[webhooks/stripe] Plan downgraded to free for pro ${pro.id}`)
    }
    return NextResponse.json({ ok: true, type: event.type })
  }

  return NextResponse.json({ ok: true, skipped: event.type })
}
