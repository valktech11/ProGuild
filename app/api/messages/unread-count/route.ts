import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  const __auth = await requirePro(req, proId)
  if (__auth.error) return __auth.error

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { count } = await getSupabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', proId)
    .eq('is_read', false)

  return NextResponse.json({ unread: count || 0 })
}
