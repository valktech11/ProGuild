import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // C5 FIX: verify lead belongs to requesting pro
  const proId = new URL(req.url).searchParams.get('pro_id')

  const query = getSupabaseAdmin().from('leads').select('*').eq('id', id)
  if (proId) query.eq('pro_id', proId)

  const { data, error } = await query.single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json()
  const {
    lead_status, notes, scheduled_date, scheduled_time, follow_up_date, client_id,
    contact_phone, contact_email, contact_city, contact_state, lead_source,
    quoted_amount,
  } = body

  const updateFields: Record<string, any> = {}
  if (lead_status     !== undefined) updateFields.lead_status     = lead_status
  if (notes           !== undefined) updateFields.notes           = notes
  if (scheduled_date  !== undefined) updateFields.scheduled_date  = scheduled_date
  if (scheduled_time  !== undefined) updateFields.scheduled_time  = scheduled_time
  if (follow_up_date  !== undefined) updateFields.follow_up_date  = follow_up_date
  if (client_id       !== undefined) updateFields.client_id       = client_id
  if (contact_phone   !== undefined) updateFields.contact_phone   = contact_phone
  if (contact_email   !== undefined) updateFields.contact_email   = contact_email
  if (contact_city    !== undefined) updateFields.contact_city    = contact_city
  if (contact_state   !== undefined) updateFields.contact_state   = contact_state
  if (lead_source     !== undefined) updateFields.lead_source     = lead_source
  if (quoted_amount   !== undefined) updateFields.quoted_amount   = quoted_amount
  updateFields.updated_at = new Date().toISOString()

  if (Object.keys(updateFields).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('leads').update(updateFields).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('leads').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
