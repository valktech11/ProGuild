// app/api/stripe/subscription/checkout/route.ts
// Creates a Stripe Checkout Session for a company subscription.
// stripe_customer_id is now authoritative on companies (not pros).

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

const ROOFING_SLUGS = new Set(['roofing', 'roofing-contractor', 'roofer'])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const auth = await requirePro(req, body.pro_id)
  if (auth.error || !auth.proId) return auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (auth.role === 'member') return NextResponse.json({ error: 'Only the company owner can manage billing' }, { status: 403 })
  const { proId, companyId } = auth

  if (!companyId) {
    return NextResponse.json({ error: 'No company found — contact support' }, { status: 400 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const roofingPriceId = process.env.STRIPE_PRICE_ROOFING
  const tradesPriceId  = process.env.STRIPE_PRICE_TRADES
  if (!roofingPriceId || !tradesPriceId) {
    return NextResponse.json({ error: 'Subscription prices not configured' }, { status: 503 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })
  const sb     = getSupabaseAdmin()

  // Load company for billing fields
  const { data: company } = await sb
    .from('companies')
    .select('id, name, trade_slug, stripe_customer_id')
    .eq('id', companyId)
    .single()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  // Load pro for email (stays on pros)
  const { data: authUser } = await sb.auth.admin.getUserById(auth.authUserId ?? '')
  const email = authUser?.user?.email ?? undefined

  const tradeSlug = (company as any).trade_slug as string | null
  const priceId   = ROOFING_SLUGS.has(tradeSlug ?? '') ? roofingPriceId : tradesPriceId

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

  // Reuse or create Stripe customer — keyed on companies.stripe_customer_id
  let customerId = (company as any).stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name:     (company as any).name ?? undefined,
      metadata: { pro_id: proId, company_id: companyId },
    })
    customerId = customer.id
    await sb.from('companies').update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }).eq('id', companyId)
  }

  const session = await stripe.checkout.sessions.create({
    mode:       'subscription',
    customer:    customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata:   { pro_id: proId, company_id: companyId },
    success_url: `${appUrl}/dashboard?subscribed=1`,
    cancel_url:  `${appUrl}/subscribe?cancelled=1`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
