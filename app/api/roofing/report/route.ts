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
  // Cap at 12/12 (45°) — anything steeper is a chimney face or vertical wall, not a roofable plane
  return `${Math.min(12, Math.max(1, rise))}/12`
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

/** fetch image as base64 data URL — detects actual content type from response */
async function fetchImageBase64(url: string, label = ''): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed: ${label} → ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  // Normalize: Maps Static returns image/png by default, jpeg when &format=jpg is set
  const mimeType = contentType.split(';')[0].trim()
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`[report] image ${label}: ${mimeType}, ${buf.length} bytes`)
  return `data:${mimeType};base64,${buf.toString('base64')}`
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

// ── NOAA SWDI Hail Check ──────────────────────────────────────────────────
// Uses NOAA Severe Weather Data Inventory (SWDI) nx3hail dataset.
// Free, no API key. Queries by radius around property lat/lng.
// Searches month-by-month newest-first, stops on first qualifying hit.
// Insurance threshold: max_size > 1.0 inch (quarter-size hail).
// Latency: ~120 days, so we query from 24 months ago to 120 days ago.
export interface NoaaStormEvent {
  event_type: string
  event_date: string   // e.g. '2024-04-12'
  magnitude: string    // hail size in inches e.g. '1.75'
  magnitude_type: string
  county: string
  state: string
  distance_miles?: number
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10
}

// Quote-aware CSV line parser. The IEM LSR CSV REMARK column is free text that
// frequently contains commas and quotes (e.g. "Half Dollar (1.25 in.), roof damage").
// A naive line.split(',') shifts every column after REMARK, corrupting LAT/LON/etc.
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } // escaped double-quote
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

// Physical bounds for sanity-checking LSR magnitudes. The largest hailstone ever
// recorded in the US was ~8 inches; anything above that on a HAIL report is a
// data/units/parse error, NOT real hail, and must never reach a customer report.
const HAIL_MIN_IN = 0.75   // insurance-relevant threshold (quarter size)
const HAIL_MAX_IN = 8.0    // physical ceiling — rejects impossible values like "61"
const WIND_MIN_KT = 58     // severe wind threshold
const WIND_MAX_KT = 250    // physical ceiling

