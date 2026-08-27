import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { companyId: _pevCompanyId, proId: _pevProId } = __auth
  const { searchParams } = new URL(req.url)
  const lead_id = searchParams.get('lead_id')
  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('pipeline_events')
    .select('id, event_type, event_data, created_at, actor_type, pro_id')
    .eq('lead_id', lead_id)
    .eq(_pevCompanyId ? 'company_id' : 'pro_id', _pevCompanyId ?? _pevProId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Resolve actor names for attribution display
  const rows = data || []
  const actorIds = Array.from(new Set(rows.map((r: any) => r.pro_id).filter(Boolean))) as string[]
  const actorMap: Record<string, string> = {}
  if (actorIds.length) {
    const { data: pros } = await getSupabaseAdmin().from('pros').select('id, full_name').in('id', actorIds)
    for (const p of pros || []) actorMap[p.id] = p.full_name?.split(' ')[0] ?? ''
  }
  const events = rows.map((r: any) => ({
    ...r,
    actor: r.pro_id && r.pro_id !== _pevProId ? (actorMap[r.pro_id] || null) : null,
  }))

  return NextResponse.json({ events })
}
