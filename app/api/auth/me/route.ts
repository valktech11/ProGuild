// app/api/auth/me/route.ts
// Given the logged-in Supabase auth user (via their access token), return their
// `pros` record shaped as the existing Session object every page already expects.
//
// This is the bridge: Supabase Auth identity  →  pros record  →  Session.
// The link is pros.auth_user_id = auth.users.id (the column you just added).
//
// Flow:
//   1. Client sends its Supabase access token (Authorization: Bearer <token>)
//   2. We verify it and get the auth user
//   3. Look up the pros row WHERE auth_user_id = user.id
//   4. Return it as a Session (same shape as the old fake auth)

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifySupabaseToken } from '@/lib/pro-auth'

function getUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}

export async function GET(req: NextRequest) {
  // Extract the bearer token the browser client sends
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Verify the token locally (HS256, SUPABASE_JWT_SECRET) — no auth-API RTT.
  const verified = await verifySupabaseToken(token)
  if (!verified) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const authUser = { id: verified.userId, email: verified.email }

  // Look up the pro linked to this auth user
  const admin = getSupabaseAdmin()
  const { data: pro, error: proErr } = await admin
    .from('pros')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  if (proErr) {
    // console.error survives Vercel Hobby log filter (console.log is stripped).
    // Previously this 500'd silently — the Supabase error was swallowed, making
    // cold-start 500s (paused DB, pool exhaustion, schema issues) undiagnosable.
    console.error('[auth/me] pros lookup failed', proErr)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }

  // No linked pro yet — the user authenticated but hasn't claimed/created a profile.
  // The client uses this signal to route them to claim/onboarding.
  if (!pro) {
    return NextResponse.json({
      session: null,
      authUser: { id: authUser.id, email: authUser.email },
      needsProfile: true,
    })
  }

  if (pro.profile_status === 'Suspended') {
    return NextResponse.json({ error: 'Account suspended — contact support' }, { status: 403 })
  }

  // Self-heal: if trade_slug missing on pros row (accounts created before this
  // was written at registration), backfill it from trade_category join.
  // Fire-and-forget — never blocks the response.
  const resolvedTradeSlug = (pro as any).trade_slug || (pro.trade_category as any)?.slug || null
  if (!(pro as any).trade_slug && resolvedTradeSlug) {
    void admin.from('pros').update({ trade_slug: resolvedTradeSlug }).eq('id', pro.id)
  }

  return NextResponse.json({
    session: {
      id:             pro.id,
      name:           pro.full_name,
      email:          pro.email,
      plan:           pro.plan_tier,
      trial_ends_at:  (pro as any).trial_ends_at ?? null,
      trade:          (pro.trade_category as any)?.category_name || null,
      trade_slug:     (pro as any).trade_slug || (pro.trade_category as any)?.slug || null,
      city:           pro.city,
      state:          pro.state,
      slug:           pro.slug || null,
      profile_status: pro.profile_status,
      is_verified:    pro.is_verified,
    },
    needsProfile: false,
  })
}
