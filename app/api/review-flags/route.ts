import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function POST(req: NextRequest) {
  try {
    const { review_id, reason } = await req.json()

    // Auth: the flagging pro is the signed-in pro — never trust a client id.
    const __auth = await requirePro(req, null)
    if (__auth.error) return __auth.error
    const pro_id = __auth.proId!

    if (!review_id || !reason) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const validReasons = ['Inappropriate', 'Fake', 'Wrong pro']
    if (!validReasons.includes(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
    }

    // Upsert — one flag per pro per review
    const { error } = await getSupabaseAdmin()
      .from('review_flags')
      .upsert(
        { review_id, pro_id, reason },
        { onConflict: 'review_id,pro_id' }
      )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('review-flags POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
