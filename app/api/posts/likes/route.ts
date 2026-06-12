import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Toggle like on a post
export async function POST(req: NextRequest) {
  const { post_id, pro_id } = await req.json()
  if (!post_id || !pro_id) return NextResponse.json({ error: 'post_id and pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Check if already liked
  const { data: existing } = await sb
    .from('post_likes')
    .select('id')
    .eq('post_id', post_id)
    .eq('pro_id', pro_id)
    .maybeSingle()

  if (existing) {
    // Unlike — delete row and decrement count
    const { error: delError } = await sb.from('post_likes').delete().eq('id', existing.id)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
    await sb.rpc('decrement_like_count', { post_id_param: post_id })
    return NextResponse.json({ liked: false })
  } else {
    // Like — insert row and increment count
    const { error: insError } = await sb.from('post_likes').insert({ post_id, pro_id })
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
    await sb.rpc('increment_like_count', { post_id_param: post_id })
    return NextResponse.json({ liked: true })
  }
}

// Get all post_ids liked by a pro
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ likes: [] })

  const { data } = await getSupabaseAdmin()
    .from('post_likes')
    .select('post_id')
    .eq('pro_id', proId)

  return NextResponse.json({ likes: (data || []).map(l => l.post_id) })
}
