import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const postId = searchParams.get('post_id')
  if (!postId) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('post_comments')
    .select(`*, pro:pros(id, full_name, profile_photo_url)`)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comments: data || [] })
}

export async function POST(req: NextRequest) {
  const { post_id, pro_id, content } = await req.json()
  if (!post_id || !pro_id || !content?.trim()) {
    return NextResponse.json({ error: 'post_id, pro_id and content required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('post_comments')
    .insert({ post_id, pro_id, content: content.trim() })
    .select(`*, pro:pros(id, full_name, profile_photo_url)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data }, { status: 201 })
}
