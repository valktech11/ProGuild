import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Toggle like on a post
export async function POST(req: NextRequest) {
  const { post_id, pro_id } = await req.json()
  if (!post_id || !pro_id) return NextResponse.json({ error: 'post_id and pro_id required' }, { status: 400 })

  // Check if already liked
  const { data: existing } = await getSupabaseAdmin()
    .from('post_likes')
    .select('id')
    .eq('post_id', post_id)
    .eq('pro_id', pro_id)
    .single()

  if (existing) {
    // Unlike
    await getSupabaseAdmin().from('post_likes').delete().eq('id', existing.id)
    return NextResponse.json({ liked: false })
  } else {
    // Like
    await getSupabaseAdmin().from('post_likes').insert({ post_id, pro_id })
    return NextResponse.json({ liked: true })
  }
}

// Check if pro liked a set of posts
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
