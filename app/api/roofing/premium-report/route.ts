/**
 * app/api/roofing/premium-report/route.ts
 * POST /api/roofing/premium-report
 *
 * Fetches all imagery (top-view satellite + 4 Street View cardinal images),
 * parses roofSegmentStats from solar_raw, then delegates to premiumReportPdf
 * to render the full 12-page EagleView+Roofr-parity PDF and uploads to R2.
 *
 * Rules (from HANDOVER_v87):
 *  - export const runtime = 'nodejs'  — PDF + image buffering requires Node
 *  - export const maxDuration = 60    — parallel image fetches + PDF render
 *  - NO Claude/Anthropic API
 *  - Staging gate: NEXT_PUBLIC_VERCEL_ENV !== 'production'
 */

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildPremiumReport, type PremiumReportData, type RoofSegment } from '@/lib/roofing/premiumReportPdf'
import { getR2Client, getR2Bucket } from '@/lib/api/utils'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteBody {
  reportId?: string
  report_id?: string  // frontend sends this
  pro_id?: string     // frontend also sends this (ignored — we use auth)
}

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
  pitch_breakdown: PitchBreakdownRow[] | null
  linear_footage: LinearFootage | null
  solar_raw: SolarRaw | null
  premium_r2_key: string | null
  pro_id: string
}

interface PitchBreakdownRow {
  pitch: string
  sqft: number
  sq: number
  pct: number
}

interface LinearFootage {
  ridge_ft?: number
  hip_ft?: number
  valley_ft?: number
  rake_ft?: number
  eave_ft?: number
  total_linear_ft?: number
  accuracy_note?: string
  facet_count?: number
}

interface SolarRaw {
  solarPotential?: {
    roofSegmentStats?: RoofSegment[]
    boundingBox?: {
      sw?: { latitude?: number; longitude?: number }
      ne?: { latitude?: number; longitude?: number }
    }
    imageryDate?: { year?: number; month?: number; day?: number }
  }
}