async function checkNoaaStorms(lat: number, lng: number): Promise<NoaaStormEvent[]> {
  // Iowa Environmental Mesonet (IEM) Local Storm Reports — free, no key, ground-truth NWS reports.
  // Replaces the deprecated NOAA SWDI/NCDC service. Queries by NWS WFO over the last ~24 months,
  // then keeps qualifying hail (>=1") / damaging wind within ~15 miles of the property.
  // FAIL-SAFE: any error returns [] (no storm flag) and never breaks the report.
  // NOTE: needs a one-time staging smoke-test — the build sandbox cannot reach IEM to verify the response.

  // FL-first WFO mapping by lat/lng (approximate; national mapping is a later refinement).
  const wfosFor = (la: number, ln: number): string[] => {
    if (ln < -84.0) return ['TAE']                       // panhandle
    if (la >= 29.4) return ['JAX', 'TAE']                // NE / N Florida
    if (la < 25.6) return ['KEY', 'MFL']                 // Keys
    if (la >= 27.8 && ln >= -81.6) return ['MLB', 'JAX'] // E-central
    if (la >= 27.0 && ln < -81.8) return ['TBW', 'TAE']  // W-central
    return ['MFL', 'TBW']                                // S Florida
  }

  const now = new Date()
  const start = new Date(now.getTime() - 24 * 30 * 24 * 60 * 60 * 1000) // ~24 months
  const isoZ = (d: Date) => d.toISOString().slice(0, 19) + 'Z'

  const fetchWfo = async (wfo: string): Promise<NoaaStormEvent[]> => {
    const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py`
      + `?wfo=${wfo}&sts=${isoZ(start)}&ets=${isoZ(now)}&fmt=csv`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ProGuild/1.0' }, signal: AbortSignal.timeout(10000) })
      if (!res.ok) { console.log('[storm] IEM', wfo, 'status', res.status); return [] }
      const text = await res.text()
      const lines = text.trim().split('\n')
      // Real IEM lsr.py CSV format (verified against IEM docs):
      // VALID,MAG,WFO,TYPECODE,TYPETEXT,CITY,COUNTY,STATE,SOURCE,REMARK,LAT,LON,UGC,UGCNAME,QUALIFY
      // Column lookup is by header name (robust to order changes); rows are parsed
      // with a quote-aware parser because REMARK contains commas.
      const header = (lines[0] ? parseCsvLine(lines[0]) : []).map(h => h.trim().toLowerCase())
      console.log('[storm] IEM', wfo, 'csv rows:', lines.length - 1, 'header:', header.join(','))
      const out: NoaaStormEvent[] = []
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue
        const cols = parseCsvLine(line)
        const get = (field: string) => cols[header.indexOf(field)]?.trim() ?? ''
        const typetext = get('typetext').toUpperCase()
        // MAG can be "None" or a number
        const magRaw = get('mag')
        const mag = magRaw === 'None' || magRaw === '' ? 0 : (parseFloat(magRaw) || 0)

        // Physical sanity bounds. A HAIL report with mag > 8 inches is impossible
        // (world record ~8") — it indicates a units/parse/column error, not real hail.
        // Log the raw row so we can see exactly what IEM sent and fix the source if needed.
        if (typetext.includes('HAIL') && mag > HAIL_MAX_IN) {
          console.log('[storm] REJECTED implausible hail mag:', mag, '| raw magcol:', JSON.stringify(magRaw), '| raw row:', line.slice(0, 220))
          continue
        }

        const isHail = typetext.includes('HAIL') && mag >= HAIL_MIN_IN && mag <= HAIL_MAX_IN
        const isWind = (typetext.includes('TSTM WND') || typetext.includes('NON-TSTM WND')) && mag >= WIND_MIN_KT && mag <= WIND_MAX_KT
        if (!isHail && !isWind) continue
        // LAT/LON columns (CSV header: LAT,LON)
        const evLat = parseFloat(get('lat') || '0')
        const evLng = parseFloat(get('lon') || '0')
        if (!evLat || !evLng) continue
        const dist = haversineMiles(lat, lng, evLat, evLng)
        if (dist > 15) continue
        // VALID format: 202406192100 → 2024-06-19
        const validRaw = get('valid')
        const eventDate = validRaw.length >= 8
          ? `${validRaw.slice(0, 4)}-${validRaw.slice(4, 6)}-${validRaw.slice(6, 8)}`
          : ''
        console.log('[storm] qualifying:', typetext, mag, eventDate, dist + 'mi')
        out.push({
          event_type: isHail ? 'Hail' : 'Wind',
          event_date: eventDate,
          magnitude: isHail ? mag.toFixed(2).replace(/\.?0+$/, '') : String(Math.round(mag)),
          magnitude_type: isHail ? 'inches' : 'mph/kt',
          county: get('county'),
          state: get('state'),
          distance_miles: dist,
        })
      }
      return out
    } catch (e) {
      console.log('[storm] IEM error:', String(e).slice(0, 120))
      return []
    }
  }

  try {
    const results = await Promise.all(wfosFor(lat, lng).map(fetchWfo))
    const all = results.flat()
    if (!all.length) { console.log('[storm] no qualifying events'); return [] }
    all.sort((a, b) => b.event_date.localeCompare(a.event_date))
    console.log('[storm] most recent:', all[0].event_type, all[0].event_date, all[0].magnitude, all[0].distance_miles + 'mi')
    return [all[0]]
  } catch (e) {
    console.log('[storm] outer error:', String(e).slice(0, 120))
    return []
  }
}

// ── Nearest Roofing Supplier ──────────────────────────────────────────────
export interface NearestSupplier {
  name: string
  vicinity: string
  distance_miles: number
}

async function findNearestSupplier(lat: number, lng: number): Promise<NearestSupplier | null> {
  if (!GOOGLE_KEY) return null

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&keyword=roofing+supply+ABC+Supply+Beacon+SRS&key=${GOOGLE_KEY}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const json = await res.json() as { results?: Array<{ name: string; vicinity: string; geometry: { location: { lat: number; lng: number } } }> }
    const first = json.results?.[0]
    if (!first) return null
    const distance_miles = haversineMiles(lat, lng, first.geometry.location.lat, first.geometry.location.lng)
    return { name: first.name, vicinity: first.vicinity, distance_miles }
  } catch {
    return null
  }
}

/** fetch Maps Static top-down image centred on exact building location.
 *  Draws yellow bounding box outline to identify the property. */
async function fetchTopView(
  lat: number,
  lng: number,
  boundingBox: { swLat: number; swLng: number; neLat: number; neLng: number } | null
): Promise<string> {
  let url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=21&size=640x400&maptype=satellite&format=jpg`
  // Draw yellow property outline using bounding box corners
  if (boundingBox) {
    const { swLat, swLng, neLat, neLng } = boundingBox
    // Close the polygon by repeating the first point
    const path = `path=color:0xFFFF00|weight:3|${swLat},${swLng}|${neLat},${swLng}|${neLat},${neLng}|${swLat},${neLng}|${swLat},${swLng}`
    url += `&${path}`
  }
  url += `&key=${GOOGLE_KEY}`
  return fetchImageBase64(url, 'topView')
}

/** fetch satellite image at a specific zoom level centered on building — force JPEG */
async function fetchZoomView(lat: number, lng: number, zoom: number, label: string): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=640x400&maptype=satellite&format=jpg&key=${GOOGLE_KEY}`
  return fetchImageBase64(url, label)
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
  imageryQuality: string
  buildingLat: number
  buildingLng: number
  boundingBox: { swLat: number; swLng: number; neLat: number; neLng: number } | null
  hasLowSlope: boolean
  hasLowConfidence: boolean
} {
  // Solar API v1 buildingInsights response structure:
  // { center: {latitude, longitude}, boundingBox: {sw,ne}, solarPotential: {...}, imageryDate: {...} }
  const potential = (solar.solarPotential as Record<string, unknown>) || {}
  const whole = (potential.wholeRoofStats as Record<string, unknown>) || {}
  const segments = (potential.roofSegmentStats as Record<string, unknown>[]) || []

  // Building exact centroid — use this for all Maps Static calls
  const centerRaw = solar.center as Record<string, number> | null
  const buildingLat = centerRaw?.latitude || 0
  const buildingLng = centerRaw?.longitude || 0
  console.log('[report] building center from Solar API:', buildingLat, buildingLng)

  // Bounding box — used to draw yellow outline on top view
  const bbRaw = solar.boundingBox as Record<string, Record<string, number>> | null
  let boundingBox = null
  if (bbRaw?.sw && bbRaw?.ne) {
    boundingBox = {
      swLat: bbRaw.sw.latitude,
      swLng: bbRaw.sw.longitude,
      neLat: bbRaw.ne.latitude,
      neLng: bbRaw.ne.longitude,
    }
    console.log('[report] boundingBox:', JSON.stringify(boundingBox))
  }

  // imageryDate is { year: number, month: number, day: number }
  const imgDateRaw = solar.imageryDate as Record<string, number> | string | null
  let imageryDate = 'Unknown'
  if (imgDateRaw && typeof imgDateRaw === 'object' && 'year' in imgDateRaw) {
    const { year, month, day } = imgDateRaw
    imageryDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  } else if (typeof imgDateRaw === 'string') {
    imageryDate = imgDateRaw
  }

  const imageryQuality = (solar.imageryQuality as string) || 'UNKNOWN'

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

  // ── Pitch smoothing (multi-pass) ─────────────────────────────────────────
  // Pass 1: Merge minority rows (< 12% area) within ±2 rise steps of dominant into dominant
  // Handles chimney shadows, dormer noise, sensor error from tree canopy
  // Pass 2: Re-run after recalculating pct to catch newly dominant merges
  function smoothPitches(rows: typeof pitchBreakdown): typeof pitchBreakdown {
    const dom = rows[0]?.pitch || '?/12'
    const domRise = parseInt(dom.split('/')[0])
    const result: typeof pitchBreakdown = []
    for (const row of rows) {
      const rise = parseInt(row.pitch.split('/')[0])
      if (row.pct < 12 && Math.abs(rise - domRise) <= 2) {
        const existing = result.find(r => r.pitch === dom)
        if (existing) {
          existing.sqft += row.sqft
          existing.sq = Math.round((existing.sq + row.sq) * 10) / 10
          existing.pct = Math.min(100, existing.pct + row.pct)
        } else {
          result.push({ ...row, pitch: dom })
        }
      } else {
        result.push({ ...row })
      }
    }
    // Recalculate pct
    const tot = result.reduce((s, r) => s + r.sqft, 0)
    result.forEach(r => { r.pct = tot > 0 ? Math.round((r.sqft / tot) * 100) : 0 })
    return result.sort((a, b) => b.sqft - a.sqft)
  }

  // Two passes for cascading merges (e.g. 10/12 merges after 8/12 boosted dominant pct)
  const pass1 = smoothPitches(pitchBreakdown)
  const smoothedBreakdown = smoothPitches(pass1)

  // Low slope flag — any pitch < 3/12 remains after smoothing
  const hasLowSlope = smoothedBreakdown.some(r => parseInt(r.pitch.split('/')[0]) < 3)

  // Confidence warning — dominant pitch implausibly low for facet count
  // If dominant <= 3/12 but facets >= 6, likely tree canopy interference
  const dominantRise = parseInt(dominantPitch.split('/')[0])
  const hasLowConfidence = dominantRise <= 3 && facetCount >= 6

  console.log('[report] parsed: totalSqft=' + totalSqft + ', facets=' + facetCount + ', pitch=' + dominantPitch + ', imageryDate=' + imageryDate + ', hasLowSlope=' + hasLowSlope + ', hasLowConfidence=' + hasLowConfidence + ', smoothed pitches=' + smoothedBreakdown.length)

  return { totalSqft, totalSquaresRaw, totalSquaresOrder, dominantPitch, facetCount, wasteFactor, pitchBreakdown: smoothedBreakdown, imageryDate, imageryQuality, buildingLat, buildingLng, boundingBox, hasLowSlope, hasLowConfidence }
}

// ── Main handler ──────────────────────────────────────────────────────────
// ── Gemini Roof Polygon Extraction ──────────────────────────────────────────
// Fetches a satellite JPEG and calls Gemini Vision to extract roof facet polygons.
// Used for improved diagram rendering in the Premium PDF.
// Returns null on failure — diagram falls back to approximated rectangles.
async function fetchGeminiRoofPolygons(lat: number, lng: number): Promise<import('@/lib/roofing/geminiRoofPolygons').GeminiRoofPolygons | null> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
  if (!GEMINI_KEY || !GOOGLE_KEY) return null
  try {
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&format=jpg&key=${GOOGLE_KEY}`
    const imgRes = await fetch(mapUrl, { signal: AbortSignal.timeout(15000) })
    if (!imgRes.ok) return null
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')
    const { getGeminiRoofPolygons } = await import('@/lib/roofing/geminiRoofPolygons')
    return await getGeminiRoofPolygons(base64, GEMINI_KEY)
  } catch (e) {
    console.warn('[gemini-poly] fetchGeminiRoofPolygons error:', String(e).slice(0, 100))
    return null
  }
}

