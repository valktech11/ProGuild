import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Lightweight DB ping — keeps Supabase free tier awake
// Called daily by Vercel cron (see vercel.json)
export async function GET() {
  try {
    const { error } = await getSupabaseAdmin()
      .from('trade_categories')
      .select('id')
      .limit(1)
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
