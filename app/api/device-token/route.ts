// app/api/device-token/route.ts
// Stores the FCM device token for a pro — uses direct REST fetch to avoid
// Supabase JS client cold-start overhead on Vercel Hobby.

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { pro_id, fcm_token } = await req.json()

    if (!pro_id) {
      return NextResponse.json({ error: 'pro_id is required' }, { status: 400 })
    }

    const supabaseUrl  = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      console.error('[device-token] Missing SUPABASE env vars')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/pros?id=eq.${pro_id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ fcm_token }),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error('[device-token] Supabase REST error:', res.status, text)
      return NextResponse.json({ error: text }, { status: 500 })
    }

    console.log('[device-token] fcm_token stored for pro:', pro_id)
    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('[device-token] Error:', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Server error' }, { status: 500 })
  }
}
