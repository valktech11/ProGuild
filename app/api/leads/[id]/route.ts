import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('leads').select('*').eq('id', id).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json()
  const { lead_status, notes, quoted_amount, scheduled_date, follow_up_date, client_id } = body

  const updateFields: Record<string, any> = {}
  if (lead_status    !== undefined) updateFields.lead_status    = lead_status
  if (notes          !== undefined) updateFields.notes          = notes
  if (quoted_amount  !== undefined) updateFields.quoted_amount  = quoted_amount
  if (scheduled_date !== undefined) updateFields.scheduled_date = scheduled_date
  if (follow_up_date !== undefined) updateFields.follow_up_date = follow_up_date
  if (client_id      !== undefined) updateFields.client_id      = client_id
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
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('leads').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
