// POST /api/join/accept
// Body: { token: string }
// Authenticated. Accepts an invite: creates company_members row, sets pros.company_id.
// Idempotent — if already a member of this company, returns ok.
// Fails if the caller is already in a different company.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId, companyId: currentCompanyId } = auth

  const { token } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Validate the invite
  const { data: invite } = await sb
    .from('company_invites')
    .select('id, company_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }
  if (invite.used_at) {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }

  const targetCompanyId: string = invite.company_id

  // Already in this company — idempotent success
  if (currentCompanyId === targetCompanyId) {
    return NextResponse.json({ ok: true, already_member: true })
  }

  // Already in a different company — conflict
  if (currentCompanyId && currentCompanyId !== targetCompanyId) {
    return NextResponse.json(
      { error: 'You are already a member of another company' },
      { status: 409 }
    )
  }

  // Insert company_members row
  const { error: memberErr } = await sb
    .from('company_members')
    .insert({
      company_id:  targetCompanyId,
      pro_id:      proId,
      role:        'member',
      joined_at:   new Date().toISOString(),
    })

  if (memberErr && !memberErr.message.includes('duplicate')) {
    console.error('[join/accept] member insert failed', memberErr)
    return NextResponse.json({ error: 'Could not join company' }, { status: 500 })
  }

  // Set pros.company_id
  await sb.from('pros').update({ company_id: targetCompanyId }).eq('id', proId)

  // Mark invite as used
  await sb
    .from('company_invites')
    .update({ used_at: new Date().toISOString(), used_by: proId })
    .eq('id', invite.id)
    .is('used_at', null)

  // Notify owner that member joined
  try {
    const { data: memberPro } = await sb.from('pros').select('full_name').eq('id', proId).single()
    const memberName = (memberPro as any)?.full_name?.split(' ')[0] ?? 'Someone'
    const { notifyOwners } = await import('@/lib/notifications')
    await notifyOwners(targetCompanyId, proId, {
      type:  'new_lead_created', // reuse as team event
      title: `${memberName} joined your team`,
      body:  `${(memberPro as any)?.full_name ?? 'A new member'} accepted your invite`,
    })
  } catch {}

  return NextResponse.json({ ok: true, company_id: targetCompanyId })
}
