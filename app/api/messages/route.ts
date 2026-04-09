import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId  = searchParams.get('pro_id')
  const withId = searchParams.get('with_id')

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  if (withId) {
    // Get conversation thread — mark messages as read
    const { data } = await getSupabaseAdmin()
      .from('messages')
      .select(`*, sender:pros!sender_id(id, full_name, profile_photo_url)`)
      .or(`and(sender_id.eq.${proId},receiver_id.eq.${withId}),and(sender_id.eq.${withId},receiver_id.eq.${proId})`)
      .order('created_at', { ascending: true })

    // Mark messages sent to this user as read
    await getSupabaseAdmin()
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', proId)
      .eq('sender_id', withId)
      .eq('is_read', false)

    return NextResponse.json({ messages: data || [] })
  } else {
    // Get all messages to build thread list
    const { data } = await getSupabaseAdmin()
      .from('messages')
      .select(`*, sender:pros!sender_id(id, full_name, profile_photo_url)`)
      .or(`sender_id.eq.${proId},receiver_id.eq.${proId}`)
      .order('created_at', { ascending: false })
      .limit(100)

    // Count total unread (messages sent TO this user, not read)
    const { count: unreadCount } = await getSupabaseAdmin()
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('receiver_id', proId)
      .eq('is_read', false)

    // Build unique threads with unread count per thread
    const threadMap: Record<string, any> = {}
    for (const msg of (data || [])) {
      const otherId = msg.sender_id === proId ? msg.receiver_id : msg.sender_id
      if (!threadMap[otherId]) {
        threadMap[otherId] = { otherId, lastMsg: msg, unread: 0 }
      }
      // Count unread per thread — messages received, not read
      if (!msg.is_read && msg.receiver_id === proId) {
        threadMap[otherId].unread++
      }
    }

    return NextResponse.json({
      messages: data || [],
      threads:  Object.values(threadMap),
      unread:   unreadCount || 0,
    })
  }
}

export async function POST(req: NextRequest) {
  const { sender_id, receiver_id, content } = await req.json()
  if (!sender_id || !receiver_id || !content?.trim()) {
    return NextResponse.json({ error: 'sender_id, receiver_id and content required' }, { status: 400 })
  }
  if (sender_id === receiver_id) {
    return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
  }

  const mod = await moderateContent(content)
  if (!mod.safe) {
    return NextResponse.json({ error: `Message not allowed: ${mod.reason}` }, { status: 422 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('messages')
    .insert({ sender_id, receiver_id, content: content.trim(), is_read: false })
    .select(`*, sender:pros!sender_id(id, full_name, profile_photo_url)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notification for receiver
  const { data: sender } = await getSupabaseAdmin()
    .from('pros').select('full_name').eq('id', sender_id).single()
  await getSupabaseAdmin().from('notifications').insert({
    pro_id:   receiver_id,
    type:     'new_follower',
    message:  `${sender?.full_name} sent you a message`,
    link:     `/messages?with=${sender_id}`,
    actor_id: sender_id,
  })

  return NextResponse.json({ message: data }, { status: 201 })
}
