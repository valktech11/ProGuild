// app/api/roofing/solar-debug/route.ts
// GET /api/roofing/solar-debug
// Staging-only — fetches fresh Solar API data and shows parse state. DELETE before launch.

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const LAT = 30.25611
const LNG = -81.572459

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'staging only' }, { status: 403 })
  }

  const googleKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!googleKey) return NextResponse.json({ error: 'no GOOGLE_SOLAR_API_KEY' }, { status: 500 })

  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${LAT}&location.longitude=${LNG}&requiredQuality=LOW&key=${googleKey}`

  let raw: Record<string, unknown>
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return NextResponse.json({ error: `Solar API ${res.status}`, body: await res.text() }, { status: 502 })
    raw = await res.json()
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const sp = raw.solarPotential as Record<string, unknown> | null
  const rss = sp?.roofSegmentStats
  const segments = Array.isArray(rss) ? rss as Record<string, unknown>[] : null

  return NextResponse.json({
    top_level_keys: Object.keys(raw),
    has_solarPotential: !!sp,
    solarPotential_keys: sp ? Object.keys(sp) : [],
    roofSegmentStats_type: Array.isArray(rss) ? 'array' : typeof rss,
    roofSegmentStats_length: Array.isArray(rss) ? rss.length : null,
    first_segment_keys: segments?.[0] ? Object.keys(segments[0]) : [],
    first_segment: segments?.[0] ?? null,
  })
}
