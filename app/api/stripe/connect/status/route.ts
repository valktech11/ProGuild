import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// GET /api/stripe/connect/status
// Returns the pro's current Stripe Connect state and syncs charges_enabled from Stripe.
// Called by Settings UI on mount + after returning from onboarding.

export async function GET(req: NextRequest) {
  const auth = await requirePro(req, null)
  if (auth.error || !auth.proId) return auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = auth.proId

  const sb = getSupabaseAdmin()
  const { data: pro } = await sb
    .from('pros')
    .select('stripe_account_id, stripe_charges_enabled, stripe_onboarding_status')
    .eq('id', proId)
    .single()

  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  const accountId = pro.stripe_account_id as string | null

  // If no account yet, return early
  if (!accountId) {
    return NextResponse.json({
      stripe_account_id:        null,
      stripe_charges_enabled:   false,
      stripe_onboarding_status: 'not_started',
    })
  }

  // Sync live status from Stripe (catches cases where webhook was delayed)
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (stripeKey) {
    try {
      const stripe  = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })
      const account = await stripe.accounts.retrieve(accountId)

      const chargesEnabled = account.charges_enabled ?? false
      const newStatus: string = chargesEnabled
        ? 'active'
        : account.details_submitted
          ? 'restricted'
          : 'pending'

      // Update DB if anything changed
      if (
        chargesEnabled !== pro.stripe_charges_enabled ||
        newStatus      !== pro.stripe_onboarding_status
      ) {
        await sb.from('pros').update({
          stripe_charges_enabled:   chargesEnabled,
          stripe_onboarding_status: newStatus,
          updated_at:               new Date().toISOString(),
        }).eq('id', proId)
      }

      return NextResponse.json({
        stripe_account_id:        accountId,
        stripe_charges_enabled:   chargesEnabled,
        stripe_onboarding_status: newStatus,
      })
    } catch (err) {
      console.error('[stripe/connect/status] Stripe retrieve failed:', err)
      // Fall through to return cached DB values
    }
  }

  return NextResponse.json({
    stripe_account_id:        accountId,
    stripe_charges_enabled:   pro.stripe_charges_enabled,
    stripe_onboarding_status: pro.stripe_onboarding_status,
  })
}
