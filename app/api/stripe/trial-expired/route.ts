// app/api/stripe/trial-expired/route.ts
//
// Finds pros whose trial expired in the last 24 hours and sends them a
// "subscribe to keep your leads" email via Resend.
//
// Secured with CRON_SECRET (same pattern as any internal cron endpoint).
// Can also be triggered manually via POST for a specific pro_id.
//
// Usage (cron, daily):
//   POST /api/stripe/trial-expired
//   Authorization: Bearer <CRON_SECRET>
//
// Usage (manual, single pro):
//   POST /api/stripe/trial-expired
//   Authorization: Bearer <CRON_SECRET>
//   Body: { "pro_id": "..." }

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendTrialExpiredEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const sb   = getSupabaseAdmin()

  // Optional: target a single pro for manual testing
  if (body.pro_id) {
    const { data: pro } = await sb
      .from('pros')
      .select('id, full_name, email, trade_slug, trial_ends_at, plan_tier')
      .eq('id', body.pro_id)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

    const isPaid = pro.plan_tier === 'Pro' || pro.plan_tier === 'Elite'
    if (isPaid) return NextResponse.json({ skipped: 'already paid' })

    await sendTrialExpiredEmail({
      proName:    pro.full_name,
      proEmail:   pro.email,
      tradeLabel: pro.trade_slug === 'roofing' ? 'Roofing' : 'Trades',
    })
    return NextResponse.json({ sent: 1, pro_id: pro.id })
  }

  // Batch: pros whose trial expired within the last 24 hours and are still Free
  const now        = new Date()
  const yesterday  = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: expiredPros, error } = await sb
    .from('pros')
    .select('id, full_name, email, trade_slug, trial_ends_at, plan_tier')
    .is('is_claimed', true)
    .not('email', 'is', null)
    .lte('trial_ends_at', now.toISOString())
    .gte('trial_ends_at', yesterday.toISOString())
    .in('plan_tier', ['Free', null])

  if (error) {
    console.error('[trial-expired] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pros = expiredPros || []
  let sent = 0
  const errors: string[] = []

  for (const pro of pros) {
    try {
      await sendTrialExpiredEmail({
        proName:    pro.full_name,
        proEmail:   pro.email,
        tradeLabel: pro.trade_slug === 'roofing' ? 'Roofing' : 'Trades',
      })
      sent++
    } catch (e: any) {
      console.error('[trial-expired] email failed for', pro.id, e?.message)
      errors.push(pro.id)
    }
  }

  console.log(`[trial-expired] sent=${sent} errors=${errors.length} total=${pros.length}`)
  return NextResponse.json({ sent, errors: errors.length, total: pros.length })
}
