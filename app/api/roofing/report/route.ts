// app/api/roofing/report/route.ts
// POST /api/roofing/report
// Pipeline: Geocode → solar_cache → Solar API → 5 images → PDF → R2 → roof_reports row

export const runtime = 'nodejs'
export const maxDuration = 60  // PDF generation + 7 API calls can take up to 30s

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { renderToBuffer } from '@react-pdf/renderer'
import { RoofReportPDF, ReportData, PitchRow } from '@/lib/roofing/reportPdf'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'
import React from 'react'

// ── R2 client ──────────────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'proguild-media-staging'

// ── Constants ─────────────────────────────────────────────────────────────
const GOOGLE_KEY    = process.env.GOOGLE_SOLAR_API_KEY!
const CACHE_TTL_MS  = 90 * 24 * 60 * 60 * 1000  // 90 days

// ── Helpers ───────────────────────────────────────────────────────────────

function addressHash(address: string): string {
  return crypto
    .createHash('sha256')
    .update(address.toLowerCase().trim().replace(/\s+/g, ' '))
    .digest('hex')
}

/** degrees → X/12 pitch string, rounded to nearest whole integer */
function degreesToPitch(deg: number): string {
  const rise = Math.round(Math.tan((deg * Math.PI) / 180) * 12)
  return `${Math.max(1, rise)}/12`
}

/** m² → squares (nearest 0.5) */
function sqftFromM2(m2: number): number { return m2 * 10.764 }
function toSquaresRaw(m2: number): number { return sqftFromM2(m2) / 100 }
function toSquaresOrder(raw: number): number { return Math.round(raw * 2) / 2 }

/** waste factor from facet count */
function wasteFactorFromFacets(facets: number): number {
  if (facets <= 4) return 10
  if (facets <= 8) return 12
  return 15
}

/** fetch image as base64 data URL */
async function fetchImageBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed: ${url} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

/** geocode address → { lat, lng } */
async function geocode(address: string): Promise<{ lat: number; lng: number }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`
  const res = await fetch(url)
  const json = await res.json()
  if (json.status !== 'OK' || !json.results?.[0]) {
    throw new Error(`Geocoding failed: ${json.status} — ${address}`)
  }
  const loc = json.results[0].geometry.location
  return { lat: loc.lat, lng: loc.lng }
}

/** fetch Solar buildingInsights */
async function fetchSolarData(lat: number, lng: number): Promise<Record<string, unknown>> {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=LOW&key=${GOOGLE_KEY}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Solar API error ${res.status}: ${err}`)
  }
  return res.json()
}

/** fetch Maps Static top-down image (base64) */
async function fetchTopView(lat: number, lng: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x400&maptype=satellite&key=${GOOGLE_KEY}`
  return fetchImageBase64(url)
}

/** fetch Street View image for a cardinal direction (base64) */
async function fetchStreetView(lat: number, lng: number, heading: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x400&location=${lat},${lng}&heading=${heading}&pitch=30&fov=90&key=${GOOGLE_KEY}`
  return fetchImageBase64(url)
}

