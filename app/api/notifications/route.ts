import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('notifications')
    .select(`*, actor:pros!actor_id(id, full_name, profile_photo_url)`)
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unread = (data || []).filter(n => !n.is_read).length
  return NextResponse.json({ notifications: data || [], unread })
}

// Mark all as read
export async function PATCH(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { pro_id } = await req.json()
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  await getSupabaseAdmin()
    .from('notifications')
    .update({ is_read: true })
    .eq('pro_id', pro_id)
    .eq('is_read', false)
  return NextResponse.json({ success: true })
}
