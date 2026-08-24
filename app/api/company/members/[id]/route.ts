// DELETE /api/company/members/[id]
// Owner-only. Removes a member from the company.
// Cannot remove yourself if you are the owner (use account deletion for that).
// [id] is the company_members.id (not pros.id).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId, companyId } = auth
  const { id: membershipId } = await params

  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Verify caller is owner
  const { data: callerMember } = await sb
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('pro_id', proId)
    .single()

  if (callerMember?.role !== 'owner') {
    return NextResponse.json({ error: 'Only the company owner can remove members' }, { status: 403 })
  }

  // Get the target membership to check it's in this company and not the owner
  const { data: target } = await sb
    .from('company_members')
    .select('id, pro_id, role')
    .eq('id', membershipId)
    .eq('company_id', companyId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (target.pro_id === proId) {
    return NextResponse.json({ error: 'Cannot remove yourself from the company' }, { status: 400 })
  }

  // Reassign all leads assigned to the removed member → unassigned (null)
  // Owner sees unassigned leads, so no data is lost.
  await sb
    .from('leads')
    .update({ assigned_to_pro_id: null, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('assigned_to_pro_id', target.pro_id)

  // Remove the membership
  const { error: delErr } = await sb
    .from('company_members')
    .delete()
    .eq('id', membershipId)
    .eq('company_id', companyId)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  // Clear company_id on the removed pro's row
  await sb
    .from('pros')
    .update({ company_id: null })
    .eq('id', target.pro_id)

  return NextResponse.json({ ok: true })
}
