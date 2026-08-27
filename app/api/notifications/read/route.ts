// POST /api/notifications/read
// Body: { ids?: string[] } — if omitted, marks all as read

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId } = auth
  const body = await req.json().catch(() => ({}))
  const ids: string[] | undefined = body.ids

  const sb = getSupabaseAdmin()
  let q = sb.from('pro_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('pro_id', proId)
    .is('read_at', null)

  if (ids?.length) q = (q as any).in('id', ids)

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
