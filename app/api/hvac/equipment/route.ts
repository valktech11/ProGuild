import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { searchParams } = new URL(req.url)
  const _hvacCompanyId = __auth.companyId
  const clientId = searchParams.get('client_id')
  if (!_hvacCompanyId) return NextResponse.json({ error: 'No company context' }, { status: 400 })

  let q = getSupabaseAdmin()
    .from('hvac_equipment')
    .select('*, hvac_maintenance_reminders(id, due_date, status)')
    .eq('company_id', _hvacCompanyId)
    .order('created_at', { ascending: false })

  if (clientId) q = q.eq('client_id', clientId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ equipment: data || [] })
}

export async function POST(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const body = await req.json()
  const { pro_id, client_id, equipment_type, ...rest } = body
  if (!pro_id || !client_id || !equipment_type) {
    return NextResponse.json({ error: 'pro_id, client_id, equipment_type required' }, { status: 400 })
  }

  // Idempotency guard: a rapid double-submit (or a client that retried after a
  // mis-read response) could create duplicate units. If an identical unit for
  // this client was created in the last 5 minutes, return it instead of inserting.
  const { serial_number, model_number } = rest as { serial_number?: string; model_number?: string }
  if (serial_number || model_number) {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    let dupQ = getSupabaseAdmin()
      .from('hvac_equipment')
      .select('*')
      .eq('client_id', client_id)
      .eq('equipment_type', equipment_type)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
    if (serial_number) dupQ = dupQ.eq('serial_number', serial_number)
    else if (model_number) dupQ = dupQ.eq('model_number', model_number)
    const { data: existing } = await dupQ.maybeSingle()
    if (existing) {
      return NextResponse.json({ item: existing, equipment: existing, deduped: true }, { status: 200 })
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('hvac_equipment')
    .insert({ pro_id, company_id: __auth.companyId, client_id, equipment_type, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create maintenance reminder if next_service_date provided
  if (rest.next_service_date && data) {
    await getSupabaseAdmin().from('hvac_maintenance_reminders').insert({
      pro_id, equipment_id: data.id, client_id, due_date: rest.next_service_date, status: 'Pending',
    })
  }

  // Return under both keys: GET uses `equipment`, and the mobile client reads
  // `equipment` from this POST too — returning only `item` made a successful
  // save surface as "Could not save" (null-cast on the missing key).
  return NextResponse.json({ item: data, equipment: data }, { status: 201 })
}
