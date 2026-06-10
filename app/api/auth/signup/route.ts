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
      const { data: pro, error: proErr } = await admin
        .from('pros')
        .update({
          auth_user_id: authUserId,
          email:        cleanEmail,
          phone:        phone || null,
          is_claimed:   true,
          claimed_at:   new Date().toISOString(),
        })
        .eq('id', claim_pro_id)
        .select('*, trade_category:trade_categories(category_name, slug)')
        .single()

      if (proErr || !pro) {
        // Roll back the auth user so we don't orphan it
        await admin.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: 'Could not link profile' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, pro, claimed: true })
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
