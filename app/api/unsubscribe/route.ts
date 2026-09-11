import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  // Mark pro as unsubscribed from lead notifications
  await getSupabaseAdmin()
    .from('pros')
    .update({ lead_notifications_disabled: true })
    .eq('email', email.toLowerCase().trim())

  return NextResponse.json({ ok: true })
}
