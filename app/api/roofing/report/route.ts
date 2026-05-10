// app/api/roofing/report/route.ts
// POST /api/roofing/report
// Pipeline: Geocode → solar_cache → Solar API → 5 images → PDF → R2 → roof_reports row

export const runtime = 'nodejs'
export const maxDuration = 60  // PDF generation + 7 API calls can take up to 30s

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { renderToBuffer } from '@react-pdf/renderer'
import { buildRoofReportPDF, ReportData, PitchRow } from '@/lib/roofing/reportPdf'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

// ── R2 client (lazy — avoids module-load crash if env vars missing) ────────
function getR2Client() {
  if (!process.env.R2_ACCOUNT_ID) throw new Error('R2_ACCOUNT_ID not set in env')
  if (!process.env.R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID not set in env')
  if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY not set in env')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

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

/** m² → squares. Order qty rounds UP to nearest 0.5 (never under-order) */
function sqftFromM2(m2: number): number { return m2 * 10.764 }
function toSquaresRaw(m2: number): number { return sqftFromM2(m2) / 100 }
function toSquaresOrder(raw: number): number { return Math.ceil(raw * 2) / 2 }

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

/** geocode address → { lat, lng, formattedAddress } */
async function geocode(address: string): Promise<{ lat: number; lng: number; formattedAddress: string }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`
  const res = await fetch(url)
  const json = await res.json()
  if (json.status !== 'OK' || !json.results?.[0]) {
    throw new Error(`Geocoding failed: ${json.status} — ${address}`)
  }
  const loc = json.results[0].geometry.location
  return { lat: loc.lat, lng: loc.lng, formattedAddress: json.results[0].formatted_address }
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

/** fetch Street View image for a cardinal direction (base64)
 *  heading = direction the CAMERA FACES (opposite of the side being shown)
 *  North Side view = camera faces south (heading 180) looking at north face
 *  South Side view = camera faces north (heading 0)
 *  East Side view  = camera faces west (heading 270)
 *  West Side view  = camera faces east (heading 90)
 *  pitch=-10 tilts camera slightly down to show structure better.
 *  No source=outdoor — allows Google to use any nearby panorama. */
async function fetchStreetView(lat: number, lng: number, heading: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x400&location=${lat},${lng}&heading=${heading}&pitch=-10&fov=90&key=${GOOGLE_KEY}`
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
  // Solar API v1 buildingInsights response structure:
  // { solarPotential: { wholeRoofStats, roofSegmentStats }, imageryDate: { year, month, day } }
  const potential = (solar.solarPotential as Record<string, unknown>) || {}
  const whole = (potential.wholeRoofStats as Record<string, unknown>) || {}
  const segments = (potential.roofSegmentStats as Record<string, unknown>[]) || []

  // imageryDate is { year: number, month: number, day: number }
  const imgDateRaw = solar.imageryDate as Record<string, number> | string | null
  let imageryDate = 'Unknown'
  if (imgDateRaw && typeof imgDateRaw === 'object' && 'year' in imgDateRaw) {
    const { year, month, day } = imgDateRaw
    imageryDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  } else if (typeof imgDateRaw === 'string') {
    imageryDate = imgDateRaw
  }

  const totalM2 = (whole.areaMeters2 as number) || 0
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

  // Log parsed result for debugging
  console.log('[report] parsed: totalSqft=' + totalSqft + ', facets=' + facetCount + ', pitch=' + dominantPitch + ', imageryDate=' + imageryDate)

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
    console.log('[report] step 1: geocoding', address)
    const { lat, lng, formattedAddress } = await geocode(address)
    console.log('[report] geocoded:', lat, lng, '→', formattedAddress)

    // ── 2. solar_cache lookup ─────────────────────────────────────
    // Use formattedAddress for cache key (normalised by Google)
    const hash = addressHash(formattedAddress)
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
        console.log('[report] cache hit')
      }
    }

    // ── 3. Solar API (if cache miss) ──────────────────────────────
    if (!solarData) {
      console.log('[report] step 3: fetching Solar API')
      solarData = await fetchSolarData(lat, lng)
      console.log('[report] solar response keys:', Object.keys(solarData))
      // Log solarPotential keys for debugging
      const pot = solarData.solarPotential as Record<string, unknown> | null
      if (pot) {
        console.log('[report] solarPotential keys:', Object.keys(pot))
        const segs = pot.roofSegmentStats as unknown[]
        console.log('[report] roofSegmentStats count:', segs?.length ?? 0)
        const whole = pot.wholeRoofStats as Record<string, unknown> | null
        console.log('[report] wholeRoofStats:', JSON.stringify(whole))
      }
      console.log('[report] imageryDate raw:', JSON.stringify(solarData.imageryDate))
      await sb.from('solar_cache').upsert({
        address_hash: hash,
        lat,
        lng,
        solar_data_json: solarData,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'address_hash' })
    }

    // ── 4. Parse measurements ─────────────────────────────────────
    console.log('[report] step 4: parsing measurements')
    const measurements = parseSolar(solarData)
    console.log('[report] measurements:', measurements.totalSquaresRaw, 'sq,', measurements.facetCount, 'facets')

    // ── 5. Fetch 5 images in parallel ────────────────────────────
    console.log('[report] step 5: fetching 5 images')
    const [imgTopView, imgNorth, imgSouth, imgEast, imgWest] = await Promise.all([
      fetchTopView(lat, lng),
      fetchStreetView(lat, lng, 180),  // North Side: camera faces south → sees north face
      fetchStreetView(lat, lng, 0),    // South Side: camera faces north → sees south face
      fetchStreetView(lat, lng, 270),  // East Side:  camera faces west  → sees east face
      fetchStreetView(lat, lng, 90),   // West Side:  camera faces east  → sees west face
    ])
    console.log('[report] images fetched')

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
    console.log('[report] step 9: rendering PDF')
    const pdfBuffer = await renderToBuffer(buildRoofReportPDF(reportData, reportId))
    console.log('[report] PDF rendered, size:', pdfBuffer.length, 'bytes')

    // ── 10. Upload to R2 ──────────────────────────────────────────
    console.log('[report] step 10: uploading to R2')
    const r2 = getR2Client()
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
    console.log('[report] uploaded to R2:', r2Key)

    // Generate signed URL (7-day expiry)
    const signedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }),
      { expiresIn: 7 * 24 * 60 * 60 }
    )

    // ── 11. Save to roof_reports ──────────────────────────────────
    console.log('[report] step 11: saving to DB')
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
      console.error('[report] roof_reports insert error:', insertErr)
      // Non-fatal — PDF is already in R2
    }
    console.log('[report] done:', reportId)

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
