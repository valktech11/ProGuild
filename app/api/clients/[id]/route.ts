import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { pro_id, full_name, phone, email, notes, tags } = body
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .update({ full_name, phone: phone || null, email: email || null, notes: notes || null, tags: tags || [] })
    .eq('id', id).eq('pro_id', pro_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}
