import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── GET /api/claim/[token] — validate token, return pro preview ───────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const sb = getSupabaseAdmin()
  const { data: pro, error } = await sb
    .from('pros')
    .select('id, full_name, email, city, state, trade_slug, is_claimed, claim_token_expires_at, profile_photo_url, trade_category:trade_categories(category_name)')
    .eq('claim_token', params.token)
    .single()

  if (error || !pro) {
    return NextResponse.json({ error: 'Invalid or expired claim link.' }, { status: 404 })
  }
  if (pro.is_claimed) {
    return NextResponse.json({ error: 'This profile has already been claimed. Log in at proguild.ai/login.' }, { status: 410 })
  }
  if (pro.claim_token_expires_at && new Date(pro.claim_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This claim link has expired. Contact support@proguild.ai for a new one.' }, { status: 410 })
  }

  return NextResponse.json({
    id:        pro.id,
    full_name: pro.full_name,
    email:     pro.email,
    city:      pro.city,
    state:     pro.state,
    trade:     (pro as any).trade_category?.category_name || pro.trade_slug || 'Trade Professional',
    photo_url: pro.profile_photo_url || null,
  })
}

// ── POST /api/claim/[token] — create account + claim in one step ──────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const sb = getSupabaseAdmin()

  // 1. Validate token
  const { data: pro, error: fetchErr } = await sb
    .from('pros')
    .select('id, full_name, email, is_claimed, claim_token_expires_at, trade_slug')
    .eq('claim_token', params.token)
    .single()

  if (fetchErr || !pro) {
    return NextResponse.json({ error: 'Invalid or expired claim link.' }, { status: 404 })
  }
  if (pro.is_claimed) {
    return NextResponse.json({ error: 'Already claimed. Log in at /login.' }, { status: 410 })
  }
  if (pro.claim_token_expires_at && new Date(pro.claim_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Claim link expired. Contact support@proguild.ai.' }, { status: 410 })
  }

  // 2. Validate password from body
  const body = await req.json().catch(() => ({}))
  const { password } = body as { password?: string }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // 3. Create or link Supabase auth user
  let authUserId: string

  // Check if auth user already exists for this email (claimed via another path or password reset)
  const { data: existingUser } = await sb.auth.admin.listUsers()
  const match = existingUser?.users?.find((u: any) => u.email?.toLowerCase() === pro.email.toLowerCase())

  if (match) {
    // User exists — update their password and link
    await sb.auth.admin.updateUserById(match.id, { password })
    authUserId = match.id
  } else {
    // New user — create account
    const { data: created, error: signUpErr } = await sb.auth.admin.createUser({
      email:             pro.email,
      password,
      email_confirm:     true, // skip confirmation email — they already confirmed via claim link
    })
    if (signUpErr || !created?.user) {
      console.error('Claim signUp error:', signUpErr?.message)
      return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
    }
    authUserId = created.user.id
  }

  // 4. Mark claimed, link auth_user_id, consume token (null it out — single use)
  const { error: updateErr } = await sb.from('pros').update({
    is_claimed:             true,
    claimed_at:             new Date().toISOString(),
    auth_user_id:           authUserId,
    claim_token:            null,
    claim_token_expires_at: null,
  }).eq('id', pro.id)

  if (updateErr) {
    console.error('Claim update error:', updateErr.message)
    return NextResponse.json({ error: 'Account created but claim failed. Contact support@proguild.ai.' }, { status: 500 })
  }

  // 5. Sign in to get a session the client can use immediately
  const { data: session, error: signInErr } = await sb.auth.admin.generateLink({
    type:    'magiclink',
    email:   pro.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard` },
  })

  // Return success — client will sign in using the password they just set
  return NextResponse.json({ ok: true })
}
