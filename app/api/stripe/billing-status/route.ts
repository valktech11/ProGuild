// GET /api/stripe/billing-status
// Returns current subscription status, trial info, and payment history for the pro.
// Used by the Settings page billing section and mobile profile.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-04-22.dahlia' })
}

export async function GET(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId, companyId } = auth

  const sb = getSupabaseAdmin()

  // Get company (authoritative for plan/trial/stripe_customer_id)
  const { data: company } = await sb
    .from('companies')
    .select('id, plan_tier, trial_ends_at, stripe_customer_id')
    .eq('id', companyId)
    .single()

  const { data: pro } = await sb
    .from('pros')
    .select('plan_tier, trial_ends_at, stripe_customer_id')
    .eq('id', proId)
    .single()

  // Resolve values — company is authoritative, pros is fallback
  const planTier      = company?.plan_tier        ?? pro?.plan_tier        ?? 'Free'
  const trialEndsAt   = company?.trial_ends_at    ?? pro?.trial_ends_at    ?? null
  const customerId    = company?.stripe_customer_id ?? pro?.stripe_customer_id ?? null

  const now = new Date()
  const trialDate = trialEndsAt ? new Date(trialEndsAt) : null
  const trialActive = trialDate ? trialDate > now : false
  const trialDaysLeft = trialDate && trialActive
    ? Math.ceil((trialDate.getTime() - now.getTime()) / 86400000)
    : 0

  // Base response — no Stripe customer yet
  const base = {
    plan_tier:        planTier,
    trial_ends_at:    trialEndsAt,
    trial_active:     trialActive,
    trial_days_left:  trialDaysLeft,
    is_paid:          planTier === 'Pro' || planTier === 'Elite',
    stripe_customer_id: customerId,
    // Stripe subscription details (populated below if customer exists)
    subscription:     null as null | {
      status:             string
      current_period_end: number
      cancel_at_period_end: boolean
      amount:             number
      currency:           string
      interval:           string
    },
    invoices: [] as {
      id:          string
      number:      string | null
      amount_paid: number
      currency:    string
      status:      string
      created:     number
      invoice_pdf: string | null
      hosted_url:  string | null
    }[],
  }

  if (!customerId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(base)
  }

  try {
    const stripe = getStripe()

    // Fetch active subscription
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status:   'all',
      limit:    1,
      expand:   ['data.default_payment_method'],
    })

    const sub = subs.data[0]
    if (sub) {
      const item = sub.items.data[0]
      const subAny = sub as any
      base.subscription = {
        status:               sub.status,
        current_period_end:   subAny.current_period_end ?? subAny.billing_cycle_anchor ?? 0,
        cancel_at_period_end: subAny.cancel_at_period_end ?? false,
        amount:               item?.price?.unit_amount ?? 0,
        currency:             item?.price?.currency ?? 'usd',
        interval:             item?.price?.recurring?.interval ?? 'month',
      }
    }

    // Fetch last 12 invoices
    const invoiceList = await stripe.invoices.list({
      customer: customerId,
      limit:    12,
    })

    base.invoices = invoiceList.data.map((inv: Stripe.Invoice) => ({
      id:          inv.id,
      number:      inv.number,
      amount_paid: inv.amount_paid,
      currency:    inv.currency,
      status:      inv.status ?? 'unknown',
      created:     inv.created,
      invoice_pdf: inv.invoice_pdf ?? null,
      hosted_url:  inv.hosted_invoice_url ?? null,
    }))

  } catch (e: any) {
    console.error('[billing-status] Stripe error:', e?.message)
    // Return base data without Stripe details — don't fail entirely
  }

  return NextResponse.json(base)
}