/** parse Solar API response → structured measurements */
function parseSolar(solar: Record<string, unknown>): {
  totalSqft: number
  totalSquaresRaw: number
  totalSquaresOrder: number
  dominantPitch: string
  facetCount: number
  wasteFactor: number
  pitchBreakdown: PitchRow[]
  imageryDate: string
} {
  const whole = solar.wholeRoofStats as Record<string, unknown>
  const segments = (solar.roofSegmentStats as Record<string, unknown>[]) || []
  const imageryDate = (solar.imageryDate as string) || 'Unknown'

  const totalM2 = (whole?.areaMeters2 as number) || 0
  const totalSqft = Math.round(sqftFromM2(totalM2))
  const totalSquaresRaw = Math.round(toSquaresRaw(totalM2) * 100) / 100
  const totalSquaresOrder = toSquaresOrder(totalSquaresRaw)
  const facetCount = segments.length

  // Group segments by pitch string, sum area
  const pitchMap = new Map<string, number>()
  for (const seg of segments) {
    const stats = seg.stats as Record<string, unknown>
    const areaM2 = (stats?.areaMeters2 as number) || 0
    const pitchDeg = (seg.pitchDegrees as number) || 0
    const pitchStr = degreesToPitch(pitchDeg)
    pitchMap.set(pitchStr, (pitchMap.get(pitchStr) || 0) + areaM2)
  }

  // Build breakdown sorted by area desc
  const pitchBreakdown: PitchRow[] = Array.from(pitchMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([pitch, m2]) => {
      const sqft = Math.round(sqftFromM2(m2))
      const sq = Math.round(toSquaresRaw(m2) * 10) / 10
      const pct = totalSqft > 0 ? Math.round((sqft / totalSqft) * 100) : 0
      return { pitch, sqft, sq, pct }
    })

  const dominantPitch = pitchBreakdown[0]?.pitch || '?/12'
  const wasteFactor = wasteFactorFromFacets(facetCount)

  return { totalSqft, totalSquaresRaw, totalSquaresOrder, dominantPitch, facetCount, wasteFactor, pitchBreakdown, imageryDate }
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { address, pro_id, property_id } = body as {
      address: string
      pro_id: string
      property_id?: string
    }

    if (!address || !pro_id) {
      return NextResponse.json({ error: 'address and pro_id required' }, { status: 400 })
    }
    if (!GOOGLE_KEY) {
      return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 500 })
    }

    const sb = getSupabaseAdmin()

    // ── 1. Geocode ────────────────────────────────────────────────
    const { lat, lng } = await geocode(address)

    // ── 2. solar_cache lookup ─────────────────────────────────────
    const hash = addressHash(address)
    let solarData: Record<string, unknown> | null = null

    const { data: cached } = await sb
      .from('solar_cache')
      .select('solar_data_json, fetched_at')
      .eq('address_hash', hash)
      .single()

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime()
      if (age < CACHE_TTL_MS) {
        solarData = cached.solar_data_json as Record<string, unknown>
      }
    }

    // ── 3. Solar API (if cache miss) ──────────────────────────────
    if (!solarData) {
      solarData = await fetchSolarData(lat, lng)
      // Upsert cache
      await sb.from('solar_cache').upsert({
        address_hash: hash,
        lat,
        lng,
        solar_data_json: solarData,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'address_hash' })
    }

    // ── 4. Parse measurements ─────────────────────────────────────
    const measurements = parseSolar(solarData)

    // ── 5. Fetch 5 images in parallel ────────────────────────────
    const [imgTopView, imgNorth, imgSouth, imgEast, imgWest] = await Promise.all([
      fetchTopView(lat, lng),
      fetchStreetView(lat, lng, 0),    // North
      fetchStreetView(lat, lng, 180),  // South
      fetchStreetView(lat, lng, 90),   // East
      fetchStreetView(lat, lng, 270),  // West
    ])

    // ── 6. Fetch pro details for report header ────────────────────
    const { data: pro } = await sb
      .from('pros')
      .select('name, business_name')
      .eq('id', pro_id)
      .single()

    // ── 7. Build report ID + date strings ────────────────────────
    const reportId = `PG-${Date.now().toString(36).toUpperCase()}`
    const now = new Date()
    const generatedDate = now.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })

    // Parse address for display
    const addrParts = address.split(',').map(s => s.trim())
    const streetAddr = addrParts[0] || address
    const city = addrParts[1] || ''
    const stateZip = (addrParts[2] || '').trim().split(' ')
    const state = stateZip[0] || ''
    const zip = stateZip[1] || ''

    // ── 8. Assemble PDF data ──────────────────────────────────────
    const reportData: ReportData = {
      address: streetAddr,
      city,
      state,
      zip,
      generatedDate,
      proName: pro?.name || 'ProGuild Pro',
      proCompany: pro?.business_name || '',
      ...measurements,
      imgTopView,
      imgNorth,
      imgSouth,
      imgEast,
      imgWest,
    }

    // ── 9. Render PDF ─────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      React.createElement(RoofReportPDF, { data: reportData, reportId }) as any
    )

    // ── 10. Upload to R2 ──────────────────────────────────────────
    const r2Key = `reports/${pro_id}/${property_id || 'no-property'}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${reportId}.pdf`

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        pro_id,
        property_id: property_id || '',
        address,
        report_id: reportId,
      },
    }))

    // Generate signed URL (7-day expiry)
    const signedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }),
      { expiresIn: 7 * 24 * 60 * 60 }
    )

    // ── 11. Save to roof_reports ──────────────────────────────────
    const { data: reportRow, error: insertErr } = await sb
      .from('roof_reports')
      .insert({
        pro_id,
        property_id: property_id || null,
        address,
        lat,
        lng,
        r2_key: r2Key,
        r2_url: signedUrl,
        total_sqft: measurements.totalSqft,
        total_squares_raw: measurements.totalSquaresRaw,
        total_squares_order: measurements.totalSquaresOrder,
        dominant_pitch: measurements.dominantPitch,
        facet_count: measurements.facetCount,
        waste_factor: measurements.wasteFactor,
        imagery_date: measurements.imageryDate,
        pitch_breakdown: measurements.pitchBreakdown,
        solar_raw: solarData,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('roof_reports insert error:', insertErr)
      // Non-fatal — PDF is already in R2
    }

    // ── 12. Return ────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      reportId,
      reportRowId: reportRow?.id || null,
      url: signedUrl,
      measurements: {
        totalSqft: measurements.totalSqft,
        totalSquaresRaw: measurements.totalSquaresRaw,
        totalSquaresOrder: measurements.totalSquaresOrder,
        dominantPitch: measurements.dominantPitch,
        facetCount: measurements.facetCount,
        wasteFactor: measurements.wasteFactor,
        imageryDate: measurements.imageryDate,
        pitchBreakdown: measurements.pitchBreakdown,
      },
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/roofing/report]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
