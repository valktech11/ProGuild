import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

async function verifyAdmin(req: NextRequest) {
  const proId = req.headers.get('x-pro-id')
  if (!proId) return false
  const { data } = await getSupabaseAdmin().from('pros').select('is_admin').eq('id', proId).single()
  return data?.is_admin === true
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { data } = await getSupabaseAdmin()
    .from('pros').select('id, full_name, email, created_at')
    .eq('is_admin', true).order('created_at')
  return NextResponse.json({ admins: data || [] })
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { email, pro_id, grant } = await req.json()

  if (email) {
    const { data, error } = await getSupabaseAdmin()
      .from('pros').select('id, full_name, email').ilike('email', email).single()
    if (error || !data) return NextResponse.json({ error: 'No pro account found with that email' }, { status: 404 })
    await getSupabaseAdmin().from('pros').update({ is_admin: grant }).eq('id', data.id)
    return NextResponse.json({ ok: true, pro: data })
  }

  if (pro_id) {
    await getSupabaseAdmin().from('pros').update({ is_admin: grant }).eq('id', pro_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'email or pro_id required' }, { status: 400 })
}
