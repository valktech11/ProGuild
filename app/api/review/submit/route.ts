// POST /api/review/submit
// Public — no auth. Token is the auth mechanism.
// Body: { token, rating, feedback? }

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { token, rating, feedback } = await req.json()

  if (!token || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const { data: rr, error } = await sb
    .from('review_requests')
    .select('id, status')
    .eq('token', token)
    .single()

  if (error || !rr) {
    return NextResponse.json({ error: 'Review request not found' }, { status: 404 })
  }

  await sb.from('review_requests').update({
    rating,
    review_text: feedback ?? null,
    status:      'rated',
    responded_at: new Date().toISOString(),
    rated_at:    new Date().toISOString(),
    sent_to_google: rating >= 4,
  }).eq('id', rr.id)

  return NextResponse.json({ ok: true })
}
