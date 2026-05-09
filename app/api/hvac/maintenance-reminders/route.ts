import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  // Return upcoming pending reminders with equipment + client info
  const { data, error } = await getSupabaseAdmin()
    .from('hvac_maintenance_reminders')
    .select(`
      *,
      hvac_equipment(id, equipment_type, brand, model_number, filter_size),
      clients(id, full_name, phone, email)
    `)
    .eq('pro_id', proId)
    .eq('status', 'Pending')
    .order('due_date', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminders: data || [] })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { pro_id, id, status, scheduled_lead_id } = body
  if (!pro_id || !id || !status) {
    return NextResponse.json({ error: 'pro_id, id, status required' }, { status: 400 })
  }

  const updateFields: Record<string, unknown> = { status }
  if (status === 'Notified') updateFields.notified_at = new Date().toISOString()
  if (scheduled_lead_id) updateFields.scheduled_lead_id = scheduled_lead_id

  const { data, error } = await getSupabaseAdmin()
    .from('hvac_maintenance_reminders')
    .update(updateFields)
    .eq('id', id)
    .eq('pro_id', pro_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminder: data })
}
