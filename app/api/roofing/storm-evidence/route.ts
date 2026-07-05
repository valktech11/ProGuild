// app/api/roofing/storm-evidence/route.ts
// GET /api/roofing/storm-evidence?lat=&lon=&address=&years_back=&radius_mi=
//
// Production NOAA storm evidence endpoint.
// Returns ranked storm dates for a property — used by the insurance claim
// workflow to identify the best date of loss and generate court-ready evidence.
//
// Auth: requirePro (pro-scoped; pro_id from bearer, never from client param).
// Cache: 24h server-side (storm history doesn't change intraday).

export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getStormEvidence } from '@/lib/roofing/stormEvidence'

export async function GET(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const lat  = parseFloat(searchParams.get('lat')  ?? '')
  const lon  = parseFloat(searchParams.get('lon')  ?? '')
  const address    = searchParams.get('address')    ?? ''
  const yearsBack  = Math.min(parseInt(searchParams.get('years_back') ?? '3', 10), 5)
  const radiusMi   = Math.min(parseFloat(searchParams.get('radius_mi') ?? '10'), 25)

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }
  if (lat < 24 || lat > 31 || lon < -88 || lon > -79) {
    // Outside FL bounding box — WFO routing is FL-specific in this version.
    return NextResponse.json(
      { error: 'Storm evidence is currently available for Florida properties only.' },
      { status: 400 }
    )
  }

  try {
    const result = await getStormEvidence(lat, lon, address, yearsBack, radiusMi)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' }
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[storm-evidence]', msg)
    return NextResponse.json({ error: 'Storm data unavailable. Try again later.' }, { status: 502 })
  }
}
