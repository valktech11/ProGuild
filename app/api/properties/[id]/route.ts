import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data: property, error } = await getSupabaseAdmin()
    .from('properties')
    .select('*')
    .eq('id', id)
    .eq('pro_id', proId)
    .single()

  if (error || !property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch linked leads (jobs on this property)
  const { data: leads } = await getSupabaseAdmin()
    .from('leads')
    .select('id, contact_name, lead_status, quoted_amount, created_at, scheduled_date')
    .eq('property_id', id)
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ property, leads: leads || [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { pro_id, ...fields } = body
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('properties')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('pro_id', pro_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ property: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('pro_id', proId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
