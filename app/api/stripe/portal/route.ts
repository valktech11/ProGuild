import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-04-22.dahlia' })
}

// Creates a Stripe Billing Portal session for an EXISTING subscriber to manage
// or cancel their plan. Pairs with /api/stripe/checkout (which creates new
// subscriptions) — this route is for pros who already have a stripe_customer_id.
export async function POST(req: NextRequest) {
  const { pro_id } = await req.json()
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data: pro } = await getSupabaseAdmin()
    .from('pros').select('id, stripe_customer_id, plan_tier').eq('id', pro_id).single()
  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  if (!pro.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account yet — upgrade to a paid plan first.' }, { status: 400 })
  }

  const stripe = getStripe()
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://proguild.ai'

  const session = await stripe.billingPortal.sessions.create({
    customer:   pro.stripe_customer_id,
    return_url: `${baseUrl}/dashboard/settings`,
  })

  return NextResponse.json({ url: session.url })
}
