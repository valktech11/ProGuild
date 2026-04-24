import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-03-25.dahlia' })
}

// Price IDs — create these in your Stripe dashboard and set as env vars
// Format: price_xxxxxxxxxxxxxxxxxxxx
const PRICE_IDS: Record<string, string> = {
  Pro_Founding:         process.env.STRIPE_PRICE_PRO_FOUNDING         || 'price_pro_founding_placeholder',
  Elite_Founding:       process.env.STRIPE_PRICE_ELITE_FOUNDING       || 'price_elite_founding_placeholder',
  Pro_Founding_Annual:  process.env.STRIPE_PRICE_PRO_FOUNDING_ANNUAL  || 'price_pro_founding_annual_placeholder',
  Elite_Founding_Annual:process.env.STRIPE_PRICE_ELITE_FOUNDING_ANNUAL|| 'price_elite_founding_annual_placeholder',
  Pro:                  process.env.STRIPE_PRICE_PRO                  || 'price_pro_placeholder',
  Elite:                process.env.STRIPE_PRICE_ELITE                || 'price_elite_placeholder',
  Pro_Annual:           process.env.STRIPE_PRICE_PRO_ANNUAL           || 'price_pro_annual_placeholder',
  Elite_Annual:         process.env.STRIPE_PRICE_ELITE_ANNUAL         || 'price_elite_annual_placeholder',
}

export async function POST(req: NextRequest) {
  const { pro_id, plan_tier } = await req.json()

  if (!pro_id || !plan_tier) {
    return NextResponse.json({ error: 'pro_id and plan_tier required' }, { status: 400 })
  }

  const priceId = PRICE_IDS[plan_tier]
  if (!priceId || priceId.includes('placeholder')) {
    return NextResponse.json({ error: 'Stripe not configured — add price IDs to Vercel env vars' }, { status: 503 })
  }

  // Get pro details
  const { data: pro } = await getSupabaseAdmin()
    .from('pros').select('id, email, full_name, stripe_customer_id').eq('id', pro_id).single()
  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  const stripe = getStripe()
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://proguild.ai'

  // Create or reuse Stripe customer
  let customerId = pro.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: pro.email,
      name:  pro.full_name,
      metadata: { pro_id },
    })
    customerId = customer.id
    await getSupabaseAdmin().from('pros').update({ stripe_customer_id: customerId }).eq('id', pro_id)
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price:    priceId,
      quantity: 1,
    }],
    success_url: `${baseUrl}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/upgrade`,
    metadata: { pro_id, plan_tier },
    subscription_data: {
      metadata: { pro_id, plan_tier },
    },
  })

  return NextResponse.json({ url: session.url })
}
