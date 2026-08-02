import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// GET  /api/hvac/equipment/[id]/measurements — list measurements for an equipment unit
// POST /api/hvac/equipment/[id]/measurements — save new field measurements

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('hvac_equipment_measurements')
    .select('*')
    .eq('equipment_id', id)
    .eq('pro_id', __auth.proId)
    .order('measured_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ measurements: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id } = await params
  const body = await req.json()
  const { data, error } = await getSupabaseAdmin()
    .from('hvac_equipment_measurements')
    .insert({
      equipment_id:      id,
      pro_id:            __auth.proId,
      measured_at:       body.measured_at ?? new Date().toISOString(),
      refrigerant_type:  body.refrigerant_type,
      suction_pressure:  body.suction_pressure,
      liquid_pressure:   body.liquid_pressure,
      suction_line_temp: body.suction_line_temp,
      liquid_line_temp:  body.liquid_line_temp,
      superheat_actual:  body.superheat_actual,
      subcool_actual:    body.subcool_actual,
      superheat_target:  body.superheat_target,
      subcool_target:    body.subcool_target,
      outdoor_temp:      body.outdoor_temp,
      return_air_temp:   body.return_air_temp,
      supply_air_temp:   body.supply_air_temp,
      delta_t:           body.delta_t,
      static_pressure:   body.static_pressure,
      diagnosis:         body.diagnosis,
      notes:             body.notes,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ measurement: data }, { status: 201 })
}
