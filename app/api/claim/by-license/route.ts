import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { proFirstName } from '@/lib/utils'

// ── GET /api/claim/by-license?license=CCC123456 — preview pro before claiming ─
export async function GET(req: NextRequest) {
  const license = req.nextUrl.searchParams.get('license')?.trim().toUpperCase()
  if (!license) return NextResponse.json({ error: 'License number is required.' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: pro, error } = await sb
    .from('pros')
    .select('id, full_name, city, state, trade_slug, is_claimed, profile_photo_url, trade_category:trade_categories(category_name)')
    .eq('license_number', license)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Lookup failed. Please try again.' }, { status: 500 })
  if (!pro)  return NextResponse.json({ error: 'No profile found for that license number. Check the number and try again, or contact support@proguild.ai.' }, { status: 404 })
  if (pro.is_claimed) return NextResponse.json({ error: 'This profile has already been claimed. If this is your license, contact support@proguild.ai.' }, { status: 410 })

  return NextResponse.json({
    id:        pro.id,
    full_name: pro.full_name,
    first_name: proFirstName(pro.full_name || ''),
    city:      pro.city,
    state:     pro.state,
    trade:     (pro as any).trade_category?.category_name || pro.trade_slug || 'Trade Professional',
    photo_url: pro.profile_photo_url || null,
    license_number: license,
  })
}

// ── POST /api/claim/by-license — create account + claim via license number ────
export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const body = await req.json().catch(() => ({}))
  const { license_number, password } = body as { license_number?: string; password?: string }

  if (!license_number?.trim()) return NextResponse.json({ error: 'License number is required.' }, { status: 400 })
  if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  const license = license_number.trim().toUpperCase()

  const { data: pro, error: fetchErr } = await sb
    .from('pros')
    .select('id, full_name, email, is_claimed, trade_slug, trade_category_id, city, state, phone_cell, business_name, license_number')
    .eq('license_number', license)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: 'Lookup failed. Please try again.' }, { status: 500 })
  if (!pro) return NextResponse.json({ error: 'No profile found for that license number.' }, { status: 404 })
  if (pro.is_claimed) return NextResponse.json({ error: 'This profile has already been claimed.' }, { status: 410 })

  const claimEmail = (body.email as string | undefined)?.trim().toLowerCase()
  if (!claimEmail || !claimEmail.includes('@')) {
    return NextResponse.json({ error: 'Please provide your email address to create your account.' }, { status: 400 })
  }

  let authUserId: string
  const { data: existingUsers } = await sb.auth.admin.listUsers()
  const match = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === claimEmail)

  if (match) {
    await sb.auth.admin.updateUserById(match.id, { password })
    authUserId = match.id
  } else {
    const { data: created, error: signUpErr } = await sb.auth.admin.createUser({
      email: claimEmail, password, email_confirm: true,
    })
    if (signUpErr || !created?.user) {
      console.error('by-license signUp error:', signUpErr?.message)
      return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
    }
    authUserId = created.user.id
  }

  const trialEndsAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: claimedPro, error: updateErr } = await sb.from('pros').update({
    is_claimed: true, claimed_at: new Date().toISOString(),
    auth_user_id: authUserId, email: claimEmail,
    claim_token: null, claim_token_expires_at: null, trial_ends_at: trialEndsAt,
  }).eq('id', pro.id).select('id, full_name, email, trade_slug, trade_category_id, city, state, phone_cell, business_name, license_number').single()

  if (updateErr || !claimedPro) {
    console.error('by-license update error:', updateErr?.message)
    return NextResponse.json({ error: 'Account created but claim failed. Contact support@proguild.ai.' }, { status: 500 })
  }

  try {
    const { data: company, error: compErr } = await sb.from('companies').insert({
      name: claimedPro.business_name || claimedPro.full_name || 'My Company',
      email: claimEmail, trade_slug: claimedPro.trade_slug || null,
      trade_category_id: claimedPro.trade_category_id || null,
      business_name: claimedPro.business_name || null, license_number: claimedPro.license_number || null,
      city: claimedPro.city || null, state: claimedPro.state || null,
      phone_cell: claimedPro.phone_cell || null, plan_tier: 'Free',
      trial_ends_at: trialEndsAt, owner_pro_id: claimedPro.id,
    }).select('id').single()
    if (company && !compErr) {
      await sb.from('pros').update({ company_id: company.id }).eq('id', claimedPro.id)
      await sb.from('company_members').insert({ company_id: company.id, pro_id: claimedPro.id, role: 'owner' })
    } else { console.error('[by-license] company creation failed:', compErr?.message) }
  } catch (e: any) { console.error('[by-license] company creation exception:', e?.message) }

  return NextResponse.json({ ok: true, email: claimEmail })
}
