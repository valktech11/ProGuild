import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data } = await getSupabaseAdmin()
    .from('pro_equipment').select('*').eq('pro_id', proId).order('certified', { ascending: false }).order('name')
  return NextResponse.json({ equipment: data || [] })
}

export async function POST(req: NextRequest) {
  const { pro_id, name, certified } = await req.json()
  if (!pro_id || !name) return NextResponse.json({ error: 'pro_id and name required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('pro_equipment')
    .upsert({ pro_id, name: name.trim(), certified: certified || false }, { onConflict: 'pro_id,name' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { pro_id, id } = await req.json()
  if (!pro_id || !id) return NextResponse.json({ error: 'pro_id and id required' }, { status: 400 })
  await getSupabaseAdmin().from('pro_equipment').delete().eq('id', id).eq('pro_id', pro_id)
  return NextResponse.json({ ok: true })
}
