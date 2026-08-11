// app/api/auth/reverify/route.ts
// Allows a Pending_Review contractor to re-submit their license details and
// self-serve their way to verified status without admin intervention.
//
// Security boundary: the caller must be the owner of the pros row
// (auth_user_id must match the verified Supabase session).
//
// Flow:
//   1. Verify the bearer token → get auth user id
//   2. Load the pros row WHERE auth_user_id = that id (ownership proof)
//   3. Re-run the exact same normLic + expiry compare as signup
//   4a. Match  → is_verified=true, profile_status='Active'
//   4b. No match → return { verified: false } — no change, let them try again

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

function getUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}

const normLic = (s: string | null | undefined) =>
  (s || '').replace(/\s+/g, '').toUpperCase()

export async function POST(req: NextRequest) {
  // 1. Authenticate caller
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const authClient = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const authUserId = userData.user.id

  // 2. Load caller's own pros row (ownership proof + stored DBPR values)
  const admin = getSupabaseAdmin()
  const { data: pro, error: proErr } = await admin
    .from('pros')
    .select('id, license_number, license_expiry_date, profile_status, is_verified')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (proErr || !pro) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Only worth running if they're actually pending
  if (pro.profile_status !== 'Pending_Review') {
    return NextResponse.json({ verified: pro.is_verified, alreadyActive: true })
  }

  // 3. Parse submitted values
  const body = await req.json()
  const { license_number, license_expiry } = body as {
    license_number: string
    license_expiry: string   // YYYY-MM-DD
  }

  if (!license_number || !license_expiry) {
    return NextResponse.json({ error: 'license_number and license_expiry are required' }, { status: 400 })
  }

  // 4. Same soft compare as signup
  const licMatch = !!pro.license_number &&
    normLic(license_number) === normLic(pro.license_number)
  const expMatch = !!pro.license_expiry_date &&
    license_expiry.slice(0, 10) === String(pro.license_expiry_date).slice(0, 10)

  const verified = licMatch && expMatch

  if (!verified) {
    return NextResponse.json({ verified: false })
  }

  // 5. Match — flip to Active + verified
  const { error: updateErr } = await admin
    .from('pros')
    .update({
      is_verified:    true,
      profile_status: 'Active',
      updated_at:     new Date().toISOString(),
    })
    .eq('id', pro.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ verified: true })
}
