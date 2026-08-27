// GET  /api/notifications — fetch unread + recent notifications for caller
// POST /api/notifications/read — mark notifications as read

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId } = auth

  const { data, error } = await getSupabaseAdmin()
    .from('pro_notifications')
    .select('id, type, title, body, lead_id, read_at, created_at')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unreadCount = (data ?? []).filter(n => !n.read_at).length
  return NextResponse.json({ notifications: data ?? [], unreadCount })
}
