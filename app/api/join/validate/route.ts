// GET /api/join/validate?token=xxx
// Public (no auth required). Returns invite metadata so the /join/[token] page
// can show the company name before the user is logged in.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.json({ valid: false, error: 'Missing token' })
  }

  const sb = getSupabaseAdmin()

  const { data: invite } = await sb
    .from('company_invites')
    .select(`
      token,
      expires_at,
      used_at,
      company:companies(id, name)
    `)
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ valid: false, error: 'Invite not found' })
  }

  if (invite.used_at) {
    return NextResponse.json({ valid: false, error: 'This invite has already been used' })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'This invite has expired' })
  }

  const company = invite.company as unknown as { id: string; name: string } | null

  return NextResponse.json({
    valid: true,
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    expires_at: invite.expires_at,
  })
}
