import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lead_id = searchParams.get('lead_id')
  const pro_id  = searchParams.get('pro_id')

  if (!lead_id || !pro_id) {
    return NextResponse.json({ error: 'lead_id and pro_id required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('pipeline_events')
    .select('id, event_type, event_data, created_at, actor_type')
    .eq('lead_id', lead_id)
    .eq('pro_id', pro_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}
