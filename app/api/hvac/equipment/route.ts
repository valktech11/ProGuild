import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId    = searchParams.get('pro_id')
  const clientId = searchParams.get('client_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  let q = getSupabaseAdmin()
    .from('hvac_equipment')
    .select('*, hvac_maintenance_reminders(id, due_date, status)')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (clientId) q = q.eq('client_id', clientId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ equipment: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, client_id, equipment_type, ...rest } = body
  if (!pro_id || !client_id || !equipment_type) {
    return NextResponse.json({ error: 'pro_id, client_id, equipment_type required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('hvac_equipment')
    .insert({ pro_id, client_id, equipment_type, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create maintenance reminder if next_service_date provided
  if (rest.next_service_date && data) {
    await getSupabaseAdmin().from('hvac_maintenance_reminders').insert({
      pro_id, equipment_id: data.id, client_id, due_date: rest.next_service_date, status: 'Pending',
    })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
