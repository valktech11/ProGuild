import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id } = await params
  const body = await req.json()
  const { pro_id: _claimedProId, ...fields } = body
  const pro_id = __auth.proId // server-derived (IDOR); body value ignored
  const _hvacEditCompanyId = __auth.companyId
  const _hvacEditRole = __auth.role

  const updateFields = { ...fields, updated_at: new Date().toISOString() }

  const { data, error } = await getSupabaseAdmin()
    .from('hvac_equipment')
    .update(updateFields)
    .eq('id', id)
    .eq(_hvacEditRole === 'member' ? 'pro_id' : (_hvacEditCompanyId ? 'company_id' : 'pro_id'), _hvacEditRole === 'member' ? pro_id! : (_hvacEditCompanyId ?? pro_id!))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update/create maintenance reminder if next_service_date changed
  if (fields.next_service_date !== undefined && data) {
    // Remove existing pending reminder for this equipment
    await getSupabaseAdmin()
      .from('hvac_maintenance_reminders')
      .delete()
      .eq('equipment_id', id)
      .eq('status', 'Pending')

    // Create new one if date set
    if (fields.next_service_date) {
      await getSupabaseAdmin().from('hvac_maintenance_reminders').insert({
        pro_id, equipment_id: id, client_id: data.client_id,
        due_date: fields.next_service_date, status: 'Pending',
      })
    }
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const proId = __auth.proId // server-derived (IDOR)

  const { error } = await getSupabaseAdmin()
    .from('hvac_equipment')
    .delete()
    .eq('id', id)
    .eq('pro_id', proId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
