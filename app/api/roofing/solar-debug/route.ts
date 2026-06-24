// app/api/roofing/solar-debug/route.ts
// GET /api/roofing/solar-debug
// Staging-only — fetches fresh Solar API data and shows parse state. DELETE before launch.

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

// Debug / keep-alive — never cache.
export const dynamic = 'force-dynamic'

const LAT = 30.25611
const LNG = -81.572459

// GET /api/roofing/solar-debug — clear premium_r2_key and confirm
export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'staging only' }, { status: 403 })
  }

  const googleKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!googleKey) return NextResponse.json({ error: 'no GOOGLE_SOLAR_API_KEY' }, { status: 500 })

  // Also clear the cached PDF key so next Material Order regenerates fresh
  const { getSupabaseAdmin } = await import('@/lib/supabase')
  const sb = getSupabaseAdmin()
  const { error: clearErr } = await sb
    .from('roof_reports')
    .update({ premium_r2_key: null })
    .eq('id', 'f501139a-967f-4284-a89d-568546804e05')

  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${LAT}&location.longitude=${LNG}&requiredQuality=LOW&key=${googleKey}`
  let raw: Record<string, unknown>
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return NextResponse.json({ error: `Solar API ${res.status}` }, { status: 502 })
    raw = await res.json()
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const sp = raw.solarPotential as Record<string, unknown> | null
  const rss = sp?.roofSegmentStats
  const segments = Array.isArray(rss) ? rss as Record<string, unknown>[] : null

  return NextResponse.json({
    cache_cleared: !clearErr,
    clear_error: clearErr?.message ?? null,
    roofSegmentStats_length: Array.isArray(rss) ? rss.length : null,
    first_segment_keys: segments?.[0] ? Object.keys(segments[0]) : [],
    stats_sub_object: segments?.[0]?.stats ?? null,
  })
}
