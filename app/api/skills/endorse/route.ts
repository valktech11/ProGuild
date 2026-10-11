import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function POST(req: NextRequest) {
  const { skill_id } = await req.json()
  // Auth: the endorser is the signed-in pro — never trust a client-supplied id.
  const __auth = await requirePro(req, null)
  if (__auth.error) return __auth.error
  const endorsed_by = __auth.proId!
  if (!skill_id) {
    return NextResponse.json({ error: 'skill_id required' }, { status: 400 })
  }
  const { data: existing } = await getSupabaseAdmin()
    .from('skill_endorsements').select('id')
    .eq('skill_id', skill_id).eq('endorsed_by', endorsed_by).single()

  if (existing) {
    await getSupabaseAdmin().from('skill_endorsements').delete().eq('id', existing.id)
    return NextResponse.json({ endorsed: false })
  } else {
    const { data: skill } = await getSupabaseAdmin()
      .from('pro_skills').select('pro_id').eq('id', skill_id).single()
    if (skill?.pro_id === endorsed_by) {
      return NextResponse.json({ error: 'Cannot endorse your own skill' }, { status: 400 })
    }
    await getSupabaseAdmin().from('skill_endorsements').insert({ skill_id, endorsed_by })
    return NextResponse.json({ endorsed: true })
  }
}
