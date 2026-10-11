import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// Memberships are personal to a pro — gate every op on the verified pro id.
export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { data } = await getSupabaseAdmin()
    .from('pro_memberships')
    .select('*')
    .eq('pro_id', __auth.proId!)
    .order('name')
  return NextResponse.json({ memberships: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, url } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('pro_memberships')
    .upsert({ pro_id: __auth.proId!, name: name.trim(), url: url?.trim() || null }, { onConflict: 'pro_id,name' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ membership: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { id } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await getSupabaseAdmin().from('pro_memberships').delete().eq('id', id).eq('pro_id', __auth.proId!)
  return NextResponse.json({ ok: true })
}
