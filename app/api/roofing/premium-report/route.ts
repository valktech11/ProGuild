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
  id: string; name: string | null; email: string | null
  company_name: string | null; phone: string | null; license_verified: boolean | null
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
  const base = `${MAPS_STATIC_BASE}?center=${lat},${lng}&zoom=20&size=640x480&maptype=satellite&key=${apiKey}`
  if (bbox) {
    const sw = `${bbox.swLat},${bbox.swLng}`, ne = `${bbox.neLat},${bbox.neLng}`
    const nw = `${bbox.neLat},${bbox.swLng}`, se = `${bbox.swLat},${bbox.neLng}`
    return base + `&path=color:0xFFFF00FF|weight:2|${sw}|${nw}|${ne}|${se}|${sw}`
  }
  return base
}

// Use Street View Metadata API to find nearest valid pano_id, then fetch by pano_id.
// This avoids the "no imagery" grey image when coords land on a rooftop instead of the street.
async function fetchStreetViewBase64(lat: number, lng: number, heading: number, apiKey: string, label: string): Promise<string> {
  // Step 1: metadata lookup — finds nearest pano within 200m, returns pano_id
  const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=200&key=${apiKey}`
  try {
    const metaRes = await fetch(metaUrl, { signal: AbortSignal.timeout(8000) })
    if (metaRes.ok) {
      const meta = await metaRes.json() as { status: string; pano_id?: string }
      if (meta.status === 'OK' && meta.pano_id) {
        // Step 2: fetch image by pano_id so we get the real panorama regardless of exact coords
        const imgUrl = `${STREET_VIEW_BASE}?pano=${meta.pano_id}&heading=${heading}&pitch=10&fov=90&size=640x400&key=${apiKey}`
        return fetchImageBase64(imgUrl, label)
      }
    }
    console.warn(`[premium-report] Street View metadata ${label}: no pano found within 200m`)
    return ''
  } catch (err) {
    console.warn(`[premium-report] Street View metadata error ${label}:`, err instanceof Error ? err.message : err)
    return ''
  }
}

function parseBbox(solar: DbReport['solar_raw']): PremiumReportData['bbox'] {
  const bb = solar?.solarPotential?.boundingBox
  if (!bb?.sw?.latitude || !bb?.sw?.longitude || !bb?.ne?.latitude || !bb?.ne?.longitude) return null
  return { swLat: bb.sw.latitude, swLng: bb.sw.longitude, neLat: bb.ne.latitude, neLng: bb.ne.longitude }
}

function parseSegments(solar: DbReport['solar_raw']): RoofSegment[] {
  const raw = solar?.solarPotential?.roofSegmentStats
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw.filter((seg): seg is RoofSegment =>
    typeof seg === 'object' && seg !== null &&
    typeof (seg as RoofSegment).center?.latitude === 'number' &&
    typeof (seg as RoofSegment).center?.longitude === 'number' &&
    typeof (seg as RoofSegment).groundAreaMeters2 === 'number' &&
    (seg as RoofSegment).groundAreaMeters2 > 0
  )
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

  const { data: proData } = await supabase
    .from('pros')
    .select('id, name, email, company_name, phone, license_verified')
    .eq('id', pro_id)
    .single()

  const pro = (proData as unknown as ProRecord | null) ?? {
    id: pro_id as string, name: 'ProGuild Pro', email: '', company_name: null, phone: null, license_verified: null,
  }

  const googleKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!googleKey) return apiError('Server configuration error', 500)

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
  if (segments.length === 0) console.warn('[premium-report] No segments for:', report_id)

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
    proName: pro.name ?? 'ProGuild Pro',
    proEmail: pro.email ?? '',
    proCompany: pro.company_name ?? null,
    proPhone: pro.phone ?? null,
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
