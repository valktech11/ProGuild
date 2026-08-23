// app/api/webhooks/stripe/route.ts
// Platform-level Stripe events.
// After multi-user migration: plan_tier / trial_ends_at / stripe_customer_id
// are now authoritative on companies. Writes to companies; pros columns retained
// during migration window but are the fallback (not the source of truth).

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recordCheckoutPayment } from '@/lib/stripe/recordCheckoutPayment'

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

  // ── checkout.session.completed ────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.mode === 'subscription') {
      const proId = session.metadata?.pro_id
      if (proId) {
        // Resolve company for this pro
        const { data: pro } = await sb
          .from('pros')
          .select('company_id')
          .eq('id', proId)
          .single()

        const companyId = pro?.company_id
        const customerId = session.customer as string | null

        if (companyId) {
          await sb.from('companies').update({
            plan_tier:         'Pro',
            trial_ends_at:     null,
            stripe_customer_id: customerId || undefined,
            updated_at:        new Date().toISOString(),
          }).eq('id', companyId)
          console.log(`[webhooks/stripe] Subscription activated — company ${companyId}`)
        } else {
          // Fallback: no company yet (race during signup), write to pros
          console.warn(`[webhooks/stripe] No company for pro ${proId} — writing to pros (fallback)`)
          await sb.from('pros').update({
            plan_tier:     'Pro',
            trial_ends_at: null,
            updated_at:    new Date().toISOString(),
          }).eq('id', proId)
        }
      }
      return NextResponse.json({ ok: true, type: event.type, mode: 'subscription' })
    }

    // One-off payment checkout — invoice recording (unchanged)
    const result = await recordCheckoutPayment(session, sb)
    if (!result.ok && result.error && result.error !== 'Missing metadata') {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    const { ok: _ok, ...rest } = result
    return NextResponse.json({ ok: true, ...rest })
  }

  // ── customer.subscription.created / updated ───────────────────────────────
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated'
  ) {
    const sub = event.data.object as Stripe.Subscription
    if (sub.status === 'active' || sub.status === 'trialing') {
      // Resolve company by stripe_customer_id (now on companies)
      const { data: company } = await sb
        .from('companies')
        .select('id')
        .eq('stripe_customer_id', sub.customer as string)
        .maybeSingle()

      if (company) {
        await sb.from('companies').update({
          plan_tier:     'Pro',
          trial_ends_at: null,
          updated_at:    new Date().toISOString(),
        }).eq('id', company.id)
        console.log(`[webhooks/stripe] Plan activated — company ${company.id}`)
      } else {
        // Fallback: customer not yet on companies (legacy row or race)
        const { data: pro } = await sb
          .from('pros')
          .select('id, company_id')
          .eq('stripe_customer_id', sub.customer as string)
          .maybeSingle()

        if (pro?.company_id) {
          await sb.from('companies').update({
            plan_tier:     'Pro',
            trial_ends_at: null,
            updated_at:    new Date().toISOString(),
          }).eq('id', pro.company_id)
          console.log(`[webhooks/stripe] Plan activated via pros fallback — company ${pro.company_id}`)
        } else if (pro) {
          await sb.from('pros').update({
            plan_tier:  'Pro',
            trial_ends_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', pro.id)
          console.warn(`[webhooks/stripe] No company found — wrote plan to pros ${pro.id}`)
        }
      }
    }
    return NextResponse.json({ ok: true, type: event.type })
  }

  // ── customer.subscription.deleted ────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription

    const { data: company } = await sb
      .from('companies')
      .select('id')
      .eq('stripe_customer_id', sub.customer as string)
      .maybeSingle()

    if (company) {
      await sb.from('companies').update({
        plan_tier:  'Free',
        updated_at: new Date().toISOString(),
      }).eq('id', company.id)
      console.log(`[webhooks/stripe] Downgraded to Free — company ${company.id}`)
    } else {
      // Fallback
      const { data: pro } = await sb
        .from('pros')
        .select('id, company_id')
        .eq('stripe_customer_id', sub.customer as string)
        .maybeSingle()

      if (pro?.company_id) {
        await sb.from('companies').update({
          plan_tier:  'Free',
          updated_at: new Date().toISOString(),
        }).eq('id', pro.company_id)
      } else if (pro) {
        await sb.from('pros').update({ plan_tier: 'Free', updated_at: new Date().toISOString() }).eq('id', pro.id)
      }
    }
    return NextResponse.json({ ok: true, type: event.type })
  }

  return NextResponse.json({ ok: true, skipped: event.type })
}
