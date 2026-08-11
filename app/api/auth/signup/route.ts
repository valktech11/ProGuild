// app/api/auth/signup/route.ts
// Creates a REAL account: a Supabase auth user (email+password) linked to a pros record.
//
// Two cases handled:
//   A. Brand-new contractor (not in our 130K) → create auth user + create new pros row
//   B. Existing unclaimed pros row being claimed → create auth user + link to that row
//
// The link is pros.auth_user_id = <new auth user id>.
//
// Verification (license #) is enforced by the CLAIM flow, not here. This route is the
// account-creation primitive both paths call.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateSlugCandidates } from '@/lib/slug'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    email,
    password,
    full_name,
    phone,
    trade_category_id,
    state,
    city,
    years_experience,
    claim_pro_id,   // if present → case B (claiming an existing row)
    claim_license,       // license # entered by the claimant (for soft verification)
    claim_license_expiry,// expiry date entered by the claimant (YYYY-MM-DD)
  } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const cleanEmail = email.trim().toLowerCase()

  // 1. Create the Supabase auth user (email confirmed = true so they can log in immediately;
  //    flip to false later if you want email verification).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  })

  if (createErr || !created?.user) {
    const msg = (createErr?.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      return NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 409 })
    }
    return NextResponse.json({ error: createErr?.message || 'Could not create account' }, { status: 500 })
  }

  const authUserId = created.user.id

  try {
    // ── Case B: claim an existing unclaimed pros row ──
    if (claim_pro_id) {
      // ── Soft, NON-BLOCKING verification ──────────────────────────────────
      // Read the stored license data and compare to what the claimant entered.
      // A match flips is_verified=true (badge); a mismatch still claims the
      // profile (is_verified=false, flagged for manual review). We never block.
      const { data: existing } = await admin
        .from('pros')
        .select('license_number, license_expiry_date, is_claimed, auth_user_id')
        .eq('id', claim_pro_id)
        .single()

      // Hard guard: never let a claimed profile be re-claimed (would hijack the
      // existing owner's auth_user_id). The client also blocks this, but the
      // server is the real boundary. Roll back the just-created auth user.
      if (existing?.is_claimed || existing?.auth_user_id) {
        await admin.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: 'This profile has already been claimed.' }, { status: 409 })
      }

      const normLic = (s: string | null | undefined) =>
        (s || '').replace(/\s+/g, '').toUpperCase()
      const licMatch = !!existing?.license_number &&
        normLic(claim_license) === normLic(existing.license_number)
      // Expiry: compare date portion only (stored is a DATE)
      const expMatch = !!existing?.license_expiry_date &&
        (claim_license_expiry || '').slice(0, 10) === String(existing.license_expiry_date).slice(0, 10)

      const verified = licMatch && expMatch

      const { data: pro, error: proErr } = await admin
        .from('pros')
        .update({
          auth_user_id: authUserId,
          email:        cleanEmail,
          phone:        phone || null,
          is_claimed:   true,
          claimed_at:   new Date().toISOString(),
          is_verified:  verified,
          // Unmatched claims go to manual review queue; matched stay Active.
          ...(verified ? {} : { profile_status: 'Pending_Review' }),
        })
        .eq('id', claim_pro_id)
        .eq('is_claimed', false)   // atomic: only claim if still unclaimed (race-safe)
        .select('*, trade_category:trade_categories(category_name, slug)')
        .single()

      if (proErr || !pro) {
        // Roll back the auth user so we don't orphan it
        await admin.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: 'Could not link profile' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, pro, claimed: true, verified })
    }

    // ── Case A: brand-new pros row ──
    // Generate a unique slug
    let slug: string | null = null
    const candidates = generateSlugCandidates({
      fullName: full_name, trade: null, city: city || null, state: state || null, licenseNumber: null,
    })
    for (const c of candidates) {
      const { data: existing } = await admin.from('pros').select('id').eq('slug', c).maybeSingle()
      if (!existing) { slug = c; break }
    }
    if (!slug) slug = `${candidates[0]}-${Date.now().toString(36)}`

    const { data: pro, error: insErr } = await admin
      .from('pros')
      .insert({
        auth_user_id:      authUserId,
        full_name,
        email:             cleanEmail,
        phone:             phone || null,
        trade_category_id: trade_category_id || null,
        state:             state || null,
        city:              city || null,
        years_experience:  years_experience || null,
        slug,
        is_claimed:        true,
        claimed_at:        new Date().toISOString(),
        is_verified:       false,   // license verified later in background
      })
      .select('*, trade_category:trade_categories(category_name, slug)')
      .single()

    if (insErr || !pro) {
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: insErr?.message || 'Could not create profile' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, pro, claimed: false })
  } catch (e: any) {
    await admin.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: e?.message || 'Signup failed' }, { status: 500 })
  }
}
