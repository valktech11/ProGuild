// GET  /api/roof-size-calculator?address=<string>
//      Returns { sqft, squares, pitch, imageryDate, lat, lng, formattedAddress }
//
// POST /api/roof-size-calculator
//      Body: { name, email, phone, address, sqft, squares, pitch }
//      Creates a lead tagged lead_source: 'roof_calculator' assigned to the org pro.
//      No auth required — public endpoint.

import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocode'
import { getSupabaseAdmin } from '@/lib/supabase'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

// ── The org pro that receives calculator leads ────────────────────────────────
// valktech11@gmail.com — same UUID on staging and prod.
// Override via ROOF_CALC_PRO_ID env var if needed without a redeploy.
const ORG_PRO_ID = process.env.ROOF_CALC_PRO_ID || '4dd8236f-7f4e-43d2-a834-6ed0c08ec689'

// ── Solar API ─────────────────────────────────────────────────────────────────
async function fetchSolarData(lat: number, lng: number) {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&requiredQuality=LOW&key=${GOOGLE_KEY}`
  const res = await fetch(url, { cache: 'force-cache' }) // cache per address
  if (!res.ok) throw new Error(`Solar API ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}

function sqftFromM2(m2: number) { return m2 * 10.7639 }
function toSquares(sqft: number) { return Math.round(sqft / 100) }

function parseSolar(solar: Record<string, unknown>) {
  const potential = (solar.solarPotential as Record<string, unknown>) || {}
  const whole     = (potential.wholeRoofStats as Record<string, unknown>) || {}
  const segments  = (potential.roofSegmentStats as Record<string, unknown>[]) || []

  const totalSqft    = Math.round(sqftFromM2((whole.areaMeters2 as number) || 0))
  const totalSquares = toSquares(totalSqft)

  // Dominant pitch from the largest segment
  let dominantPitch = 'Unknown'
  if (segments.length) {
    const largest = segments.reduce((a: any, b: any) =>
      ((a.areaMeters2 as number) || 0) >= ((b.areaMeters2 as number) || 0) ? a : b)
    const raw = (largest.pitchDegrees as number) || 0
    const rise = Math.round(Math.tan((raw * Math.PI) / 180) * 12)
    dominantPitch = `${rise}/12`
  }

  const imgRaw = solar.imageryDate as Record<string, number> | null
  const imageryDate = imgRaw
    ? `${imgRaw.year}-${String(imgRaw.month).padStart(2,'0')}-${String(imgRaw.day).padStart(2,'0')}`
    : null

  return { totalSqft, totalSquares, dominantPitch, imageryDate }
}

// ── GET: measure roof ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim() ?? ''
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  const geo = await geocodeAddress(address)
  if (!geo) return NextResponse.json({ error: 'Address not found. Please try a more specific address.' }, { status: 404 })

  try {
    const solar = await fetchSolarData(geo.lat, geo.lng)
    const { totalSqft, totalSquares, dominantPitch, imageryDate } = parseSolar(solar)

    if (totalSqft === 0) {
      return NextResponse.json({ error: 'Could not calculate roof size for this address. Try a nearby address.' }, { status: 422 })
    }

    return NextResponse.json({
      sqft:             totalSqft,
      squares:          totalSquares,
      pitch:            dominantPitch,
      imageryDate,
      lat:              geo.lat,
      lng:              geo.lng,
      formattedAddress: geo.formattedAddress,
    })
  } catch {
    return NextResponse.json({ error: 'Roof data unavailable for this address. Try again or enter a different address.' }, { status: 502 })
  }
}

// ── POST: capture lead ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, phone, address, sqft, squares, pitch } = body

  if (!name || !email || !address) {
    return NextResponse.json({ error: 'name, email and address are required' }, { status: 400 })
  }
  if (!ORG_PRO_ID) {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  const sb = getSupabaseAdmin()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

  // Insert the lead
  const { data: lead, error } = await sb.from('leads').insert({
    pro_id:           ORG_PRO_ID,
    trade_slug:       'roofing',
    contact_name:     name.trim(),
    contact_email:    email.toLowerCase().trim(),
    contact_phone:    phone?.trim() || null,
    property_address: address.trim(),
    message:          `Roof size: ${sqft} sq ft (${squares} squares), pitch ${pitch}. Submitted via roof-size-calculator.`,
    lead_source:      'roof_calculator',
    lead_status:      'new_lead',
  }).select('id').single()

  if (error || !lead) {
    console.error('[roof-calc] lead insert error:', error?.message)
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }

  // Roofing job data (pre-fill the roof size from the calculator)
  await sb.from('roofing_job_data').insert({
    lead_id:      lead.id,
    pro_id:       ORG_PRO_ID,
    square_count: squares,
  }).catch(() => {})  // non-fatal

  return NextResponse.json({ ok: true, leadId: lead.id })
}
