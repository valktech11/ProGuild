import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// POST /api/leads/[id]/events
// Writes a custom pipeline_events entry (e.g. supplement_filed activity note).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { event_type, note } = body ?? {}
  // Auth: verify the bearer token — never trust client-supplied pro_id as identity.
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  const _evRole = __auth.role
  const _evCompanyId = __auth.companyId
  if (!event_type) return NextResponse.json({ error: 'event_type required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Role-aware ownership: owner/company pros and the assigned member may log.
  const { data: lead } = await sb
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq(
      _evRole === 'member' ? 'assigned_to_pro_id' : (_evCompanyId ? 'company_id' : 'pro_id'),
      _evRole === 'member' ? __auth.proId! : (_evCompanyId ?? __auth.proId!),
    )
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  await sb.from('pipeline_events').insert({
    lead_id:    leadId,
    pro_id:     __auth.proId!,
    event_type,
    event_data: note ? { note } : {},
    actor_type: 'pro',
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
