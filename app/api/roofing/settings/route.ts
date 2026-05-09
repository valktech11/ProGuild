import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('pros')
    .select('roofing_material_prices, gbb_templates')
    .eq('id', proId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    material_prices: data?.roofing_material_prices ?? null,
    gbb_templates: data?.gbb_templates ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { pro_id, material_prices, gbb_templates } = body
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (material_prices !== undefined) update.roofing_material_prices = material_prices
  if (gbb_templates !== undefined) update.gbb_templates = gbb_templates

  const { error } = await getSupabaseAdmin()
    .from('pros')
    .update(update)
    .eq('id', pro_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
