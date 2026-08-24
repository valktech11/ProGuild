// PATCH /api/leads/[id]/assign
// Owner-only. Reassigns a lead to a different team member (or unassigns).
// Body: { assigned_to_pro_id: string | null }
// The target pro must be a member of the same company.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId, companyId, role } = auth
  const { id: leadId } = await params

  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 })
  if (role !== 'owner') return NextResponse.json({ error: 'Only the owner can reassign leads' }, { status: 403 })

  const { assigned_to_pro_id } = await req.json().catch(() => ({}))

  const sb = getSupabaseAdmin()

  // Verify lead belongs to this company
  const { data: lead } = await sb
    .from('leads')
    .select('id, company_id')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // If assigning to someone, verify they are a member of this company
  if (assigned_to_pro_id) {
    const { data: member } = await sb
      .from('company_members')
      .select('pro_id')
      .eq('company_id', companyId)
      .eq('pro_id', assigned_to_pro_id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'That person is not a member of your company' }, { status: 400 })
    }
  }

  const { data, error } = await sb
    .from('leads')
    .update({
      assigned_to_pro_id: assigned_to_pro_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select('id, assigned_to_pro_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, lead: data })
}
