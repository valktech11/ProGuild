import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import { moderateContent } from '@/lib/moderation'

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
  const body = await req.json()
  const { post_id, content } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  const pro_id = __auth.proId!
  if (!post_id || !content?.trim()) {
    return NextResponse.json({ error: 'post_id and content required' }, { status: 400 })
  }

  // Moderate comment
  const mod = await moderateContent(content)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Comment not allowed: ${mod.reason}. Please keep it professional.`
    }, { status: 422 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('post_comments')
    .insert({ post_id, pro_id, content: content.trim() })
    .select(`*, pro:pros(id, full_name, profile_photo_url)`)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data }, { status: 201 })
}
