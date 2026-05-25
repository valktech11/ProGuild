import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/invoices/stripe/checkout
// Creates a Stripe Checkout Session for a specific milestone payment
// Returns { url } — redirect homeowner to this URL

export async function POST(req: NextRequest) {
  const { invoice_id, milestone_name, amount, success_url, cancel_url } = await req.json()

  if (!invoice_id || !milestone_name || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-04-30.basil' })
  const sb     = getSupabaseAdmin()

  // Fetch invoice for display info
  const { data: inv } = await sb
    .from('invoices')
    .select('invoice_number, lead_name, contact_name, contact_email, pro_id')
    .eq('id', invoice_id)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Fetch pro for display
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, business_name')
    .eq('id', inv.pro_id)
    .single()

  const clientName = inv.contact_name || inv.lead_name || 'Homeowner'
  const proName    = pro?.business_name ?? pro?.full_name ?? 'Your Contractor'
  const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

  const session = await stripe.checkout.sessions.create({
    mode:                'payment',
    payment_method_types: ['card'],
    customer_email:       inv.contact_email ?? undefined,
    line_items: [{
      price_data: {
        currency:     'usd',
        unit_amount:  Math.round(amount * 100), // cents
        product_data: {
          name:        `${milestone_name} — Invoice #${inv.invoice_number}`,
          description: `${proName} · Roofing services for ${clientName}`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      invoice_id,
      milestone_name,
      amount:     String(amount),
      client_name: clientName,
    },
    success_url: success_url ?? `${baseUrl}/invoice/${invoice_id}?paid=${encodeURIComponent(milestone_name)}`,
    cancel_url:  cancel_url  ?? `${baseUrl}/invoice/${invoice_id}?cancelled=1`,
  })

  return NextResponse.json({ url: session.url, session_id: session.id })
}
