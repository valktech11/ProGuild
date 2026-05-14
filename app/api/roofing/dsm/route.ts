// app/api/roofing/dsm/route.ts
// POST /api/roofing/dsm — computes linear footage from roofSegmentStats in solar_raw
// GET  /api/roofing/dsm — debug modes (staging only)

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  computeLinearFootageFromSegments,
  computeLinearFootageV3,
  fetchDataLayers,
  decodeGeoTiff,
  traceMaskPerimeter,
  deriveWingBoundariesFromSegments,
  detectHasGable,
  type RoofSegment,
} from '@/lib/roofing/dsmAnalysis'
import {
  resolveRidgeLengthsViaElevation,
  type RidgePair,
  type RidgeEdge,
  type ElevSegment,
} from '@/lib/roofing/elevationRidge'
import { fetchWingBoundaries } from '@/lib/roofing/osmBuilding'
import { apiError, validateCoordinates, isValidUuid } from '@/lib/api/utils'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

// Extract the azimuth of the largest roof segment (by groundAreaMeters2).
// Used as the reference direction for Phase 3 mask edge classification.
// Returns 180 (South) as a neutral default when segments are empty or malformed.

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
    .select('id, solar_raw, linear_footage, lat, lng')
    .eq('id', report_id)
    .eq('pro_id', pro_id)
    .single()

  if (fetchErr || !report) return apiError('Report not found or access denied', 403)

  // 4. Extract roofSegmentStats from solar_raw
  const solar = report.solar_raw as Record<string, unknown> | null
  if (!solar) return apiError('No Solar API data on this report — regenerate the Bid Report first', 422)

  const potential    = solar.solarPotential as Record<string, unknown> | null
  const segments     = potential?.roofSegmentStats as unknown[] | null
  const solarPanels  = potential?.solarPanels as Array<{
    center: { latitude: number; longitude: number }; segmentIndex: number
  }> | null
  const imageryQuality = (solar.imageryQuality as string | undefined) ?? ''

  if (!segments || segments.length === 0) {
    return apiError('No roof segments in Solar API data — regenerate the Bid Report first', 422)
  }

  // 5. Fetch mask perimeter + wing boundaries in parallel.
  // maskPerimeterM → pixel-accurate total drip-edge length (scales segment rake-ratio).
  // wingBoundaries → cross-wing hip rejection (Phase 5, hip-only gate on bothMain pairs).
  let maskPerimeterM = 0
  const M_TO_FT = 3.28084

  const solarCenter = solar.center as { latitude: number; longitude: number } | null
  const propLat = solarCenter?.latitude ?? (report.lat as number)
  const propLng = solarCenter?.longitude ?? (report.lng as number)

  // Phase 5 wing detection: Solar API centroid data does not spread segment centroids
  // spatially by wing — all centroids cluster within ~12m regardless of building shape.
  // Wing rejection has no effect on Hockley (wings=0) and may reject real RH hip pairs.
  // Disabled in production path; kept for wing-debug diagnostic mode.
  // TODO: re-enable when Elevation API bbox-corner heights are available (Sprint 5D).
  const wings: Array<{ a: { lat: number; lng: number }; b: { lat: number; lng: number } }> = []

  if ((imageryQuality === 'HIGH' || imageryQuality === 'MEDIUM') && GOOGLE_KEY) {
    try {
      const layers = await fetchDataLayers(propLat, propLng, GOOGLE_KEY, imageryQuality)
      if (layers?.maskUrl) {
        const maskGrid = await decodeGeoTiff(layers.maskUrl, GOOGLE_KEY)
        if (maskGrid) {
          const perim = traceMaskPerimeter(maskGrid)
          if (perim.mainBuildingPixels > 100) {
            maskPerimeterM = perim.perimeterM
            console.log(`[dsm] mask perimeter: ${Math.round(perim.perimeterM * M_TO_FT)}ft (${perim.mainBuildingPixels}px)`)
          }
        }
      }
    } catch (e) {
      console.warn('[dsm] mask fetch failed:', e instanceof Error ? e.message : String(e))
    }
  }

  // Sprint 6 Option A: resolve ridge lengths via Elevation API before running classifier.
  // GATING: only run on gable roofs. Pure hip roofs have no real ridge — elevation would
  // find the hip apex distance which is LONGER than the v2 approximation, making it worse.
  // detectHasGable() uses the same azDiff>150° + bbox logic as the ridge loop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasGable = detectHasGable(segments as any[])
  let resolvedRidgeEdges: RidgeEdge[] | undefined
  if (hasGable && GOOGLE_KEY && (imageryQuality === 'HIGH' || imageryQuality === 'MEDIUM')) {
    try {
      const ridgePairs = detectRidgePairsForElevation(segments as ElevSegment[])
      if (ridgePairs.length > 0) {
        console.log(`[dsm] resolving ${ridgePairs.length} ridge pairs via Elevation API`)
        resolvedRidgeEdges = await resolveRidgeLengthsViaElevation(
          ridgePairs,
          segments as ElevSegment[],
          GOOGLE_KEY,
        )
      }
    } catch (elevErr) {
      console.warn('[dsm] Elevation API failed — using v2 ridge lengths:', String(elevErr).slice(0, 150))
      resolvedRidgeEdges = undefined
    }
  }

  let v2Result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    v2Result = computeLinearFootageFromSegments(segments as any[], maskPerimeterM, 0, 0, wings, resolvedRidgeEdges)
  } catch (e) {
    console.error('[dsm] v2 error:', e)
    return apiError('Linear footage computation failed', 500, e)
  }

  // 6. Sprint 5 v3: bbox adjacency + height-direction classifier
  // v3 R+H/V is more accurate for complex roofs — use it when it passes safety check.
  // Eave/rake: v3 uses the same Phase 3 classified mask eave/rake (maskPerimeterM passed through).
  let linear = v2Result
  if (solarPanels && solarPanels.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v3Result = computeLinearFootageV3(segments as any[], solarPanels, maskPerimeterM, v2Result)
      linear = v3Result
      console.log(`[dsm] v3 result: ridge=${v3Result.ridge_ft} hip=${v3Result.hip_ft} valley=${v3Result.valley_ft} eave=${v3Result.eave_ft} rake=${v3Result.rake_ft}`)
    } catch (e) {
      console.warn('[dsm] v3 failed, using v2:', e instanceof Error ? e.message : String(e))
      linear = v2Result
    }
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



