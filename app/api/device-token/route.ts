// app/api/device-token/route.ts
// Stores the FCM device token for a pro so push notifications can be sent.
// Called by the mobile app after login whenever FirebaseMessaging.getToken() resolves.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { pro_id, fcm_token } = await req.json()

    if (!pro_id || !fcm_token) {
      return NextResponse.json({ error: 'pro_id and fcm_token are required' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin()
      .from('pros')
      .update({ fcm_token })
      .eq('id', pro_id)

    if (error) {
      console.error('[device-token] Update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[device-token] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
