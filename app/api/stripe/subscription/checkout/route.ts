import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// POST /api/stripe/subscription/checkout
// Creates a Stripe Checkout Session for a pro subscription.
// Price is determined by trade_slug — roofing gets $49.99, all others $29.99.
// No card required during trial — this is called when trial expires.

const ROOFING_SLUGS = new Set(['roofing', 'roofing-contractor', 'roofer'])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const auth = await requirePro(req, body.pro_id)
  if (auth.error || !auth.proId) return auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = auth.proId

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const roofingPriceId = process.env.STRIPE_PRICE_ROOFING
  const tradesPriceId  = process.env.STRIPE_PRICE_TRADES
  if (!roofingPriceId || !tradesPriceId) {
    return NextResponse.json({ error: 'Subscription prices not configured' }, { status: 503 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })
  const sb     = getSupabaseAdmin()

  const { data: pro } = await sb
    .from('pros')
    .select('id, full_name, business_name, trade_slug, stripe_customer_id')
    .eq('id', proId)
    .single()

  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  // Get email from auth.users
  const { data: authUser } = await sb.auth.admin.getUserById(auth.authUserId ?? '')
  const email = authUser?.user?.email ?? undefined

  const tradeSlug = (pro as any).trade_slug as string | null
  const priceId   = ROOFING_SLUGS.has(tradeSlug ?? '') ? roofingPriceId : tradesPriceId

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

  // Reuse existing Stripe customer or create new one
  let customerId = (pro as any).stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name:     (pro as any).business_name ?? pro.full_name ?? undefined,
      metadata: { pro_id: proId },
    })
    customerId = customer.id
    await sb.from('pros').update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }).eq('id', proId)
  }

  const session = await stripe.checkout.sessions.create({
    mode:       'subscription',
    customer:    customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata:   { pro_id: proId },
    success_url: `${appUrl}/dashboard?subscribed=1`,
    cancel_url:  `${appUrl}/subscribe?cancelled=1`,
    allow_promotion_codes: true, // lets you apply coupons manually if needed
  })

  return NextResponse.json({ url: session.url })
}