interface ProRecord {
  id: string
  name: string | null
  email: string | null
  company_name: string | null
  phone: string | null
  license_verified: boolean | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAPS_STATIC_BASE = 'https://maps.googleapis.com/maps/api/staticmap'
const STREET_VIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview'
const IMAGE_TIMEOUT_MS = 15_000
const R2_SIGNED_URL_EXPIRY = 60 * 60 * 24 * 7 // 7 days

// ─── Image fetching ───────────────────────────────────────────────────────────

async function fetchImageBase64(url: string, label = ''): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { 'Accept': 'image/*' },
    })
    if (!res.ok) {
      console.warn(`[premium-report] image fetch failed: ${label} — HTTP ${res.status}`)
      return ''
    }
    const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) {
      console.warn(`[premium-report] empty image body: ${label}`)
      return ''
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[premium-report] image fetch error: ${label} — ${msg}`)
    return ''
  }
}

function buildTopViewUrl(
  lat: number,
  lng: number,
  bbox: PremiumReportData['bbox'],
  apiKey: string,
): string {
  const size = '640x480'
  const zoom = 20
  const center = `${lat},${lng}`
  const base = `${MAPS_STATIC_BASE}?center=${center}&zoom=${zoom}&size=${size}&maptype=satellite&key=${apiKey}`

  // Overlay yellow bounding box if available
  if (bbox) {
    const sw = `${bbox.swLat},${bbox.swLng}`
    const ne = `${bbox.neLat},${bbox.neLng}`
    const nw = `${bbox.neLat},${bbox.swLng}`
    const se = `${bbox.swLat},${bbox.neLng}`
    const path = `&path=color:0xFFFF00FF|weight:2|${sw}|${nw}|${ne}|${se}|${sw}`
    return base + path
  }
  return base
}

function buildStreetViewUrl(
  lat: number,
  lng: number,
  heading: number,
  apiKey: string,
): string {
  return (
    `${STREET_VIEW_BASE}?location=${lat},${lng}` +
    `&heading=${heading}&pitch=10&fov=90&size=640x400&key=${apiKey}`
  )
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseBbox(
  solar: SolarRaw | null,
): PremiumReportData['bbox'] {
  const bb = solar?.solarPotential?.boundingBox
  if (!bb?.sw?.latitude || !bb?.sw?.longitude || !bb?.ne?.latitude || !bb?.ne?.longitude) {
    return null
  }
  return {
    swLat: bb.sw.latitude,
    swLng: bb.sw.longitude,
    neLat: bb.ne.latitude,
    neLng: bb.ne.longitude,
  }
}

function parseSegments(solar: SolarRaw | null): RoofSegment[] {
  const raw = solar?.solarPotential?.roofSegmentStats
  if (!Array.isArray(raw) || raw.length === 0) return []

  return raw.filter((seg): seg is RoofSegment => {
    return (
      typeof seg === 'object' &&
      seg !== null &&
      typeof seg.center?.latitude === 'number' &&
      typeof seg.center?.longitude === 'number' &&
      typeof seg.groundAreaMeters2 === 'number' &&
      seg.groundAreaMeters2 > 0
    )
  })
}

function parsePitchBreakdown(
  rows: PitchBreakdownRow[] | null,
): PremiumReportData['pitchBreakdown'] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  return rows.map((r) => ({
    pitch: r.pitch ?? '?/12',
    sqft: Number(r.sqft) || 0,
    sq: Number(r.sq) || 0,
    pct: Number(r.pct) || 0,
  }))
}

function parseLinearFootage(
  lf: LinearFootage | null,
): PremiumReportData['linearFootage'] {
  return {
    ridge_ft: Number(lf?.ridge_ft) || 0,
    hip_ft: Number(lf?.hip_ft) || 0,
    valley_ft: Number(lf?.valley_ft) || 0,
    rake_ft: Number(lf?.rake_ft) || 0,
    eave_ft: Number(lf?.eave_ft) || 0,
    total_linear_ft: Number(lf?.total_linear_ft) || 0,
    accuracy_note: lf?.accuracy_note ?? '±20% estimated from roof segment geometry',
    facet_count: Number(lf?.facet_count) || 0,
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not configured')
  return createClient(url, key)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 0. Parse + validate body ────────────────────────────────────────────────
  let body: RouteBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawReportId = body.reportId ?? body.report_id
  const reportId = typeof rawReportId === 'string' ? rawReportId.trim() : ''
  if (!reportId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
    return NextResponse.json({ error: 'reportId must be a valid UUID' }, { status: 400 })
  }

  // ── 1. Auth — verify caller is a logged-in pro ──────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Staging gate ─────────────────────────────────────────────────────────
  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  const canAccessPremium = !isProduction // TODO: replace with Stripe plan check
  if (!canAccessPremium) {
    return NextResponse.json({ error: 'Premium plan required' }, { status: 403 })
  }

  // ── 3. Fetch report from DB (service role bypasses RLS) ─────────────────────
  const supabase = getServiceClient()
  const { data: report, error: dbErr } = await supabase
    .from('roof_reports')
    .select([
      'id', 'address', 'lat', 'lng',
      'total_sqft', 'total_squares_order',
      'dominant_pitch', 'facet_count', 'waste_factor',
      'imagery_date', 'pitch_breakdown', 'linear_footage',
      'solar_raw', 'premium_r2_key', 'pro_id',
    ].join(', '))
    .eq('id', reportId)
    .eq('pro_id', user.id)  // ownership check
    .single()

  if (dbErr || !report) {
    console.error('[premium-report] DB fetch error:', dbErr?.message)
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const dbReport = report as unknown as DbReport

  // ── 4. Fetch pro info ───────────────────────────────────────────────────────
  const { data: proData } = await supabase
    .from('pros')
    .select('id, name, email, company_name, phone, license_verified')
    .eq('id', user.id)
    .single()

  const pro = (proData as unknown as ProRecord | null) ?? {
    id: user.id,
    name: user.email ?? 'ProGuild Pro',
    email: user.email ?? '',
    company_name: null,
    phone: null,
    license_verified: null,
  }

  // ── 5. Validate API key ──────────────────────────────────────────────────────
  const googleKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!googleKey) {
    console.error('[premium-report] GOOGLE_SOLAR_API_KEY not set')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // ── 6. Parse solar data ─────────────────────────────────────────────────────
  const solarRaw = dbReport.solar_raw as SolarRaw | null
  const bbox = parseBbox(solarRaw)
  const segments = parseSegments(solarRaw)

  if (segments.length === 0) {
    console.warn('[premium-report] No valid segments found in solar_raw for report:', reportId)
    // Continue — SVG pages will render with "data unavailable" placeholder
  }

  // ── 7. Parallel image fetch (5 images, non-blocking failures) ───────────────
  const lat = dbReport.lat
  const lng = dbReport.lng

  const topViewUrl = buildTopViewUrl(lat, lng, bbox, googleKey)
  const northUrl = buildStreetViewUrl(lat, lng, 0, googleKey)
  const southUrl = buildStreetViewUrl(lat, lng, 180, googleKey)
  const eastUrl  = buildStreetViewUrl(lat, lng, 90, googleKey)
  const westUrl  = buildStreetViewUrl(lat, lng, 270, googleKey)

  const [topViewBase64, northViewBase64, southViewBase64, eastViewBase64, westViewBase64] =
    await Promise.all([
      fetchImageBase64(topViewUrl, 'top-view'),
      fetchImageBase64(northUrl, 'north-street-view'),
      fetchImageBase64(southUrl, 'south-street-view'),
      fetchImageBase64(eastUrl, 'east-street-view'),
      fetchImageBase64(westUrl, 'west-street-view'),
    ])

  // ── 8. Assemble PremiumReportData ───────────────────────────────────────────
  const reportData: PremiumReportData = {
    // Property
    address: dbReport.address ?? '',
    lat,
    lng,
    imageryDate: dbReport.imagery_date ?? null,
    generatedAt: new Date().toISOString(),

    // Measurements
    totalSqft: Number(dbReport.total_sqft) || 0,
    totalSquares: Number(dbReport.total_squares_order) || 0,
    dominantPitch: dbReport.dominant_pitch ?? '?/12',
    facetCount: Number(dbReport.facet_count) || 0,
    wasteFactor: Number(dbReport.waste_factor) || 12,
    pitchBreakdown: parsePitchBreakdown(dbReport.pitch_breakdown),
    linearFootage: parseLinearFootage(dbReport.linear_footage),

    // Pro
    proName: pro.name ?? 'ProGuild Pro',
    proEmail: pro.email ?? '',
    proCompany: pro.company_name ?? null,
    proPhone: pro.phone ?? null,
    proVerified: pro.license_verified ?? false,

    // Images
    topViewBase64,
    northViewBase64,
    southViewBase64,
    eastViewBase64,
    westViewBase64,

    // SVG source data
    segments,
    bbox,
  }

  // ── 9. Render PDF ────────────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await buildPremiumReport(reportData)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[premium-report] PDF render error:', msg)
    return NextResponse.json({ error: 'PDF generation failed', detail: msg }, { status: 500 })
  }

  // ── 10. Upload to R2 ─────────────────────────────────────────────────────────
  const r2Key = `premium-reports/${user.id}/${reportId}/premium-report.pdf`
  try {
    const r2 = getR2Client()
    const bucket = getR2Bucket()
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ContentDisposition: `inline; filename="ProGuild-Premium-${reportId.slice(0, 8)}.pdf"`,
      })
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[premium-report] R2 upload error:', msg)
    return NextResponse.json({ error: 'Storage upload failed', detail: msg }, { status: 500 })
  }

  // ── 11. Persist R2 key to DB ─────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('roof_reports')
    .update({ premium_r2_key: r2Key })
    .eq('id', reportId)

  if (updateErr) {
    // Non-fatal — PDF is in R2, just log
    console.error('[premium-report] DB update error (non-fatal):', updateErr.message)
  }

  // ── 12. Generate 7-day signed URL ────────────────────────────────────────────
  let signedUrl: string
  try {
    const r2 = getR2Client()
    const bucket = getR2Bucket()
    signedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: bucket, Key: r2Key }),
      { expiresIn: R2_SIGNED_URL_EXPIRY },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[premium-report] Signed URL error:', msg)
    return NextResponse.json({ error: 'Failed to generate download URL', detail: msg }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    url: signedUrl,
    r2Key,
    pages: 12,
    segments: segments.length,
    hasImages: {
      topView: topViewBase64.length > 0,
      north: northViewBase64.length > 0,
      south: southViewBase64.length > 0,
      east: eastViewBase64.length > 0,
      west: westViewBase64.length > 0,
    },
  })
}
