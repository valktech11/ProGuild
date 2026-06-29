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

  // Derive the per-property report summary server-side (latest report's squares /
  // pitch + count) so web and mobile both paint the same values (§28).
  const properties = (data || []).map((p: any) => {
    const reports = (p.roof_reports ?? []) as { total_squares_order: number; dominant_pitch: string; created_at: string }[]
    const latest = [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    return {
      ...p,
      report_count:  reports.length,
      latest_sq:     latest ? latest.total_squares_order : null,
      latest_pitch:  latest ? latest.dominant_pitch : null,
      last_report_at: latest ? latest.created_at : null,
    }
  })
  return NextResponse.json({ properties })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, address_line1: rawAddr, city, state, zip_code, ...rest } = body
  if (!pro_id || !rawAddr) {
    return NextResponse.json({ error: 'pro_id and address_line1 required' }, { status: 400 })
  }

  // If city/state/zip are provided separately, strip them from address_line1
  // Prevents full address string being stored in street field
  const address_line1 = (city || state || zip_code)
    ? rawAddr.split(',')[0].trim()
    : rawAddr.trim()

  const { data, error } = await getSupabaseAdmin()
    .from('properties')
    .insert({ pro_id, address_line1, city: city || null, state: state || null, zip_code: zip_code || null, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ property: data }, { status: 201 })
}
