// app/api/auth/complete-profile/route.ts
// For users who are ALREADY authenticated (e.g. signed in with Google) but have no
// pros record yet. Creates + links a new pros row to their existing auth identity.
//
// Difference from /api/auth/signup:
//   - signup:           creates the auth user AND the pros row (email+password path)
//   - complete-profile: auth user already exists (Google) — only creates+links the pros row
//
// Auth: caller sends their Supabase access token (Bearer). We verify it, then build
// the pros record from the form fields they submitted.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateSlugCandidates } from '@/lib/slug'

function getUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}

export async function POST(req: NextRequest) {
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

  const body = await req.json()
  const { full_name, phone, trade_category_id, state, city, years_experience } = body

  if (!trade_category_id) return NextResponse.json({ error: 'Trade is required' }, { status: 400 })
  if (!state)            return NextResponse.json({ error: 'State is required' }, { status: 400 })

  const admin = getSupabaseAdmin()

  // Guard: if this auth user already has a pros row, return it (idempotent)
  const { data: existing } = await admin
    .from('pros')
    .select('*, trade_category:trade_categories(category_name, slug)')
    .eq('auth_user_id', authUser.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: true, pro: existing, alreadyExisted: true })
  }

  // Name: prefer what they typed, else Google's name, else email prefix
  const name =
    (full_name && full_name.trim()) ||
    (authUser.user_metadata?.full_name as string) ||
    (authUser.user_metadata?.name as string) ||
    (authUser.email?.split('@')[0] ?? 'New Pro')

  // Unique slug
  let slug: string | null = null
  const candidates = generateSlugCandidates({
    fullName: name, trade: null, city: city || null, state: state || null, licenseNumber: null,
  })
  for (const c of candidates) {
    const { data: taken } = await admin.from('pros').select('id').eq('slug', c).maybeSingle()
    if (!taken) { slug = c; break }
  }
  if (!slug) slug = `${candidates[0]}-${Date.now().toString(36)}`

  const { data: pro, error: insErr } = await admin
    .from('pros')
    .insert({
      auth_user_id:      authUser.id,
      full_name:         name,
      email:             authUser.email,
      phone:             phone || null,
      trade_category_id,
      state:             state || null,
      city:              city || null,
      years_experience:  years_experience || null,
      slug,
      is_claimed:        true,
      claimed_at:        new Date().toISOString(),
      is_verified:       false,   // license verified in background later
    })
    .select('*, trade_category:trade_categories(category_name, slug)')
    .single()

  if (insErr || !pro) {
    return NextResponse.json({ error: insErr?.message || 'Could not create profile' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pro, alreadyExisted: false })
}