// ── Gemini Vision Condition Assessment ───────────────────────────────────
// Fetches the Solar API rgbUrl GeoTIFF, sends as base64 to Gemini 1.5 Flash.
// Returns a 2-3 sentence condition paragraph. Cost: ~$0.0001/report.
async function getGeminiCondition(lat: number, lng: number): Promise<string | null> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
  if (!GEMINI_KEY) { console.log('[gemini] no API key'); return null }
  if (!GOOGLE_KEY)  { console.log('[gemini] no Google key for dataLayers'); return null }

  try {
    // Use Maps Static API JPEG — Gemini does not support image/tiff (GeoTIFF)
    // z20 satellite top-down at building centroid, 640x640
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&format=jpg&key=${GOOGLE_KEY}`
    console.log('[gemini] fetching satellite JPEG from Maps Static')
    const imgRes = await fetch(mapUrl, { signal: AbortSignal.timeout(15000) })
    if (!imgRes.ok) { console.log('[gemini] satellite image fetch error:', imgRes.status); return null }
    const imgBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(imgBuffer).toString('base64')
    const mimeType = 'image/jpeg'
    console.log('[gemini] satellite JPEG fetched:', imgBuffer.byteLength, 'bytes')

    // Step 2: send to Gemini Vision for roof condition assessment
    const prompt = `You are a roofing expert reviewing a satellite image of a residential roof. 
First, identify the primary roofing material based on visible color, texture, and sheen — classify it as one of: Asphalt Shingle, Architectural Shingle, Clay Tile, Concrete Tile, Metal, Slate, TPO, EPDM, or Modified Bitumen.
Then provide a concise 2-3 sentence professional assessment of the roof condition.
Focus on: visible wear patterns, potential damage areas, moss/algae growth, missing or damaged shingles, 
flashing condition, and overall material condition. 
Be specific about what you observe. Do not mention the image format or satellite technology.
Write in the third person as if writing a field note for a roofing contractor.
Format: Begin with the material type (e.g. 'Architectural shingles —'), then the condition assessment.`

    // Gemini Vision — model fallback chain on quota/deprecation errors
    // API version: v1beta — required for thinkingConfig support on gemini-2.5-flash
    const GEMINI_MODELS = ['gemini-2.5-flash']
    const geminiBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 }
    })
    let text: string | null = null
    for (const model of GEMINI_MODELS) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody, signal: AbortSignal.timeout(20000) }
      )
      console.log(`[gemini] model=${model} status=${geminiRes.status}`)
      if (geminiRes.status === 429 || geminiRes.status === 404 || geminiRes.status === 400) {
        const errPreview = (await geminiRes.text()).slice(0, 150)
        console.log(`[gemini] ${model} error, trying next:`, errPreview)
        continue
      }
      if (!geminiRes.ok) { console.log(`[gemini] ${model} failed ${geminiRes.status}`); break }
      const geminiJson = await geminiRes.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
      console.log(`[gemini] success model=${model}:`, text?.slice(0, 100))
      break
    }
    return text
  } catch (e) {
    console.log('[gemini] error:', String(e).slice(0, 150))
    return null
  }
}

// ── Historic District Check — NPS NRHP via ArcGIS REST ───────────────────
// Queries the NPS National Register of Historic Places ArcGIS feature service.
// Point-in-polygon: returns districts whose boundary contains the lat/lng.
// Free, no API key. Authoritative source — same data as the NPS NRHP website.
async function checkHistoricDistrict(lat: number, lng: number, formattedAddress: string): Promise<string | null> {
  try {
    // NPS NRHP official MapServer — layer 1 = polygons (districts + large properties)
    // Hosted on mapservices.nps.gov — authoritative NPS source, free, no auth
    // Point-in-polygon: returns features whose boundary contains the coordinate
    const nrhpUrl = [
      'https://mapservices.nps.gov/arcgis/rest/services',
      '/cultural_resources/nrhp_locations/MapServer/1/query',
      `?geometry=${lng},${lat}`,
      '&geometryType=esriGeometryPoint',
      '&inSR=4326',
      '&spatialRel=esriSpatialRelIntersects',
      '&outFields=RESNAME,CITY,STATE,RESTYPE',
      '&returnGeometry=false',
      '&f=json',
    ].join('')

    console.log('[historic] querying NPS NRHP ArcGIS:', nrhpUrl)
    const res = await fetch(nrhpUrl, {
      headers: { 'User-Agent': 'ProGuild/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    console.log('[historic] ArcGIS status:', res.status)
    if (!res.ok) { console.log('[historic] ArcGIS error:', res.status); return null }

    const json = await res.json() as {
      features?: Array<{ attributes: { RESNAME?: string; CITY?: string; STATE?: string; RESTYPE?: string } }>
      error?: { message?: string }
    }

    if (json.error) { console.log('[historic] ArcGIS API error:', json.error.message); return null }

    console.log('[historic] NRHP features found:', json.features?.length ?? 0)
    if (!json.features?.length) return null

    // Return the first (most specific) matching district name
    const district = json.features[0].attributes
    const name = district.RESNAME || 'Historic District'
    console.log('[historic] matched district:', name, '|', district.CITY, district.STATE, '| type:', district.RESTYPE)
    return name

  } catch (e) {
    console.log('[historic] error:', String(e).slice(0, 150))
    return null
  }
}

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
        console.log('[report] cache hit — using cached Solar data')
      }
    }

    // ── 3. Solar API (if cache miss) ──────────────────────────────
    if (!solarData) {
      console.log('[report] step 3: fetching Solar API')
      solarData = await fetchSolarData(lat, lng)
      console.log('[report] solar response keys:', Object.keys(solarData))
      await sb.from('solar_cache').upsert({
        address_hash: hash,
        lat,
        lng,
        solar_data_json: solarData,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'address_hash' })
    }

    // Always log Solar center regardless of cache hit/miss
    const solarCenter = solarData.center as Record<string, number> | null
    const solarBB = solarData.boundingBox as Record<string, Record<string, number>> | null
    console.log('[report] geocoded lat/lng:', lat, lng)
    console.log('[report] Solar center:', JSON.stringify(solarCenter))
    console.log('[report] Solar boundingBox:', JSON.stringify(solarBB))

    // ── 4. Parse measurements ─────────────────────────────────────
    console.log('[report] step 4: parsing measurements')
    const measurements = parseSolar(solarData)
    console.log('[report] measurements:', measurements.totalSquaresRaw, 'sq,', measurements.facetCount, 'facets')

    // Use Solar API building centroid for images — more accurate than geocoded position
    const imgLat = measurements.buildingLat || lat
    const imgLng = measurements.buildingLng || lng
    console.log('[report] using image coords:', imgLat, imgLng, measurements.buildingLat ? '(Solar center)' : '(geocoded fallback)')

    // ── 5. Fetch images + NOAA + supplier + Gemini + Historic District ──────
    console.log('[report] step 5: fetching images + NOAA + supplier + Gemini + historic')
    const [imgTopView, imgZoom19, imgZoom20, imgZoom21, stormEvents, nearestSupplier, geminiCondition, historicDistrict, geminiRoofPolygons] = await Promise.all([
      fetchTopView(imgLat, imgLng, measurements.boundingBox),
      fetchZoomView(imgLat, imgLng, 18, 'zoom18'),
      fetchZoomView(imgLat, imgLng, 20, 'zoom20'),
      fetchZoomView(imgLat, imgLng, 22, 'zoom22'),
      checkNoaaStorms(imgLat, imgLng),
      findNearestSupplier(imgLat, imgLng),
      getGeminiCondition(imgLat, imgLng),
      checkHistoricDistrict(imgLat, imgLng, formattedAddress),
      fetchGeminiRoofPolygons(imgLat, imgLng),
    ])
    console.log('[report] step 5 done — NOAA:', stormEvents.length, 'supplier:', nearestSupplier?.name || 'none', 'gemini:', geminiCondition ? 'ok' : 'null', 'historic:', historicDistrict || 'none', 'polygons:', geminiRoofPolygons ? geminiRoofPolygons.facets.length + ' facets' : 'null')

    // ── 6. Fetch pro details for report header ────────────────────
    const { data: pro } = await sb
      .from('pros')
      .select('full_name, business_name, phone_cell, email')
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
      proName: pro?.full_name || 'ProGuild Pro',
      proCompany: pro?.business_name || '',
      proPhone: pro?.phone_cell || '',
      proEmail: pro?.email || '',
      ...measurements,
      imgTopView,
      imgZoom19,
      imgZoom20,
      imgZoom21,
      stormEvents,
      nearestSupplier,
      geminiCondition,
      historicDistrict,
      geminiRoofPolygons,
      linearFootage: null,   // computed async by /api/roofing/dsm after report saved
    }

    // ── 9. Render PDF ─────────────────────────────────────────────
    console.log('[report] step 9: rendering PDF')
    const pdfBuffer = await renderToBuffer(buildRoofReportPDF(reportData, reportId))
    console.log('[report] PDF rendered:', pdfBuffer.length, 'bytes —', pdfBuffer.length > 100000 ? 'images embedded OK' : 'WARNING: small PDF, images may be missing')

    // ── 10. Upload to R2 ──────────────────────────────────────────
    console.log('[report] step 10: uploading to R2')
    const r2 = getR2Client()
    // Sanitise address for use as filename: "3919 Highgate Ct, Jacksonville" → "3919_Highgate_Ct"
    const addrSlug = address
      .split(',')[0]                          // take street portion only
      .trim()
      .replace(/[^a-zA-Z0-9 ]/g, '')         // strip special chars
      .replace(/\s+/g, '_')                   // spaces to underscores
      .slice(0, 60)                           // max 60 chars
    const pdfFilename = `${addrSlug}_ProGuild_${reportId}.pdf`
    const r2Key = `reports/${pro_id}/${property_id || 'no-property'}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${reportId}.pdf`

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${pdfFilename}"`,
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
        condition_assessment: geminiCondition || null,
        condition_assessed_at: geminiCondition ? new Date().toISOString() : null,
        nearest_supplier: nearestSupplier || null,
        storm_event: stormEvents[0] || null,
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
      // Include coords so we can verify correct building without needing Vercel logs
      debug: {
        geocodedLat: lat,
        geocodedLng: lng,
        buildingLat: measurements.buildingLat,
        buildingLng: measurements.buildingLng,
        boundingBox: measurements.boundingBox,
        formattedAddress,
        stormEvents,
        nearestSupplier,
        geminiCondition,
        historicDistrict,
        roofSegmentStats: (solarData?.solarPotential as Record<string,unknown>)?.roofSegmentStats || [],
      },
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
