// GET /api/company/members
// Returns all members of the caller's company + pending (unused, unexpired) invites.
// Any company member can call this (read-only).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { companyId } = auth

  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Members with their pro details
  const { data: members, error: membErr } = await sb
    .from('company_members')
    .select(`
      id,
      role,
      joined_at,
      pro:pros!company_members_pro_id_fkey(id, full_name, email, profile_photo_url, is_verified, trade_slug)
    `)
    .eq('company_id', companyId)
    .order('joined_at', { ascending: true })

  if (membErr) {
    console.error('[company/members] query failed', membErr)
    return NextResponse.json({ error: membErr.message }, { status: 500 })
  }

  // Pending invites (unused, not expired)
  const { data: invites } = await sb
    .from('company_invites')
    .select('id, token, expires_at, created_at')
    .eq('company_id', companyId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

  return NextResponse.json({
    members: members ?? [],
    invites: (invites ?? []).map(inv => ({
      ...inv,
      invite_url: `${appUrl}/join/${inv.token}`,
    })),
  })
}
