// app/api/cron/pending-review-promote/route.ts
// Runs daily. Any pros row that has been in Pending_Review for 7+ days
// gets promoted to Active (is_verified stays false — no badge, but full access).
//
// Rationale: the claim model is "let them in, verify as a quality layer."
// Admin inaction should never permanently block a contractor. After 7 days
// of no admin decision and no self-service, we clear them to Active.
// If the claim turns out to be fraudulent, admin can Suspend from the Claims tab.
//
// Auth: Vercel Cron — protected by CRON_SECRET header check.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const DAYS = 7

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DAYS)

  const admin = getSupabaseAdmin()

  // Find rows that have been Pending_Review since before the cutoff
  const { data: stale, error: fetchErr } = await admin
    .from('pros')
    .select('id, full_name, email, claimed_at')
    .eq('profile_status', 'Pending_Review')
    .lt('claimed_at', cutoff.toISOString())

  if (fetchErr) {
    console.error('[cron/pending-review-promote] fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ promoted: 0, message: 'Nothing to promote' })
  }

  const ids = stale.map((p: any) => p.id)

  const { error: updateErr } = await admin
    .from('pros')
    .update({
      profile_status: 'Active',
      updated_at:     new Date().toISOString(),
      // is_verified stays false — they don't get the badge
    })
    .in('id', ids)

  if (updateErr) {
    console.error('[cron/pending-review-promote] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log(`[cron/pending-review-promote] promoted ${ids.length} pros to Active:`, ids)
  return NextResponse.json({ promoted: ids.length, ids })
}
