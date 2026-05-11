// app/api/roofing/dsm-debug/route.ts
// GET /api/roofing/dsm-debug?lat=&lng=
// Staging-only — dumps raw RANSAC facet + edge debug data for classifier tuning.
// DELETE THIS FILE once classifyEdge is validated.

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { runDsmDebug } from '@/lib/roofing/dsmAnalysis'
import { validateCoordinates } from '@/lib/api/utils'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

export async function GET(req: NextRequest) {
  // Hard staging gate — never runs in production
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const coords = validateCoordinates(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.valid) {
    return NextResponse.json({ error: coords.error }, { status: 400 })
  }
  if (!GOOGLE_KEY) {
    return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 503 })
  }

  try {
    const result = await runDsmDebug(coords.lat, coords.lng, GOOGLE_KEY)
    if (!result) {
      return NextResponse.json({ error: 'No roof planes found — flat roof or outside Solar API coverage' }, { status: 422 })
    }
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'Debug analysis failed', detail: String(e).slice(0, 200) }, { status: 500 })
  }
}
