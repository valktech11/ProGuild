import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// POST /api/stripe/connect/onboard
// Creates a Stripe Express account (if none exists) and returns an Account Link URL.
// The pro is redirected to Stripe-hosted onboarding; on return, their
// stripe_onboarding_status is updated via the account.updated webhook.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const auth = await requirePro(req, body.pro_id)
  if (auth.error || !auth.proId) return auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = auth.proId

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })
  const sb     = getSupabaseAdmin()

  // Load pro to check existing account
  const { data: pro } = await sb
    .from('pros')
    .select('id, full_name, business_name, stripe_account_id, stripe_onboarding_status')
    .eq('id', proId)
    .single()

  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  // Get email from auth.users via admin client
  const { data: authUser } = await sb.auth.admin.getUserById(auth.authUserId ?? '')
  const email = authUser?.user?.email ?? undefined

  let accountId = pro.stripe_account_id as string | null

  if (!accountId) {
    // Create a new Express account
    const account = await stripe.accounts.create({
      type:    'express',
      country: 'US',
      email:   email,
      business_profile: {
        name: pro.business_name ?? pro.full_name ?? undefined,
        mcc:  '1761', // Roofing, Siding, Sheet Metal Work
      },
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
    })
    accountId = account.id

    await sb.from('pros').update({
      stripe_account_id:        accountId,
      stripe_onboarding_status: 'pending',
      updated_at:               new Date().toISOString(),
    }).eq('id', proId)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

  // Generate Account Link — valid for 5 minutes
  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${appUrl}/dashboard/settings?stripe_connect=refresh`,
    return_url:  `${appUrl}/dashboard/settings?stripe_connect=return`,
    type:        'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}
