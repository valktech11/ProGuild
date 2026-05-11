// app/api/roofing/dsm/route.ts
// POST /api/roofing/dsm — computes linear footage from roofSegmentStats in solar_raw
// GET  /api/roofing/dsm — debug modes (staging only)

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { computeLinearFootageFromSegments, fetchDataLayers } from '@/lib/roofing/dsmAnalysis'
import { apiError, validateCoordinates, isValidUuid } from '@/lib/api/utils'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

export async function POST(req: NextRequest) {
  // 1. Parse body
  let body: unknown
  try { body = await req.json() }
  catch { return apiError('Invalid JSON in request body', 400) }

  if (!body || typeof body !== 'object') return apiError('Request body must be a JSON object', 400)
  const { report_id, pro_id } = body as Record<string, unknown>

  // 2. Validate IDs
  if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
  if (!isValidUuid(pro_id))    return apiError('pro_id must be a valid UUID', 400)

  const sb = getSupabaseAdmin()

  // 3. Fetch report — verify ownership + pull solar_raw and perimeter footage
  const { data: report, error: fetchErr } = await sb
    .from('roof_reports')
    .select('id, solar_raw, linear_footage')
    .eq('id', report_id)
    .eq('pro_id', pro_id)
    .single()

  if (fetchErr || !report) return apiError('Report not found or access denied', 403)

  // 4. Extract roofSegmentStats from solar_raw
  const solar = report.solar_raw as Record<string, unknown> | null
  if (!solar) return apiError('No Solar API data on this report — regenerate the Bid Report first', 422)

  const potential = solar.solarPotential as Record<string, unknown> | null
  const segments = potential?.roofSegmentStats as unknown[] | null

  if (!segments || segments.length === 0) {
    return apiError('No roof segments in Solar API data — regenerate the Bid Report first', 422)
  }

  // 5. Get eave/rake — use existing linear_footage if available (has correct perimeter values),
  //    otherwise derive from Solar API building stats perimeter
  const existingLf = report.linear_footage as Record<string, number> | null
  let eave_ft = existingLf?.eave_ft ?? 0
  let rake_ft  = existingLf?.rake_ft ?? 0

  // If no prior linear_footage, estimate from Solar API ground area
  // groundAreaMeters2 total ≈ building footprint → perimeter ≈ 4*sqrt(area)
  // Split 70/30 eave/rake as per original heuristic
  if (eave_ft === 0 && rake_ft === 0) {
    const totalGndM2 = (segments as Array<Record<string, unknown>>).reduce((sum, s) => {
      const stats = s.stats as Record<string, number> | undefined
      return sum + (s.groundAreaMeters2 as number ?? stats?.groundAreaMeters2 ?? 0)
    }, 0)
    if (totalGndM2 > 0) {
      const perimeterM = 4 * Math.sqrt(totalGndM2)  // rough square-building estimate
      const M_TO_FT = 3.28084
      eave_ft = Math.round(perimeterM * 0.70 * M_TO_FT)
      rake_ft  = Math.round(perimeterM * 0.30 * M_TO_FT)
      console.log(`[dsm] estimated eave=${eave_ft}ft rake=${rake_ft}ft from ground area ${totalGndM2.toFixed(0)}m²`)
    }
  } else {
    console.log(`[dsm] using existing eave=${eave_ft}ft rake=${rake_ft}ft from prior linear_footage`)
  }

  // 6. Compute linear footage from segment geometry
  let linear
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linear = computeLinearFootageFromSegments(segments as any[], eave_ft, rake_ft)
  } catch (e) {
    console.error('[dsm] segment analysis error:', e)
    return apiError('Linear footage computation failed', 500, e)
  }

  if (!linear) {
    return apiError('Could not compute linear footage from roof segment data', 422)
  }

  // 7. Persist — double-confirm ownership on write
  const { error: updateErr } = await sb
    .from('roof_reports')
    .update({ linear_footage: linear })
    .eq('id', report_id)
    .eq('pro_id', pro_id)

  if (updateErr) {
    console.error('[dsm] persist error:', updateErr.message)
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
            // Correct Solar API field names
            pitchDegrees: seg.pitchDegrees,
            azimuthDegrees: seg.azimuthDegrees,
            area_m2: stats?.areaMeters2,
            area_sqft: stats?.areaMeters2 ? Math.round((stats.areaMeters2 as number) * 10.7639) : null,
            center: center ? { lat: center.latitude, lng: center.longitude } : null,
            bbox: bbox,
            groundArea_m2: seg.groundAreaMeters2,
            // Dump all top-level keys so we know exactly what's available
            all_keys: Object.keys(seg),
            // Raw stats object
            stats_raw: stats,
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
