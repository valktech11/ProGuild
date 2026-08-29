// app/api/auth/signup/route.ts
// Creates a REAL account: Supabase auth user → pros row → companies row → company_members(owner).
//
// Two cases handled:
//   A. Brand-new contractor → create auth user + new pros row + new companies row
//   B. Existing unclaimed pros row being claimed → create auth user + link pros + new companies row
//
// The company is always created here. One pro = one company (solo operator).
// Multi-user: other members join via invite link (/join/[token]) — not signup.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateSlugCandidates } from '@/lib/slug'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    email,
    password,
    full_name,
    business_name,
    phone,
    trade_category_id,
    state,
    city,
    years_experience,
    claim_pro_id,
    claim_license,
    claim_license_expiry,
    invite_token,          // present when signing up via /join/[token]
  } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const cleanEmail = email.trim().toLowerCase()

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
  const trialEndsAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  // Helper: resolve trade_slug from trade_category_id
  async function resolveTradeSlug(catId: string | null | undefined): Promise<string | null> {
    if (!catId) return null
    const { data: cat } = await admin.from('trade_categories').select('slug').eq('id', catId).single()
    return cat?.slug ?? null
  }

  // Helper: create company + company_members(owner) for a proId
  async function createCompany(proId: string, opts: {
    name: string
    tradeSlug: string | null
    tradeCategoryId: string | null
    businessName: string | null
    licenseNumber: string | null
    city: string | null
    state: string | null
    phoneCell: string | null
    email: string | null
    planTier: string
    trialEndsAt: string
  }): Promise<{ companyId: string } | { error: string }> {
    const { data: company, error: compErr } = await admin
      .from('companies')
      .insert({
        name:              opts.name,
        email:             opts.email,
        trade_slug:        opts.tradeSlug,
        trade_category_id: opts.tradeCategoryId,
        business_name:     opts.businessName,
        license_number:    opts.licenseNumber,
        city:              opts.city,
        state:             opts.state,
        phone_cell:        opts.phoneCell,
        plan_tier:         opts.planTier,
        trial_ends_at:     opts.trialEndsAt,
        owner_pro_id:      proId,
      })
      .select('id')
      .single()

    if (compErr || !company) {
      return { error: compErr?.message || 'Could not create company' }
    }

    // Back-fill pros.company_id
    await admin.from('pros').update({ company_id: company.id }).eq('id', proId)

    // Create owner membership
    await admin.from('company_members').insert({
      company_id: company.id,
      pro_id:     proId,
      role:       'owner',
    })

    return { companyId: company.id }
  }

  try {
    // ── Case B: claim an existing unclaimed pros row ──
    if (claim_pro_id) {
      const { data: existing } = await admin
        .from('pros')
        .select('license_number, license_expiry_date, is_claimed, auth_user_id, business_name, trade_slug, trade_category_id, city, state, phone_cell')
        .eq('id', claim_pro_id)
        .single()

      if (existing?.is_claimed || existing?.auth_user_id) {
        await admin.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: 'This profile has already been claimed.' }, { status: 409 })
      }

      const normLic = (s: string | null | undefined) => (s || '').replace(/\s+/g, '').toUpperCase()
      const licMatch = !!existing?.license_number &&
        normLic(claim_license) === normLic(existing.license_number)
      const expMatch = !!existing?.license_expiry_date &&
        (claim_license_expiry || '').slice(0, 10) === String(existing.license_expiry_date).slice(0, 10)
      const verified = licMatch && expMatch

      const { data: pro, error: proErr } = await admin
        .from('pros')
        .update({
          auth_user_id:  authUserId,
          email:         cleanEmail,
          phone:         phone || null,
          is_claimed:    true,
          claimed_at:    new Date().toISOString(),
          is_verified:   verified,
          trial_ends_at: trialEndsAt,
          ...(verified ? {} : { profile_status: 'Pending_Review' }),
        })
        .eq('id', claim_pro_id)
        .eq('is_claimed', false)
        .select('*, trade_category:trade_categories(category_name, slug)')
        .single()

      if (proErr || !pro) {
        await admin.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: 'Could not link profile' }, { status: 500 })
      }

      const companyResult = await createCompany(pro.id, {
        name:            (existing as any).business_name || full_name || 'My Company',
        tradeSlug:       (existing as any).trade_slug || (pro.trade_category as any)?.slug || null,
        tradeCategoryId: (existing as any).trade_category_id || null,
        businessName:    (existing as any).business_name || null,
        licenseNumber:   existing?.license_number || null,
        city:            (existing as any).city || null,
        state:           (existing as any).state || null,
        phoneCell:       (existing as any).phone_cell || null,
        email:           email || null,
        planTier:        'Free',
        trialEndsAt,
      })

      if ('error' in companyResult) {
        console.error('[signup] company creation failed for claim:', companyResult.error)
        return NextResponse.json({ error: 'Account setup failed — please try again or contact support.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, pro, claimed: true, verified })
    }

    // ── Case A: brand-new pros row ──
    let slug: string | null = null
    const candidates = generateSlugCandidates({
      fullName: full_name, trade: null, city: city || null, state: state || null, licenseNumber: null,
    })
    for (const c of candidates) {
      const { data: existing } = await admin.from('pros').select('id').eq('slug', c).maybeSingle()
      if (!existing) { slug = c; break }
    }
    if (!slug) slug = `${candidates[0]}-${Date.now().toString(36)}`

    const tradeSlug = await resolveTradeSlug(trade_category_id)

    const { data: pro, error: insErr } = await admin
      .from('pros')
      .insert({
        auth_user_id:      authUserId,
        full_name,
        business_name:     business_name || null,
        email:             cleanEmail,
        phone:             phone || null,
        phone_cell:        phone || null,
        trade_category_id: trade_category_id || null,
        trade_slug:        tradeSlug,
        state:             state || null,
        city:              city || null,
        years_experience:  years_experience || null,
        slug,
        is_claimed:        true,
        claimed_at:        new Date().toISOString(),
        is_verified:       false,
        trial_ends_at:     trialEndsAt,
      })
      .select('*, trade_category:trade_categories(category_name, slug)')
      .single()

    if (insErr || !pro) {
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: insErr?.message || 'Could not create profile' }, { status: 500 })
    }

    // If the user signed up via an invite link, join that company instead of
    // creating a solo company. If the invite is invalid/expired, fall through
    // to solo company creation (non-fatal — they can join later via /join).
    if (invite_token) {
      const { data: invite } = await admin
        .from('company_invites')
        .select('id, company_id, expires_at, used_at')
        .eq('token', invite_token)
        .maybeSingle()

      const inviteValid = invite && !invite.used_at && new Date(invite.expires_at) >= new Date()

      if (inviteValid) {
        // Join the inviting company (skip solo company creation)
        await admin.from('company_members').insert({
          company_id: invite.company_id,
          pro_id:     pro.id,
          role:       'member',
          invited_at: new Date().toISOString(),
          joined_at:  new Date().toISOString(),
        })
        await admin.from('pros').update({ company_id: invite.company_id }).eq('id', pro.id)
        // Mark invite used
        await admin.from('company_invites')
          .update({ used_at: new Date().toISOString(), used_by: pro.id })
          .eq('id', invite.id)
          .is('used_at', null)

        return NextResponse.json({ ok: true, pro, claimed: false, joined_company_id: invite.company_id })
      }
      // Invalid/expired invite — fall through to solo company creation
      console.warn('[signup] invite_token invalid or expired, creating solo company')
    }

    const companyResult = await createCompany(pro.id, {
      name:            business_name || full_name || 'My Company',
      tradeSlug,
      tradeCategoryId: trade_category_id || null,
      businessName:    business_name || null,
      licenseNumber:   null,
      city:            city || null,
      state:           state || null,
      phoneCell:       phone || null,
      email:           email || null,
      planTier:        'Free',
      trialEndsAt,
    })

    if ('error' in companyResult) {
      console.error('[signup] company creation failed for new pro:', companyResult.error)
      return NextResponse.json({ error: 'Account setup failed — please try again or contact support.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, pro, claimed: false })
  } catch (e: any) {
    await admin.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: e?.message || 'Signup failed' }, { status: 500 })
  }
}
