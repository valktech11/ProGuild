import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

// GET conversation between two pros
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId  = searchParams.get('pro_id')
  const withId = searchParams.get('with_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  if (withId) {
    // Get conversation thread
    const { data } = await getSupabaseAdmin()
      .from('messages')
      .select(`*, sender:pros!sender_id(id, full_name, profile_photo_url)`)
      .or(`and(sender_id.eq.${proId},receiver_id.eq.${withId}),and(sender_id.eq.${withId},receiver_id.eq.${proId})`)
      .order('created_at', { ascending: true })
    return NextResponse.json({ messages: data || [] })
  } else {
    // Get all conversations (latest message per thread)
    const { data } = await getSupabaseAdmin()
      .from('messages')
      .select(`*, other:pros!sender_id(id, full_name, profile_photo_url)`)
      .or(`sender_id.eq.${proId},receiver_id.eq.${proId}`)
      .order('created_at', { ascending: false })
      .limit(50)
    return NextResponse.json({ messages: data || [] })
  }
}

// POST — send a message
export async function POST(req: NextRequest) {
  const { sender_id, receiver_id, content } = await req.json()
  if (!sender_id || !receiver_id || !content?.trim()) {
    return NextResponse.json({ error: 'sender_id, receiver_id and content required' }, { status: 400 })
  }
  if (sender_id === receiver_id) {
    return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
  }

  // Moderate message
  const mod = await moderateContent(content)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Message not allowed: ${mod.reason}`
    }, { status: 422 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('messages')
    .insert({ sender_id, receiver_id, content: content.trim() })
    .select(`*, sender:pros!sender_id(id, full_name, profile_photo_url)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create notification for receiver
  const { data: sender } = await getSupabaseAdmin()
    .from('pros').select('full_name').eq('id', sender_id).single()
  await getSupabaseAdmin().from('notifications').insert({
    pro_id:   receiver_id,
    type:     'new_follower', // reuse for now
    message:  `${sender?.full_name} sent you a message`,
    link:     `/messages?with=${sender_id}`,
    actor_id: sender_id,
  })

  return NextResponse.json({ message: data }, { status: 201 })
}
