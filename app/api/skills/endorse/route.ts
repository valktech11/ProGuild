import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { skill_id, endorsed_by } = await req.json()
  if (!skill_id || !endorsed_by) {
    return NextResponse.json({ error: 'skill_id and endorsed_by required' }, { status: 400 })
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
