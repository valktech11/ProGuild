import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { post_id, pro_id } = await req.json()
  if (!post_id || !pro_id) return NextResponse.json({ error: 'post_id and pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: existing } = await sb
    .from('post_likes')
    .select('id')
    .eq('post_id', post_id)
    .eq('pro_id', pro_id)
    .maybeSingle()

  if (existing) {
    const { error } = await sb.from('post_likes').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ liked: false })
  } else {
    const { error } = await sb.from('post_likes').insert({ post_id, pro_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ liked: true })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ likes: [] })

  const { data } = await getSupabaseAdmin()
    .from('post_likes')
    .select('post_id')
    .eq('pro_id', proId)

  return NextResponse.json({ likes: (data || []).map((l: any) => l.post_id) })
}
