// app/api/roofing/solar-debug/route.ts
// GET /api/roofing/solar-debug?report_id=&pro_id=
// Staging-only — dumps solar_raw parse state. DELETE before launch.

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'staging only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const report_id = searchParams.get('report_id') ?? 'f501139a-967f-4284-a89d-568546804e05'
  const pro_id    = searchParams.get('pro_id')    ?? '2fbc58c2-c9d3-4040-acf9-810c3b215a05'

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('roof_reports')
    .select('id, solar_raw')
    .eq('id', report_id)
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'not found' }, { status: 404 })

  const raw = data.solar_raw
  const rawType = typeof raw
  const isNull = raw === null

  // Try to normalise if string
  let parsed: Record<string, unknown> | null = null
  if (rawType === 'string') {
    try { parsed = JSON.parse(raw as string) } catch { parsed = null }
  } else {
    parsed = raw as Record<string, unknown> | null
  }

  const sp = parsed?.solarPotential as Record<string, unknown> | null
  const rss = sp?.roofSegmentStats
  const segments = Array.isArray(rss) ? rss as Record<string, unknown>[] : null

  return NextResponse.json({
    report_id,
    solar_raw_type: rawType,
    solar_raw_is_null: isNull,
    solar_raw_is_string: rawType === 'string',
    top_level_keys: parsed ? Object.keys(parsed) : [],
    has_solarPotential: !!sp,
    solarPotential_keys: sp ? Object.keys(sp) : [],
    roofSegmentStats_type: Array.isArray(rss) ? `array` : typeof rss,
    roofSegmentStats_length: Array.isArray(rss) ? rss.length : null,
    first_segment_keys: segments && segments.length > 0 ? Object.keys(segments[0]) : [],
    first_segment_sample: segments && segments.length > 0 ? segments[0] : null,
  })
}
