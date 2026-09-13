// app/api/device-token/route.ts
// Stores the FCM device token for a pro so push notifications can be sent.
// Called by the mobile app after login whenever FirebaseMessaging.getToken() resolves.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const maxDuration = 30 // seconds — overrides Vercel default for this route

export async function POST(req: NextRequest) {
  try {
    const { pro_id, fcm_token } = await req.json()

    if (!pro_id || !fcm_token) {
      return NextResponse.json({ error: 'pro_id and fcm_token are required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Race the Supabase update against an 8s timeout so we never hit Vercel's wall
    const updatePromise = sb
      .from('pros')
      .update({ fcm_token })
      .eq('id', pro_id)

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase update timed out after 8s')), 8000)
    )

    const { error } = await Promise.race([updatePromise, timeoutPromise]) as any

    if (error) {
      console.error('[device-token] Update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[device-token] Error:', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Server error' }, { status: 500 })
  }
}
