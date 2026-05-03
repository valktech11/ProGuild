import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // Increment viewed_count and set viewed_at on first view
  const { data: est } = await sb
    .from('estimates')
    .select('viewed_count, viewed_at, status')
    .eq('id', id)
    .single()

  if (!est) return NextResponse.json({ ok: true })

  await sb.from('estimates').update({
    viewed_count: (est.viewed_count || 0) + 1,
    viewed_at:    est.viewed_at || new Date().toISOString(),
    status:       est.status === 'sent' ? 'viewed' : est.status,
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}
