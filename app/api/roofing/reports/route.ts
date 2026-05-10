// app/api/roofing/reports/route.ts
// GET /api/roofing/reports?pro_id=...&property_id=...
// Returns report history for a property, newest first

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  const propertyId = searchParams.get('property_id')

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  let query = sb
    .from('roof_reports')
    .select('id, created_at, total_squares_raw, total_squares_order, dominant_pitch, facet_count, waste_factor, imagery_date, r2_url')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (propertyId) {
    query = query.eq('property_id', propertyId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reports: data || [] })
}
