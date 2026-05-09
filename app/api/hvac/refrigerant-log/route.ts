import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId     = searchParams.get('pro_id')
  const invoiceId = searchParams.get('invoice_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  let q = getSupabaseAdmin()
    .from('hvac_refrigerant_log')
    .select('*, hvac_equipment(equipment_type, brand, model_number, serial_number)')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (invoiceId) q = q.eq('invoice_id', invoiceId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, refrigerant_type, ...rest } = body
  if (!pro_id || !refrigerant_type) {
    return NextResponse.json({ error: 'pro_id and refrigerant_type required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('hvac_refrigerant_log')
    .insert({ pro_id, refrigerant_type, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ log: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { pro_id, id } = body
  if (!pro_id || !id) return NextResponse.json({ error: 'pro_id and id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('hvac_refrigerant_log')
    .delete()
    .eq('id', id)
    .eq('pro_id', pro_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
