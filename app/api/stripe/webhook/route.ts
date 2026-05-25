import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-04-22.dahlia' })
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') || ''
  const secret    = process.env.STRIPE_WEBHOOK_SECRET || ''

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const pro_id   = session.metadata?.pro_id
      const plan_tier = session.metadata?.plan_tier
      if (!pro_id || !plan_tier) break

      // Update pro plan
      await sb.from('pros').update({ plan_tier, stripe_customer_id: session.customer as string }).eq('id', pro_id)

      // Upsert subscription record
      if (session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(session.subscription as string)
        const startDate   = sub.start_date ? new Date(sub.start_date * 1000).toISOString().split('T')[0] : null
        const renewalDate = sub.billing_cycle_anchor ? new Date(sub.billing_cycle_anchor * 1000).toISOString().split('T')[0] : null
        await sb.from('subscriptions').upsert({
          pro_id,
          stripe_sub_id: sub.id,
          plan_name:     plan_tier,
          sub_status:    'Active',
          start_date:    startDate,
          renewal_date:  renewalDate,
          amount_usd:    (sub.items.data[0]?.price?.unit_amount || 0) / 100,
        }, { onConflict: 'pro_id' })
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub    = event.data.object as Stripe.Subscription
      const pro_id = sub.metadata?.pro_id
      if (!pro_id) break

      const plan_tier = sub.metadata?.plan_tier
      const status    = sub.status === 'active' ? 'Active'
        : sub.status === 'canceled'             ? 'Cancelled'
        : sub.status === 'past_due'             ? 'Past_Due'
        : sub.status === 'trialing'             ? 'Trialing'
        : 'Active'

      if (plan_tier) await sb.from('pros').update({ plan_tier }).eq('id', pro_id)
      const renewal = sub.billing_cycle_anchor
        ? new Date(sub.billing_cycle_anchor * 1000).toISOString().split('T')[0]
        : null
      await sb.from('subscriptions').update({
        sub_status:   status,
        ...(renewal ? { renewal_date: renewal } : {}),
      }).eq('stripe_sub_id', sub.id)
      break
    }

    case 'customer.subscription.deleted': {
      const sub    = event.data.object as Stripe.Subscription
      const pro_id = sub.metadata?.pro_id
      if (!pro_id) break

      // Downgrade to Free
      await sb.from('pros').update({ plan_tier: 'Free' }).eq('id', pro_id)
      await sb.from('subscriptions').update({ sub_status: 'Cancelled' }).eq('stripe_sub_id', sub.id)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // In Stripe API 2026+, subscription is accessed via invoice.parent
      const parent = (invoice as any).parent
      const subId = parent?.subscription_details?.subscription
        || (typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : null)
      if (subId) {
        await sb.from('subscriptions').update({ sub_status: 'Past_Due' }).eq('stripe_sub_id', subId)
      }
      break
    }

    default:
      // Unhandled event — log and ignore
      console.log(`Unhandled Stripe event: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
