import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId      = searchParams.get('pro_id')
  const limit      = parseInt(searchParams.get('limit') || '30')
  const feedFor    = searchParams.get('feed_for')
  const tradeSlug  = searchParams.get('trade_slug')   // filter by trade slug
  const search     = searchParams.get('search')?.trim() // text search in content
  const postType   = searchParams.get('post_type')    // filter by type

  let query = getSupabaseAdmin()
    .from('posts')
    .select(`*, pro:pros(id, full_name, profile_photo_url, plan_tier, city, state, is_verified, trade_category:trade_categories(id, category_name, slug))`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (proId)     query = query.eq('pro_id', proId)
  if (postType)  query = query.eq('post_type', postType)
  if (search)    query = query.ilike('content', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let posts = data || []

  // Filter by trade slug (client-side after join since Supabase FK filter needs different syntax)
  if (tradeSlug) {
    posts = posts.filter(p => (p.pro as any)?.trade_category?.slug === tradeSlug)
  }

  // Boost followed pros to top if feed_for provided
  if (feedFor && !proId) {
    const { data: followData } = await getSupabaseAdmin()
      .from('follows')
      .select('following_id')
      .eq('follower_id', feedFor)

    const followingIds = new Set((followData || []).map(f => f.following_id))
    followingIds.add(feedFor)

    posts = [
      ...posts.filter(p => followingIds.has(p.pro_id)),
      ...posts.filter(p => !followingIds.has(p.pro_id)),
    ]
  }

  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, content, photo_url, post_type, before_photo_url, is_before_after } = body

  // For Ask a Pro and Post Work, content is optional if we have a photo
  const hasContent = content?.trim()
  const hasPhoto   = !!photo_url
  if (!pro_id || (!hasContent && !hasPhoto)) {
    return NextResponse.json({ error: 'pro_id and content or photo are required' }, { status: 400 })
  }

  // Moderate content before saving
  if (hasContent) {
    const mod = await moderateContent(content)
    if (!mod.safe) {
      return NextResponse.json({
        error: `Your post was not allowed: ${mod.reason}. Please keep content professional and respectful.`
      }, { status: 422 })
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('posts')
    .insert({
      pro_id,
      content: content?.trim() || '',
      photo_url: photo_url || null,
      before_photo_url: before_photo_url || null,
      is_before_after: is_before_after || false,
      post_type: post_type || 'update',
    })
    .select(`*, pro:pros(id, full_name, profile_photo_url, is_verified, trade_category:trade_categories(id, category_name, slug))`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const proId = searchParams.get('pro_id')
  if (!id || !proId) return NextResponse.json({ error: 'id and pro_id required' }, { status: 400 })
  const { error } = await getSupabaseAdmin().from('posts').delete().eq('id', id).eq('pro_id', proId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
