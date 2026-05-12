/**
 * app/api/roofing/premium-report/route.ts
 * POST /api/roofing/premium-report
 *
 * Auth pattern matches report/route.ts and dsm/route.ts:
 * pro_id + report_id from request body, validated as UUIDs.
 * No Bearer token — consistent with existing codebase.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { apiError, isValidUuid, getR2Client, getR2Bucket } from '@/lib/api/utils'
import { buildPremiumReport, type PremiumReportData, type RoofSegment } from '@/lib/roofing/premiumReportPdf'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const MAPS_STATIC_BASE = 'https://maps.googleapis.com/maps/api/staticmap'
const STREET_VIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview'
const IMAGE_TIMEOUT_MS = 15_000
const R2_SIGNED_URL_EXPIRY = 60 * 60 * 24 * 7

interface DbReport {
  id: string
  address: string
  lat: number
  lng: number
  total_sqft: number | null
  total_squares_order: number | null
  dominant_pitch: string | null
  facet_count: number | null
  waste_factor: number | null
  imagery_date: string | null
  pitch_breakdown: Array<{ pitch: string; sqft: number; sq: number; pct: number }> | null
  linear_footage: {
    ridge_ft?: number; hip_ft?: number; valley_ft?: number
    rake_ft?: number; eave_ft?: number; total_linear_ft?: number
    accuracy_note?: string; facet_count?: number
  } | null
  solar_raw: {
    solarPotential?: {
      roofSegmentStats?: RoofSegment[]
      boundingBox?: {
        sw?: { latitude?: number; longitude?: number }
        ne?: { latitude?: number; longitude?: number }
      }
    }
  } | null
  premium_r2_key: string | null
  pro_id: string
}

interface ProRecord {
  id: string
  full_name: string | null
  email: string | null
  business_name: string | null
  phone_cell: string | null
  license_verified: boolean | null
}

async function fetchImageBase64(url: string, label = ''): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS), headers: { 'Accept': 'image/*' } })
    if (!res.ok) { console.warn(`[premium-report] ${label} HTTP ${res.status}`); return '' }
    const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return ''
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    console.warn(`[premium-report] ${label} error:`, err instanceof Error ? err.message : err)
    return ''
  }
}

function buildTopViewUrl(lat: number, lng: number, bbox: PremiumReportData['bbox'], apiKey: string): string {
  // No path overlay — clean satellite image only
  return `${MAPS_STATIC_BASE}?center=${lat},${lng}&zoom=20&size=640x480&maptype=satellite&key=${apiKey}`
}

// Fetch Street View using metadata-first approach.
// source=outdoor in metadata SHOULD filter indoor panos, but Google sometimes still returns
// user-uploaded indoor photos via pano_id. We therefore:
//  1. Check metadata for an outdoor pano within 50m (tight radius = must be very close)
//  2. If the close-radius check passes, use pano_id with the heading
//  3. If no close pano, try direct location URL without pano_id (Google picks nearest outdoor)
//  4. If the returned image is < 5KB it's likely the grey "no imagery" tile — reject it
async function fetchStreetViewBase64(lat: number, lng: number, heading: number, apiKey: string, label: string): Promise<string> {
  // Skip metadata entirely — use location= + source=outdoor directly in the image URL.
  // Google picks the nearest outdoor pano server-side; this reliably avoids user-uploaded indoor photos.
  const imgUrl = `${STREET_VIEW_BASE}?location=${lat},${lng}&radius=500&source=outdoor&heading=${heading}&pitch=10&fov=90&size=640x400&key=${apiKey}`
  try {
    const res = await fetch(imgUrl, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS), headers: { 'Accept': 'image/*' } })
    if (!res.ok) {
      console.warn(`[premium-report] ${label} HTTP ${res.status}`)
      return ''
    }
    const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 5000) {
      console.warn(`[premium-report] ${label} image too small (${buf.length}B) — no outdoor imagery`)
      return ''
    }
    console.log(`[premium-report] ${label} fetched OK (${Math.round(buf.length / 1024)}KB)`)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    console.warn(`[premium-report] Street View error ${label}:`, err instanceof Error ? err.message : err)
    return ''
  }
}

function parseBbox(solar: DbReport['solar_raw']): PremiumReportData['bbox'] {
  const solarRecord = normalizeSolarRaw(solar)
  if (!solarRecord) return null
  // boundingBox is top-level on the buildingInsights response
  const bb = (solarRecord.boundingBox ?? (solarRecord.solarPotential as Record<string,unknown>|null)?.boundingBox) as Record<string, unknown> | null
  if (!bb) return null
  const sw = bb.sw as Record<string, unknown> | null
  const ne = bb.ne as Record<string, unknown> | null
  if (!sw?.latitude || !sw?.longitude || !ne?.latitude || !ne?.longitude) return null
  return {
    swLat: sw.latitude as number,
    swLng: sw.longitude as number,
    neLat: ne.latitude as number,
    neLng: ne.longitude as number,
  }
}

function normalizeSolarRaw(solar: DbReport['solar_raw']): Record<string, unknown> | null {
  if (!solar) return null
  // Supabase occasionally returns JSONB as a double-encoded string — parse if needed
  if (typeof solar === 'string') {
    try {
      const parsed = JSON.parse(solar as string)
      console.log('[premium-report] solar_raw was string-encoded — parsed successfully')
      return parsed as Record<string, unknown>
    } catch {
      console.error('[premium-report] solar_raw is a string but failed JSON.parse')
      return null
    }
  }
  return solar as Record<string, unknown>
}

function parseSegments(solar: DbReport['solar_raw']): RoofSegment[] {
  const solarRecord = normalizeSolarRaw(solar)
  if (!solarRecord) return []
  const potential = solarRecord.solarPotential as Record<string, unknown> | null
  if (!potential) {
    console.warn('[premium-report] parseSegments: solarPotential missing, top-level keys:', Object.keys(solarRecord))
    return []
  }
  const raw = potential.roofSegmentStats as unknown[] | null
  if (!Array.isArray(raw) || raw.length === 0) {
    console.warn('[premium-report] parseSegments: roofSegmentStats missing/empty, solarPotential keys:', Object.keys(potential))
    return []
  }
  const filtered = raw.flatMap((seg): RoofSegment[] => {
    if (typeof seg !== 'object' || seg === null) return []
    const s = seg as Record<string, unknown>
    const center = s.center as Record<string, unknown> | null
    if (typeof center?.latitude !== 'number' || typeof center?.longitude !== 'number') return []

    // Google Solar API nests area inside stats sub-object
    const stats = s.stats as Record<string, unknown> | null
    const groundAreaMeters2 = (
      typeof s.groundAreaMeters2 === 'number' ? s.groundAreaMeters2 :        // flat (legacy/DSM)
      typeof stats?.groundAreaMeters2 === 'number' ? stats.groundAreaMeters2 : // nested (buildingInsights)
      0
    )
    const planeAreaMeters2 = (
      typeof s.planeAreaMeters2 === 'number' ? s.planeAreaMeters2 :
      typeof stats?.areaMeters2 === 'number' ? stats.areaMeters2 :
      undefined
    )
    if (groundAreaMeters2 <= 0) return []

    return [{
      pitchDegrees:    typeof s.pitchDegrees === 'number'    ? s.pitchDegrees    : undefined,
      azimuthDegrees:  typeof s.azimuthDegrees === 'number'  ? s.azimuthDegrees  : undefined,
      groundAreaMeters2,
      planeAreaMeters2,
      center: { latitude: center.latitude as number, longitude: center.longitude as number },
      segmentType:     typeof s.segmentType === 'number'     ? s.segmentType     : undefined,
    }]
  })
  console.log(`[premium-report] parseSegments: ${raw.length} raw → ${filtered.length} valid segments`)
  return filtered
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return apiError('Invalid JSON body', 400) }

  const { report_id, pro_id } = body
  if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
  if (!isValidUuid(pro_id))    return apiError('pro_id must be a valid UUID', 400)

  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  if (isProduction) return apiError('Premium plan required', 403)

  const supabase = getSupabaseAdmin()

  const { data: report, error: dbErr } = await supabase
    .from('roof_reports')
    .select('id, address, lat, lng, total_sqft, total_squares_order, dominant_pitch, facet_count, waste_factor, imagery_date, pitch_breakdown, linear_footage, solar_raw, premium_r2_key, pro_id')
    .eq('id', report_id)
    .eq('pro_id', pro_id)
    .single()

  if (dbErr || !report) {
    console.error('[premium-report] DB fetch error:', dbErr?.message)
    return apiError('Report not found', 404)
  }

  const db = report as unknown as DbReport

  const { data: proData, error: proErr } = await supabase
    .from('pros')
    .select('id, full_name, email, business_name, phone_cell, license_verified')
    .eq('id', pro_id)
    .single()

  if (proErr) console.warn('[premium-report] Pro fetch error:', proErr.message)
  console.log('[premium-report] Pro record:', JSON.stringify(proData))

  const pro = (proData as unknown as ProRecord | null) ?? {
    id: pro_id as string, full_name: null, email: '', business_name: null, phone_cell: null, license_verified: null,
  }

  const googleKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!googleKey) return apiError('Server configuration error', 500)

  // Always regenerate — clear any cached key so fresh PDF is built
  await supabase.from('roof_reports').update({ premium_r2_key: null }).eq('id', report_id)

  let solarRaw = db.solar_raw

  // If solar_raw is null (cleared or never fetched), re-fetch from Solar API
  if (!solarRaw) {
    console.log('[premium-report] solar_raw null — fetching fresh from Solar API')
    try {
      const solarUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${db.lat}&location.longitude=${db.lng}&requiredQuality=LOW&key=${googleKey}`
      const solarRes = await fetch(solarUrl, { signal: AbortSignal.timeout(20000) })
      if (solarRes.ok) {
        solarRaw = await solarRes.json() as typeof db.solar_raw
        // Persist back so future calls don't need to re-fetch
        await supabase.from('roof_reports').update({ solar_raw: solarRaw }).eq('id', report_id)
        console.log('[premium-report] solar_raw re-fetched and saved')
      } else {
        console.warn('[premium-report] Solar API re-fetch failed:', solarRes.status)
      }
    } catch (err) {
      console.warn('[premium-report] Solar API re-fetch error:', err instanceof Error ? err.message : err)
    }
  }

  const bbox = parseBbox(solarRaw)
  const segments = parseSegments(solarRaw)
  if (segments.length === 0) {
    // Log the actual solar_raw structure to diagnose parse failure
    const keys = Object.keys(solarRaw || {})
    const spKeys = Object.keys((solarRaw as Record<string,unknown>)?.solarPotential as Record<string,unknown> || {})
    console.warn('[premium-report] No segments for:', report_id, '| solar_raw keys:', keys, '| solarPotential keys:', spKeys)
    // DEBUG: return parse state so we can diagnose without Vercel logs
    const solarType = typeof solarRaw
    const solarNorm = normalizeSolarRaw(solarRaw)
    const spNorm = solarNorm?.solarPotential as Record<string,unknown> | null
    const rssRaw = spNorm?.roofSegmentStats
    return NextResponse.json({
      debug: true,
      solar_raw_type: solarType,
      solar_raw_is_string: solarType === 'string',
      solar_keys: keys,
      solarPotential_keys: spKeys,
      roofSegmentStats_type: Array.isArray(rssRaw) ? `array[${(rssRaw as unknown[]).length}]` : typeof rssRaw,
      first_segment_keys: Array.isArray(rssRaw) && rssRaw.length > 0 ? Object.keys(rssRaw[0] as object) : [],
      norm_solar_keys: solarNorm ? Object.keys(solarNorm) : [],
      norm_sp_keys: spNorm ? Object.keys(spNorm) : [],
    }, { status: 200 })
  } else {
    console.log('[premium-report] Segments found:', segments.length, 'for:', report_id)
  }

  const [topViewBase64, northViewBase64, southViewBase64, eastViewBase64, westViewBase64] =
    await Promise.all([
      fetchImageBase64(buildTopViewUrl(db.lat, db.lng, bbox, googleKey), 'top-view'),
      fetchStreetViewBase64(db.lat, db.lng, 0,   googleKey, 'north'),
      fetchStreetViewBase64(db.lat, db.lng, 180, googleKey, 'south'),
      fetchStreetViewBase64(db.lat, db.lng, 90,  googleKey, 'east'),
      fetchStreetViewBase64(db.lat, db.lng, 270, googleKey, 'west'),
    ])

  const lf = db.linear_footage
  const reportData: PremiumReportData = {
    address: db.address ?? '',
    lat: db.lat, lng: db.lng,
    imageryDate: db.imagery_date ?? null,
    generatedAt: new Date().toISOString(),
    totalSqft: Number(db.total_sqft) || 0,
    totalSquares: Number(db.total_squares_order) || 0,
    dominantPitch: db.dominant_pitch ?? '?/12',
    facetCount: Number(db.facet_count) || 0,
    wasteFactor: Number(db.waste_factor) || 12,
    pitchBreakdown: Array.isArray(db.pitch_breakdown)
      ? db.pitch_breakdown.map(r => ({ pitch: r.pitch ?? '?/12', sqft: Number(r.sqft) || 0, sq: Number(r.sq) || 0, pct: Number(r.pct) || 0 }))
      : [],
    linearFootage: {
      ridge_ft: Number(lf?.ridge_ft) || 0,
      hip_ft: Number(lf?.hip_ft) || 0,
      valley_ft: Number(lf?.valley_ft) || 0,
      rake_ft: Number(lf?.rake_ft) || 0,
      eave_ft: Number(lf?.eave_ft) || 0,
      total_linear_ft: Number(lf?.total_linear_ft) || 0,
      accuracy_note: lf?.accuracy_note ?? '±20% estimated from roof segment geometry',
      facet_count: Number(lf?.facet_count) || 0,
    },
    proName: pro.full_name ?? pro.business_name ?? (pro.email ? pro.email.split('@')[0] : null) ?? 'ProGuild Pro',
    proEmail: pro.email ?? '',
    proCompany: pro.business_name ?? null,
    proPhone: pro.phone_cell ?? null,
    proVerified: pro.license_verified ?? false,
    topViewBase64, northViewBase64, southViewBase64, eastViewBase64, westViewBase64,
    segments, bbox,
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await buildPremiumReport(reportData)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[premium-report] PDF render error:', msg)
    return apiError('PDF generation failed', 500, msg)
  }

  const r2Key = `premium-reports/${pro_id}/${report_id}/premium-report.pdf`
  try {
    const r2 = getR2Client()
    await r2.send(new PutObjectCommand({
      Bucket: getR2Bucket(), Key: r2Key, Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: (() => {
        const slug = (db.address ?? '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
        return `inline; filename="ProGuild_Premium_${slug}.pdf"`
      })(),
    }))
  } catch (err) {
    console.error('[premium-report] R2 upload error:', err)
    return apiError('Storage upload failed', 500, err)
  }

  await supabase.from('roof_reports').update({ premium_r2_key: r2Key }).eq('id', report_id)

  let url: string
  try {
    const r2 = getR2Client()
    url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: getR2Bucket(), Key: r2Key }), { expiresIn: R2_SIGNED_URL_EXPIRY })
  } catch (err) {
    return apiError('Failed to generate download URL', 500, err)
  }

  return NextResponse.json({
    success: true, url, r2Key, pages: 12, segments: segments.length,
    hasImages: {
      topView: topViewBase64.length > 0, north: northViewBase64.length > 0,
      south: southViewBase64.length > 0, east: eastViewBase64.length > 0, west: westViewBase64.length > 0,
    },
  })
}
