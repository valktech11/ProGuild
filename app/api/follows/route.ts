import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Toggle follow
export async function POST(req: NextRequest) {
  const { follower_id, following_id } = await req.json()
  if (!follower_id || !following_id) {
    return NextResponse.json({ error: 'follower_id and following_id required' }, { status: 400 })
  }
  if (follower_id === following_id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
  }

  const { data: existing } = await getSupabaseAdmin()
    .from('follows')
    .select('id')
    .eq('follower_id', follower_id)
    .eq('following_id', following_id)
    .single()

  if (existing) {
    await getSupabaseAdmin().from('follows').delete().eq('id', existing.id)
    return NextResponse.json({ following: false })
  } else {
    await getSupabaseAdmin().from('follows').insert({ follower_id, following_id })
    return NextResponse.json({ following: true })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const [followers, following] = await Promise.all([
    getSupabaseAdmin().from('follows').select('follower_id, pro:pros!follower_id(id, full_name, profile_photo_url, city, state, trade_category:trade_categories(category_name))').eq('following_id', proId),
    getSupabaseAdmin().from('follows').select('following_id, pro:pros!following_id(id, full_name, profile_photo_url, city, state, trade_category:trade_categories(category_name))').eq('follower_id', proId),
  ])

  return NextResponse.json({
    followers: (followers.data || []).map(f => f.pro),
    following: (following.data || []).map(f => f.pro),
    follower_count:  (followers.data || []).length,
    following_count: (following.data || []).length,
  })
}
