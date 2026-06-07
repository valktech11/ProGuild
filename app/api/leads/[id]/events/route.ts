import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/leads/[id]/events
// Writes a custom pipeline_events entry (e.g. supplement_filed activity note).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { pro_id, event_type, note } = body ?? {}
  if (!pro_id || !event_type) return NextResponse.json({ error: 'pro_id and event_type required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Verify ownership
  const { data: lead } = await sb.from('leads').select('pro_id').eq('id', leadId).maybeSingle()
  if (!lead || lead.pro_id !== pro_id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  await sb.from('pipeline_events').insert({
    lead_id:    leadId,
    pro_id,
    event_type,
    event_data: note ? { note } : {},
    actor_type: 'pro',
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
