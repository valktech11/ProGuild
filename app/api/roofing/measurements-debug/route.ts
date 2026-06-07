// app/api/roofing/measurements-debug/route.ts
// GET /api/roofing/measurements-debug?lat=&lng=   (or ?address=)
// Staging-only — returns the clean measurement summary (squares, pitch, facets,
// and linear footage ridge/hip/valley/eave/rake) as JSON, WITHOUT generating a PDF.
// Lets us validate the measurement engine in the browser instead of the full UI→PDF loop.
// Optional ?truth=ridge,hip,valley,eave,rake appends a % error comparison.

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { runDsmAnalysis } from '@/lib/roofing/dsmAnalysis'
import { validateCoordinates } from '@/lib/api/utils'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

export async function GET(req: NextRequest) {
  // Hard staging gate — never runs in production
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  let lat = parseFloat(searchParams.get('lat') || '')
  let lng = parseFloat(searchParams.get('lng') || '')
  const address = searchParams.get('address')

  // Allow ?address= → geocode via Google Geocoding API
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && address) {
    if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 503 })
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`,
    )
    const geo = await geoRes.json()
    const loc = geo?.results?.[0]?.geometry?.location
    if (!loc) return NextResponse.json({ error: 'Could not geocode address', address }, { status: 422 })
    lat = loc.lat; lng = loc.lng
  }

  const coords = validateCoordinates(String(lat), String(lng))
  if (!coords.valid) return NextResponse.json({ error: coords.error }, { status: 400 })
  if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 503 })

  try {
    const t0 = Date.now()
    const lf = await runDsmAnalysis(coords.lat, coords.lng, GOOGLE_KEY)
    if (!lf) {
      return NextResponse.json({ error: 'No roof planes found — flat roof or outside Solar API coverage', lat, lng }, { status: 422 })
    }

    const out: any = {
      address: address || null,
      lat: coords.lat,
      lng: coords.lng,
      ms: Date.now() - t0,
      facets: lf.facet_count,
      linear_footage: {
        ridge_ft:  lf.ridge_ft,
        hip_ft:    lf.hip_ft,
        valley_ft: lf.valley_ft,
        eave_ft:   lf.eave_ft,
        rake_ft:   lf.rake_ft,
        total_ft:  lf.total_linear_ft,
      },
      derived: {
        ridge_plus_hip_ft: lf.ridge_ft + lf.hip_ft,        // capping
        eave_plus_rake_ft: lf.eave_ft + lf.rake_ft,        // drip edge
      },
      accuracy_note: lf.accuracy_note,
    }

    // Optional ground-truth comparison: ?truth=ridge,hip,valley,eave,rake
    const truthRaw = searchParams.get('truth')
    if (truthRaw) {
      const [r, h, v, e, rk] = truthRaw.split(',').map(Number)
      const pct = (got: number, exp: number) => exp > 0 ? `${Math.round((got - exp) / exp * 100)}%` : 'n/a'
      out.truth_comparison = {
        truth:  { ridge: r, hip: h, valley: v, eave: e, rake: rk },
        got:    { ridge: lf.ridge_ft, hip: lf.hip_ft, valley: lf.valley_ft, eave: lf.eave_ft, rake: lf.rake_ft },
        error:  {
          ridge:  pct(lf.ridge_ft, r),
          hip:    pct(lf.hip_ft, h),
          valley: pct(lf.valley_ft, v),
          eave:   pct(lf.eave_ft, e),
          rake:   pct(lf.rake_ft, rk),
        },
      }
    }

    return NextResponse.json(out, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'Measurement analysis failed', detail: String(e).slice(0, 300) }, { status: 500 })
  }
}
