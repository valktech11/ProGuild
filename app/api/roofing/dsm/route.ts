// app/api/roofing/dsm/route.ts
// POST /api/roofing/dsm — runs DSM+RANSAC, stores linear_footage on report
// GET  /api/roofing/dsm — debug: raw Solar API dataLayers response

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runDsmAnalysis, fetchDataLayers } from '@/lib/roofing/dsmAnalysis'
import { apiError, validateCoordinates, isValidUuid } from '@/lib/api/utils'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

export async function POST(req: NextRequest) {
  // 1. Parse body safely
  let body: unknown
  try { body = await req.json() }
  catch { return apiError('Invalid JSON in request body', 400) }

  if (!body || typeof body !== 'object') return apiError('Request body must be a JSON object', 400)
  const { lat, lng, report_id, pro_id } = body as Record<string, unknown>

  // 2. Validate coordinates
  const coords = validateCoordinates(lat, lng)
  if (!coords.valid) return apiError(coords.error, 400)

  // 3. Validate and authenticate — both IDs required to prevent IDOR
  if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
  if (!isValidUuid(pro_id)) return apiError('pro_id must be a valid UUID', 400)

  if (!GOOGLE_KEY) return apiError('Google Solar API not configured', 503)

  // 4. Verify ownership before running expensive computation
  const sb = getSupabaseAdmin()
  const { data: owned, error: ownerErr } = await sb
    .from('roof_reports')
    .select('id')
    .eq('id', report_id)
    .eq('pro_id', pro_id)
    .single()

  if (ownerErr || !owned) return apiError('Report not found or access denied', 403)

  // 5. Run DSM analysis
  let linear
  try {
    linear = await runDsmAnalysis(coords.lat, coords.lng, GOOGLE_KEY)
  } catch (e) {
    console.error('[dsm] analysis error:', e)
    return apiError('DSM analysis failed', 500, e)
  }

  if (!linear) {
    return apiError('No roof planes found — roof may be flat, small, or outside Solar API coverage', 422)
  }

  // 6. Persist — double-confirm ownership on write
  const { error: updateErr } = await sb
    .from('roof_reports')
    .update({ linear_footage: linear })
    .eq('id', report_id)
    .eq('pro_id', pro_id)

  if (updateErr) {
    console.error('[dsm] persist error:', updateErr.message)
    // Non-fatal: return result even if DB write fails
  }

  return NextResponse.json({ success: true, linear_footage: linear })
}

export async function GET(req: NextRequest) {
  // Staging gate
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode')

  // mode=segments&report_id=<uuid> — dumps roofSegmentStats from solar_raw in DB
  if (mode === 'segments') {
    const report_id = searchParams.get('report_id')
    if (!isValidUuid(report_id)) {
      return NextResponse.json({ error: 'report_id must be a valid UUID' }, { status: 400 })
    }
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('roof_reports')
      .select('address, lat, lng, solar_raw, linear_footage, total_squares_order, dominant_pitch, facet_count')
      .eq('id', report_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Report not found', detail: error?.message }, { status: 404 })
    }

    const solar = data.solar_raw as Record<string, unknown> | null
    if (!solar) {
      return NextResponse.json({ error: 'No solar_raw data on this report — regenerate the Bid Report first' }, { status: 422 })
    }

    // Extract the key geometric data from buildingInsights
    const segments = (solar.solarPotential as Record<string, unknown>)?.roofSegmentStats as unknown[]
    const panelConfig = (solar.solarPotential as Record<string, unknown>)?.solarPanelConfigs
    const buildingBbox = (solar.solarPotential as Record<string, unknown>)?.boundingBox

    // Summarise each segment for readability
    const segmentSummary = Array.isArray(segments)
      ? segments.map((s: unknown, i: number) => {
          const seg = s as Record<string, unknown>
          const stats = seg.stats as Record<string, unknown> | undefined
          const center = seg.center as Record<string, unknown> | undefined
          const bbox = seg.boundingBox as Record<string, unknown> | undefined
          return {
            id: i,
            pitchDeg: seg.pitchDeg,
            azimuthDeg: seg.azimuthDeg,       // compass direction face points toward (0=N, 90=E, 180=S, 270=W)
            area_m2: stats?.areaMeters2,
            area_sqft: stats?.areaMeters2 ? Math.round((stats.areaMeters2 as number) * 10.7639) : null,
            center: center ? { lat: center.latitude, lng: center.longitude } : null,
            bbox: bbox,
            groundArea_m2: seg.groundAreaMeters2,
          }
        })
      : null

    return NextResponse.json({
      report: {
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        total_squares: data.total_squares_order,
        dominant_pitch: data.dominant_pitch,
        facet_count: data.facet_count,
        existing_linear_footage: data.linear_footage,
      },
      segment_count: segmentSummary?.length ?? 0,
      segments: segmentSummary,
      building_bbox: buildingBbox,
      solar_raw_keys: Object.keys(solar),
      solar_potential_keys: solar.solarPotential ? Object.keys(solar.solarPotential as object) : [],
    })
  }

  // Default mode — raw dataLayers
  const coords = validateCoordinates(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.valid) return apiError(coords.error, 400)
  if (!GOOGLE_KEY) return apiError('GOOGLE_SOLAR_API_KEY not configured', 503)

  try {
    const layers = await fetchDataLayers(coords.lat, coords.lng, GOOGLE_KEY)
    return NextResponse.json({ layers })
  } catch (e) {
    return apiError('Failed to fetch Solar dataLayers', 502, e)
  }
}
