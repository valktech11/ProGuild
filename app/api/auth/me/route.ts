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
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

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

  // Verify the token → get the auth user
  const authClient = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)

  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const authUser = userData.user

  // Look up the pro linked to this auth user
  const admin = getSupabaseAdmin()
  const { data: pro, error: proErr } = await admin
    .from('pros')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  if (proErr) {
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

  return NextResponse.json({
    session: {
      id:         pro.id,
      name:       pro.full_name,
      email:      pro.email,
      plan:       pro.plan_tier,
      trade:      (pro.trade_category as any)?.category_name || null,
      trade_slug: (pro as any).trade_slug || (pro.trade_category as any)?.slug || null,
      city:       pro.city,
      state:      pro.state,
      slug:       pro.slug || null,
    },
    needsProfile: false,
  })
}