// ── Ridge pair detection for Elevation API (Sprint 6) ────────────────────────
// Mirrors the gate logic in computeLinearFootageFromSegments but only collects
// pairs without accumulating lengths. Called before computeLinearFootageFromSegments
// so Elevation API can resolve lengths prior to the classifier run.

function detectRidgePairsForElevation(segments: ElevSegment[]): RidgePair[] {
  const MAIN_FACE_M2 = 18
  const RIDGE_HEIGHT_MAX = 3.0
  const DEG_TO_M = 111320
  const pairs: RidgePair[] = []
  const counted = new Set<string>()
  const n = segments.length

  function gnd(s: ElevSegment): number {
    return s.groundAreaMeters2 ?? s.stats.groundAreaMeters2 ?? s.stats.areaMeters2
  }
  function azDiff(a: number, b: number): number {
    let d = Math.abs(a - b) % 360
    if (d > 180) d = 360 - d
    return d
  }
  function distM(a: ElevSegment, b: ElevSegment): number {
    const dlat = (a.center.latitude - b.center.latitude) * DEG_TO_M
    const dlng = (a.center.longitude - b.center.longitude) * DEG_TO_M * Math.cos(a.center.latitude * Math.PI / 180)
    return Math.sqrt(dlat * dlat + dlng * dlng)
  }
  function adjOk(a: ElevSegment, b: ElevSegment, factor: number): boolean {
    return distM(a, b) <= Math.sqrt(Math.min(gnd(a), gnd(b))) * factor
  }
  function h(s: ElevSegment): number { return s.planeHeightAtCenterMeters ?? NaN }

  function bboxOverlap(a: ElevSegment, b: ElevSegment, tol: number): boolean {
    const ra = a.boundingBox, rb = b.boundingBox
    if (!ra || !rb) return adjOk(a, b, 2.5)
    return !(
      ra.ne.latitude  + tol < rb.sw.latitude  || rb.ne.latitude  + tol < ra.sw.latitude  ||
      ra.ne.longitude + tol < rb.sw.longitude || rb.ne.longitude + tol < ra.sw.longitude
    )
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = segments[i], b = segments[j]
      const aMain = gnd(a) >= MAIN_FACE_M2, bMain = gnd(b) >= MAIN_FACE_M2
      if (!aMain && !bMain) continue
      if (azDiff(a.azimuthDegrees, b.azimuthDegrees) <= 150) continue
      const bothMain = aMain && bMain
      if (bothMain) {
        const bboxPass = bboxOverlap(a, b, 0.0003)
        const ha = h(a), hb = h(b)
        const heightPass = !isNaN(ha) && !isNaN(hb) && Math.abs(ha - hb) < RIDGE_HEIGHT_MAX && adjOk(a, b, 4.0)
        if (!bboxPass && !heightPass) continue
      } else {
        if (!adjOk(a, b, 2.5)) continue
      }
      const key = `${i}-${j}`
      if (counted.has(key)) continue
      counted.add(key)
      const v2LengthM = Math.min(Math.sqrt(gnd(a)), Math.sqrt(gnd(b))) * 0.7
      pairs.push({ i, j, v2LengthM })
    }
  }
  return pairs
}

