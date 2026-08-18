import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/invoices/stripe/checkout
// Creates a Stripe Checkout Session as a DIRECT CHARGE to the pro's connected
// Stripe Express account. Funds land in the roofer's account directly —
// ProGuild never holds homeowner funds (no money transmitter exposure).
//
// Platform fee: STRIPE_PLATFORM_FEE_BPS env var (basis points, default 0).
// Stripe processing fee (2.9% + 30¢) is borne by the roofer — disclosed
// to the roofer at Connect onboarding time in Settings.
//
// Gating: 503 if pro has no stripe_account_id or charges_enabled = false.

export async function POST(req: NextRequest) {
  const { invoice_id, milestone_name, amount, success_url, cancel_url } = await req.json()

  if (!invoice_id || !milestone_name || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })
  const sb     = getSupabaseAdmin()

  // Fetch invoice + pro in one query
  const { data: inv } = await sb
    .from('invoices')
    .select('invoice_number, lead_name, contact_name, contact_email, pro_id')
    .eq('id', invoice_id)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Fetch pro — need Connect account + display info
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, business_name, stripe_account_id, stripe_charges_enabled')
    .eq('id', inv.pro_id)
    .single()

  // Gate: pro must have an active Connect account
  if (!pro?.stripe_account_id || !pro?.stripe_charges_enabled) {
    return NextResponse.json(
      { error: 'Card payments not available — contractor has not connected their Stripe account.' },
      { status: 503 }
    )
  }

  const clientName = inv.contact_name || inv.lead_name || 'Homeowner'
  const proName    = pro.business_name ?? pro.full_name ?? 'Your Contractor'
  const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

  // Platform fee in basis points (0 = no platform fee; change via env var, no deploy needed)
  const feeBps       = parseInt(process.env.STRIPE_PLATFORM_FEE_BPS ?? '0', 10)
  const amountCents  = Math.round(amount * 100)
  const feeCents     = feeBps > 0 ? Math.round(amountCents * feeBps / 10000) : 0

  // Direct charge to the roofer's Express account
  const session = await stripe.checkout.sessions.create(
    {
      mode:                 'payment',
      payment_method_types: ['card'],
      customer_email:       inv.contact_email ?? undefined,
      line_items: [{
        price_data: {
          currency:     'usd',
          unit_amount:  amountCents,
          product_data: {
            name:        `${milestone_name} — Invoice #${inv.invoice_number}`,
            description: `${proName} · Services for ${clientName}`,
          },
        },
        quantity: 1,
      }],
      ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
      metadata: {
        invoice_id,
        milestone_name,
        amount:      String(amount),
        client_name: clientName,
      },
      success_url: success_url ?? `${baseUrl}/invoice/${invoice_id}?paid=${encodeURIComponent(milestone_name)}`,
      cancel_url:  cancel_url  ?? `${baseUrl}/invoice/${invoice_id}?cancelled=1`,
    },
    // Direct charge: all funds go to the roofer's account
    { stripeAccount: pro.stripe_account_id }
  )

  return NextResponse.json({ url: session.url, session_id: session.id })
}
