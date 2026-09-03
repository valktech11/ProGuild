import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// POST /api/claim/complete — called after magic link auth, marks pro as claimed
// and links the new auth user to the pros row.
export async function POST(req: NextRequest) {
  const __auth = await requirePro(req)
  if (__auth.error) return __auth.error

  const { pro_id, token } = await req.json() as { pro_id: string; token: string }
  if (!pro_id || !token) {
    return NextResponse.json({ error: 'Missing pro_id or token' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Validate the token still matches and the row is not yet claimed
  const { data: pro, error: fetchErr } = await sb
    .from('pros')
    .select('id, is_claimed, claim_token, claim_token_expires_at, auth_user_id')
    .eq('id', pro_id)
    .eq('claim_token', token)
    .single()

  if (fetchErr || !pro) {
    return NextResponse.json({ error: 'Invalid claim token.' }, { status: 404 })
  }
  if (pro.is_claimed) {
    return NextResponse.json({ error: 'Already claimed.' }, { status: 410 })
  }
  if (pro.claim_token_expires_at && new Date(pro.claim_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Claim link expired.' }, { status: 410 })
  }

  // Verify the authed user matches this pro's email (security: prevent claim by wrong user)
  const { data: { user } } = await sb.auth.admin.getUserById(__auth.authUserId!)
  if (!user) return NextResponse.json({ error: 'Auth user not found.' }, { status: 401 })

  const { data: proRow } = await sb.from('pros').select('email').eq('id', pro_id).single()
  if (!proRow || proRow.email.toLowerCase() !== user.email!.toLowerCase()) {
    return NextResponse.json({ error: 'Email mismatch — cannot claim this profile.' }, { status: 403 })
  }

  // Mark claimed, link auth_user_id, clear the token
  const { error: updateErr } = await sb.from('pros').update({
    is_claimed:             true,
    claimed_at:             new Date().toISOString(),
    auth_user_id:           user.id,
    claim_token:            null,
    claim_token_expires_at: null,
  }).eq('id', pro_id)

  if (updateErr) {
    console.error('Claim complete update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to complete claim.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pro_id })
}
