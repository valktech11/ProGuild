import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── GET /api/claim/[token] — validate token, return pro preview data ──────────
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
    return NextResponse.json({ error: 'This profile has already been claimed.' }, { status: 410 })
  }
  if (pro.claim_token_expires_at && new Date(pro.claim_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This claim link has expired. Please contact support@proguild.ai.' }, { status: 410 })
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

// ── POST /api/claim/[token] — send magic link to claim ────────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const sb = getSupabaseAdmin()
  const { data: pro, error } = await sb
    .from('pros')
    .select('id, full_name, email, is_claimed, claim_token_expires_at')
    .eq('claim_token', params.token)
    .single()

  if (error || !pro) {
    return NextResponse.json({ error: 'Invalid or expired claim link.' }, { status: 404 })
  }
  if (pro.is_claimed) {
    return NextResponse.json({ error: 'Already claimed.' }, { status: 410 })
  }
  if (pro.claim_token_expires_at && new Date(pro.claim_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired.' }, { status: 410 })
  }

  const { error: mlErr } = await sb.auth.admin.generateLink({
    type:    'magiclink',
    email:   pro.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/claim/complete?pro_id=${pro.id}&token=${params.token}`,
    },
  })

  if (mlErr) {
    console.error('Magic link error:', mlErr.message)
    return NextResponse.json({ error: 'Failed to send claim email. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: maskEmail(pro.email) })
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  return `${user[0]}${'*'.repeat(Math.min(user.length - 2, 4))}${user[user.length - 1]}@${domain}`
}