export async function GET(req: NextRequest) {
  // Staging gate
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode')

  // mode=recompute-all — runs classifier on all 3 test properties, one URL
  if (mode === 'recompute-all') {
    const TEST_IDS = [
      { id: 'b200b680-7b7b-48d5-89bd-7de8dc8dfd2c', label: 'Jacksonville' },
      { id: '208d31e4-fc0a-4a6f-a1e8-9a3d42de6c7a', label: 'Hockley' },
      { id: '5630f286-b52d-4fcd-a423-57c3ba5f5b5a', label: 'Rochester Hills' },
    ]
    const ROOFR = {
      Jacksonville:    { ridge: 29,  hip: 149, valley: 37,  eave: 224, rake: 53  },
      Hockley:         { ridge: 78,  hip: 238, valley: 105, eave: 317, rake: 45  },
      'Rochester Hills': { ridge: 173, hip: 170, valley: 188, eave: 298, rake: 144 },
    } as Record<string, Record<string, number>>

    const sb = getSupabaseAdmin()
    const results = []

    for (const { id, label } of TEST_IDS) {
      const { data: report } = await sb
        .from('roof_reports')
        .select('address, lat, lng, solar_raw')
        .eq('id', id)
        .single()
      if (!report) { results.push({ label, error: 'not found' }); continue }

      const solar = report.solar_raw as Record<string, unknown> | null
      if (!solar) { results.push({ label, error: 'no solar_raw' }); continue }

      const potential   = solar.solarPotential as Record<string, unknown> | null
      const segments    = potential?.roofSegmentStats as unknown[] | null
      const solarPanels = potential?.solarPanels as Array<{ center: { latitude: number; longitude: number }; segmentIndex: number }> | null
      const imageryQuality = (solar.imageryQuality as string | undefined) ?? ''
      if (!segments?.length) { results.push({ label, error: 'no segments' }); continue }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v2 = computeLinearFootageFromSegments(segments as any[], 0, 0, 0)

      let maskPerimeterM = 0
      const M_TO_FT = 3.28084
      const solarCtr = solar.center as { latitude: number; longitude: number } | null
      const cLat = solarCtr?.latitude ?? (report.lat as number)
      const cLng = solarCtr?.longitude ?? (report.lng as number)

      const wings: Array<{ a: { lat: number; lng: number }; b: { lat: number; lng: number } }> = []

      if ((imageryQuality === 'HIGH' || imageryQuality === 'MEDIUM') && GOOGLE_KEY) {
        try {
          const layers = await fetchDataLayers(cLat, cLng, GOOGLE_KEY, imageryQuality)
          if (layers?.maskUrl) {
            const maskGrid = await decodeGeoTiff(layers.maskUrl, GOOGLE_KEY)
            if (maskGrid) {
              const perim = traceMaskPerimeter(maskGrid)
              if (perim.mainBuildingPixels > 100) maskPerimeterM = perim.perimeterM
            }
          }
        } catch { /* mask optional */ }
      }

      // Sprint 6: two-pass elevation resolution in recompute-all (read-only test)
      // Skip for pure hip roofs — elevation makes hip-face pairs longer, not shorter.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasGableRC = detectHasGable(segments as any[])
      let recomputeRidgeEdges: RidgeEdge[] | undefined
      if (hasGableRC && GOOGLE_KEY && (imageryQuality === 'HIGH' || imageryQuality === 'MEDIUM')) {
        try {
          const rPairs = detectRidgePairsForElevation(segments as ElevSegment[])
          if (rPairs.length > 0) {
            recomputeRidgeEdges = await resolveRidgeLengthsViaElevation(rPairs, segments as ElevSegment[], GOOGLE_KEY)
          }
        } catch (elevErr) {
          console.warn(`[dsm] recompute-all elevation failed for ${label}:`, String(elevErr).slice(0, 200))
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v2m = computeLinearFootageFromSegments(segments as any[], maskPerimeterM, 0, 0, wings, recomputeRidgeEdges)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v3  = solarPanels?.length ? computeLinearFootageV3(segments as any[], solarPanels, maskPerimeterM, v2m) : null
      const fin = v3 ?? v2m
      const truth = ROOFR[label] ?? {}

      const pct = (got: number, want: number) => want ? `${got > want ? '+' : ''}${Math.round((got-want)/want*100)}%` : '?'
      const elevResolved = recomputeRidgeEdges ? recomputeRidgeEdges.filter(e => e.fromElevation).length : 0
      const elevTotal = recomputeRidgeEdges ? recomputeRidgeEdges.length : 0
      const elevStatus = !hasGableRC ? 'skipped (pure hip)' : `${elevResolved}/${elevTotal} resolved`
      results.push({
        label,
        final: { ridge: fin.ridge_ft, hip: fin.hip_ft, valley: fin.valley_ft, eave: fin.eave_ft, rake: fin.rake_ft },
        roofr: truth,
        delta: {
          ridge: pct(fin.ridge_ft, truth.ridge), hip: pct(fin.hip_ft, truth.hip),
          valley: pct(fin.valley_ft, truth.valley), eave: pct(fin.eave_ft, truth.eave), rake: pct(fin.rake_ft, truth.rake),
        },
        mask_ft: maskPerimeterM > 0 ? Math.round(maskPerimeterM * M_TO_FT) : null,
        wings: wings.length,
        elevation_pairs: elevStatus,
        source: v3 ? (v3 === v2m ? 'v2 (v3 safety fallback)' : 'v3') : 'v2+mask',
      })
    }
    return NextResponse.json({ results, note: 'READ ONLY — no DB write', build: 'Sprint6-307aeb1-v3' })
  }

  // mode=wing-debug&report_id=<uuid> — dumps segment centroids + derived wing boundaries
  // Shows the PCA projection, spatial gap, and which hip pairs would be rejected.
  if (mode === 'wing-debug') {
    const report_id = searchParams.get('report_id')
    if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
    const sb = getSupabaseAdmin()
    const { data: report, error: rErr } = await sb
      .from('roof_reports')
      .select('address, solar_raw')
      .eq('id', report_id)
      .single()
    if (rErr || !report) return apiError('Report not found', 404)
    const solar = report.solar_raw as Record<string, unknown> | null
    if (!solar) return apiError('No solar_raw', 422)
    const potential = solar.solarPotential as Record<string, unknown> | null
    const segments  = potential?.roofSegmentStats as unknown[] | null
    if (!segments?.length) return apiError('No segments', 422)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wings = deriveWingBoundariesFromSegments(segments as any[])

    const MAIN_M2 = 18
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segSummary = (segments as any[]).map((s: any, i: number) => {
      const area = s.groundAreaMeters2 ?? s.stats?.groundAreaMeters2 ?? s.stats?.areaMeters2 ?? 0
      return {
        idx: i,
        az: s.azimuthDegrees?.toFixed(1),
        pitch: s.pitchDegrees?.toFixed(1),
        area_m2: area?.toFixed(1),
        isMain: area >= MAIN_M2,
        height_msl: s.planeHeightAtCenterMeters ?? null,
        center: s.center ? { lat: s.center.latitude?.toFixed(6), lng: s.center.longitude?.toFixed(6) } : null,
        bbox: s.boundingBox ?? null,
        all_keys: Object.keys(s),
      }
    })

    return NextResponse.json({
      address: report.address,
      segments: segSummary,
      wings_detected: wings.length,
      wing_boundaries: wings,
      note: 'READ ONLY — check [seg-wing] logs in Vercel function output for PCA details',
    })
  }

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

  // mode=mask-spike&report_id=<uuid> — Sprint 5 Phase 1 validation
  // Uses EXACT building centroid from solar_raw.center (not user-supplied coords).
  // Extracts LARGEST connected component to isolate main building from neighbours.
  if (mode === 'mask-spike') {
    const report_id = searchParams.get('report_id')
    if (!isValidUuid(report_id)) return apiError('report_id required', 400)
    if (!GOOGLE_KEY) return apiError('GOOGLE_SOLAR_API_KEY not configured', 503)

    const sb = getSupabaseAdmin()
    const { data: report, error: rErr } = await sb
      .from('roof_reports')
      .select('address, lat, lng, solar_raw')
      .eq('id', report_id)
      .single()
    if (rErr || !report) return apiError('Report not found', 404)

    // Use exact building centroid from solar_raw.center
    const solar = report.solar_raw as Record<string, unknown> | null
    const solarCenter = solar?.center as { latitude: number; longitude: number } | null
    const lat = solarCenter?.latitude ?? (report.lat as number)
    const lng = solarCenter?.longitude ?? (report.lng as number)

    try {
      const layers = await fetchDataLayers(lat, lng, GOOGLE_KEY)
      if (!layers?.maskUrl) return apiError('No maskUrl from dataLayers', 502)

      const mask = await decodeGeoTiff(layers.maskUrl, GOOGLE_KEY)
      if (!mask) return apiError('Failed to decode mask GeoTIFF', 502)

      const result = traceMaskPerimeter(mask)
      return NextResponse.json({
        address: report.address,
        centroid_used: { lat, lng },
        mask_dimensions: `${mask.width}×${mask.height}`,
        total_roof_pixels: result.roofPixels,
        main_building_pixels: result.mainBuildingPixels,
        perimeter_pixels: result.perimeterPixels,
        pixel_size_m: 0.1,
        perimeter_m: result.perimeterM,
        perimeter_ft: Math.round(result.perimeterM * 3.28084),
        roofr_truth_ft: { rochester_hills: 442, jacksonville: 277, hockley: 362 },
        note: 'perimeter_ft should be within 20% of roofr_truth_ft if mask traces drip edge',
      })
    } catch (e) {
      return apiError('Mask spike failed', 500, e)
    }
  }

  // mode=recompute&report_id=<uuid> — runs full classifier on solar_raw, returns result, NO DB write
  // Use this to test classifier changes without clicking through the UI.
  if (mode === 'recompute') {
    const report_id = searchParams.get('report_id')
    if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
    const sb = getSupabaseAdmin()
    const { data: report, error: rErr } = await sb
      .from('roof_reports')
      .select('id, address, lat, lng, solar_raw')
      .eq('id', report_id)
      .single()
    if (rErr || !report) return apiError('Report not found', 404)

    const solar = report.solar_raw as Record<string, unknown> | null
    if (!solar) return apiError('No solar_raw — regenerate Bid Report first', 422)

    const potential   = solar.solarPotential as Record<string, unknown> | null
    const segments    = potential?.roofSegmentStats as unknown[] | null
    const solarPanels = potential?.solarPanels as Array<{ center: { latitude: number; longitude: number }; segmentIndex: number }> | null
    const imageryQuality = (solar.imageryQuality as string | undefined) ?? ''

    if (!segments || segments.length === 0) return apiError('No roof segments in solar_raw', 422)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v2Result = computeLinearFootageFromSegments(segments as any[], 0, 0, 0)

    let maskPerimeterM = 0
    const M_TO_FT = 3.28084
    const solarCtrR = solar.center as { latitude: number; longitude: number } | null
    const rLat = solarCtrR?.latitude ?? (report.lat as number)
    const rLng = solarCtrR?.longitude ?? (report.lng as number)

    const wingsR: Array<{ a: { lat: number; lng: number }; b: { lat: number; lng: number } }> = []

    if ((imageryQuality === 'HIGH' || imageryQuality === 'MEDIUM') && GOOGLE_KEY) {
      try {
        const layers = await fetchDataLayers(rLat, rLng, GOOGLE_KEY, imageryQuality)
        if (layers?.maskUrl) {
          const maskGrid = await decodeGeoTiff(layers.maskUrl, GOOGLE_KEY)
          if (maskGrid) {
            const perim = traceMaskPerimeter(maskGrid)
            if (perim.mainBuildingPixels > 100) maskPerimeterM = perim.perimeterM
          }
        }
      } catch { /* mask optional */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v2WithMask = computeLinearFootageFromSegments(segments as any[], maskPerimeterM, 0, 0, wingsR)

    let v3Result = null
    if (solarPanels && solarPanels.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      v3Result = computeLinearFootageV3(segments as any[], solarPanels, maskPerimeterM, v2WithMask)
    }

    const final = v3Result ?? v2WithMask
    return NextResponse.json({
      address: report.address,
      imagery_quality: imageryQuality,
      mask_perimeter_ft: maskPerimeterM > 0 ? Math.round(maskPerimeterM * M_TO_FT) : null,
      wings_count: wingsR.length,
      v2_no_mask:  { ridge: v2Result.ridge_ft,    hip: v2Result.hip_ft,    valley: v2Result.valley_ft,    eave: v2Result.eave_ft,    rake: v2Result.rake_ft },
      v2_mask:     { ridge: v2WithMask.ridge_ft,   hip: v2WithMask.hip_ft,  valley: v2WithMask.valley_ft,  eave: v2WithMask.eave_ft,  rake: v2WithMask.rake_ft },
      v3:          v3Result ? { ridge: v3Result.ridge_ft, hip: v3Result.hip_ft, valley: v3Result.valley_ft, eave: v3Result.eave_ft, rake: v3Result.rake_ft } : null,
      final:       { ridge: final.ridge_ft,        hip: final.hip_ft,       valley: final.valley_ft,       eave: final.eave_ft,       rake: final.rake_ft },
      roofr_truth: { jacksonville: { ridge:29,hip:149,valley:37,eave:224,rake:53 }, hockley: { ridge:78,hip:238,valley:105,eave:317,rake:45 }, rochester_hills: { ridge:173,hip:170,valley:188,eave:298,rake:144 } },
      note: 'READ ONLY — no DB write. Final = v3 if safety check passed, else v2_mask.',
    })
  }

  // mode=elev-test — tests Elevation API with a single known point (Jacksonville centroid)
  // Use this to confirm the API is enabled and the key works.
  if (mode === 'elev-test') {
    if (!GOOGLE_KEY) return apiError('GOOGLE_SOLAR_API_KEY not configured', 503)
    const testPt = { lat: 30.324678, lng: -81.655196 }  // Jacksonville FL test point
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${testPt.lat},${testPt.lng}&key=${GOOGLE_KEY}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const json = await res.json() as Record<string, unknown>
      return NextResponse.json({
        http_status: res.status,
        api_response: json,
        key_prefix: GOOGLE_KEY.slice(0, 8) + '...',
        note: 'status OK + elevation number = API enabled. REQUEST_DENIED = API not enabled in GCP.',
      })
    } catch (e) {
      return apiError('Elevation API test failed', 502, e)
    }
  }

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
