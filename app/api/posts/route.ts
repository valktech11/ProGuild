import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId    = searchParams.get('pro_id')
  const feedFor  = searchParams.get('feed_for') // get posts from followed pros
  const limit    = parseInt(searchParams.get('limit') || '20')

  let query = getSupabaseAdmin()
    .from('posts')
    .select(`*, pro:pros(id, full_name, profile_photo_url, plan_tier, trade_category_id, city, state, trade_category:trade_categories(category_name))`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (proId) query = query.eq('pro_id', proId)

  if (feedFor) {
    // Get IDs of pros this user follows
    const { data: followData } = await getSupabaseAdmin()
      .from('follows')
      .select('following_id')
      .eq('follower_id', feedFor)

    const followingIds = (followData || []).map(f => f.following_id)
    // Include own posts + followed pros posts
    const ids = [feedFor, ...followingIds]
    query = query.in('pro_id', ids)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, content, photo_url, post_type } = body

  if (!pro_id || !content?.trim()) {
    return NextResponse.json({ error: 'pro_id and content are required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('posts')
    .insert({
      pro_id,
      content: content.trim(),
      photo_url: photo_url || null,
      post_type: post_type || 'update',
    })
    .select(`*, pro:pros(id, full_name, profile_photo_url, trade_category:trade_categories(category_name))`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const proId = searchParams.get('pro_id')

  if (!id || !proId) return NextResponse.json({ error: 'id and pro_id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('posts')
    .delete()
    .eq('id', id)
    .eq('pro_id', proId) // ensure own post

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
