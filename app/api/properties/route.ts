import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  const search = searchParams.get('search')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  let q = getSupabaseAdmin()
    .from('properties')
    .select('*, roof_reports(id, total_squares_order, dominant_pitch, waste_factor, created_at)')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (search) q = q.ilike('address_line1', `%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ properties: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, address_line1, ...rest } = body
  if (!pro_id || !address_line1) {
    return NextResponse.json({ error: 'pro_id and address_line1 required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('properties')
    .insert({ pro_id, address_line1, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ property: data }, { status: 201 })
}
