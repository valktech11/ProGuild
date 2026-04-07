import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET skills for a pro (with endorsement counts)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId     = searchParams.get('pro_id')
  const viewerId  = searchParams.get('viewer_id') // to check if viewer endorsed
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('pro_skills')
    .select(`*, endorsements:skill_endorsements(id, endorsed_by)`)
    .eq('pro_id', proId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const skills = (data || []).map(s => ({
    ...s,
    endorsement_count: s.endorsements?.length || 0,
    endorsed_by_me: viewerId
      ? s.endorsements?.some((e: any) => e.endorsed_by === viewerId)
      : false,
  }))

  return NextResponse.json({ skills })
}

// POST — add a skill (own profile only)
export async function POST(req: NextRequest) {
  const { pro_id, skill_name } = await req.json()
  if (!pro_id || !skill_name?.trim()) {
    return NextResponse.json({ error: 'pro_id and skill_name required' }, { status: 400 })
  }
  if (skill_name.length > 60) {
    return NextResponse.json({ error: 'Skill name too long (max 60 chars)' }, { status: 400 })
  }
  const { data, error } = await getSupabaseAdmin()
    .from('pro_skills')
    .insert({ pro_id, skill_name: skill_name.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ skill: data }, { status: 201 })
}

// DELETE — remove a skill
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const proId = searchParams.get('pro_id')
  if (!id || !proId) return NextResponse.json({ error: 'id and pro_id required' }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from('pro_skills').delete().eq('id', id).eq('pro_id', proId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
