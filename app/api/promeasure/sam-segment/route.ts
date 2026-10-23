import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

// POST /api/promeasure/sam-segment
//
// Tap-to-detect roof footprint on a satellite tile using SAM2 point-prompting.
//
// Flow:
//   1. Receive { center:{lat,lng}, zoom, width, height, tapX, tapY }
//      tapX/tapY are normalised [0..1] within the capture tile.
//   2. Fetch the Google Maps Static satellite tile (same URL pattern as suggest-lines).
//   3. Run SAM2 on Replicate with the tap point as a foreground prompt.
//   4. Download the returned mask PNG, trace its outer contour, simplify to ≤60 vertices.
//   5. Unproject each contour vertex from tile-pixel → lat/lng using Web Mercator math
//      (same transform as suggest-lines so coordinates are consistent with the map view).
//   6. Return { polygon: [{lat,lng}], maskB64, tileW, tileH } so the client can:
//      - Drop polygon vertices as ProMeasure pins (replaces manual outline tracing).
//      - Overlay maskB64 as a semi-transparent confirmation layer (optional).
//
// SAM2 model: meta/sam-2 on Replicate.
// Input: image (base64 data URI) + input_points ([[x,y]]) + input_labels ([1]).
// Output: { masks: [url], scores: [float] } — we take the highest-score mask URL.
//
// Cost: ~$0.025/run (same as Roof Visualizer).

export const runtime    = 'nodejs'
export const maxDuration = 120   // SAM2 can take up to 60-90 s cold

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
const REPLICATE_API   = 'https://api.replicate.com/v1'
const MAPS_KEY        = process.env.GOOGLE_SOLAR_API_KEY || ''
const MAPS_STATIC     = 'https://maps.googleapis.com/maps/api/staticmap'

// meta/sam-2 — supports input_points + input_labels for point-prompted segmentation.
// Version pinned (latest as of Oct 2026).
const SAM2_MODEL   = 'meta/sam-2'
const SAM2_VERSION = 'fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83'

const MAX_DIM = 640   // Google Static Maps free-tier cap

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }

// ── Tile fetch ──────────────────────────────────────────────────────────────

async function fetchTileBase64(lat: number, lng: number, zoom: number, w: number, h: number): Promise<{ b64: string; buf: Buffer } | null> {
  const url = `${MAPS_STATIC}?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=1&maptype=satellite&format=png&key=${MAPS_KEY}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) { console.warn(`[sam-segment] staticmap HTTP ${res.status}`); return null }
    const buf = Buffer.from(await res.arrayBuffer())
    const b64 = `data:image/png;base64,${buf.toString('base64')}`
    return { b64, buf }
  } catch (err) {
    console.warn('[sam-segment] tile fetch error:', String(err).slice(0, 120))
    return null
  }
}

// ── SAM2 point-prompted via Replicate ───────────────────────────────────────

async function runSam2PointPrompt(
  imageB64DataUri: string,
  pixelX: number,
  pixelY: number,
): Promise<string | null> {
  const authHeader = {
    'Authorization': `Token ${REPLICATE_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait',   // synchronous response if model is warm (avoids poll loop)
  }

  const body = JSON.stringify({
    version: SAM2_VERSION,
    input: {
      image:          imageB64DataUri,
      input_points:   `[[${Math.round(pixelX)}, ${Math.round(pixelY)}]]`,
      input_labels:   '[1]',   // 1 = foreground
      use_m2m:        true,
    },
  })

  let prediction: any
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST', headers: authHeader, body,
    signal: AbortSignal.timeout(10_000),
  })
  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '')
    throw new Error(`Replicate create failed ${createRes.status}: ${txt.slice(0, 300)}`)
  }
  prediction = await createRes.json()

  // If Prefer:wait returned a finished prediction, skip poll.
  if (prediction.status === 'succeeded') return extractMaskUrl(prediction.output)
  if (prediction.status === 'failed') throw new Error(`SAM2 failed: ${prediction.error}`)

  // Poll
  const pollUrl = prediction.urls?.get
  if (!pollUrl) throw new Error('No poll URL from Replicate')
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(pollUrl, {
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` },
    })
    if (!pollRes.ok) continue
    const poll = await pollRes.json()
    if (poll.status === 'succeeded') return extractMaskUrl(poll.output)
    if (poll.status === 'failed') throw new Error(`SAM2 failed: ${poll.error}`)
  }
  throw new Error('SAM2 timed out after 120s')
}

function extractMaskUrl(output: any): string | null {
  // meta/sam-2 returns: { masks: [url,...], scores: [float,...] }
  // We pick the mask with the highest score (most confident).
  if (!output) return null
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output[0] ?? null          // plain array
  if (output.masks && Array.isArray(output.masks)) {
    const masks: string[] = output.masks
    const scores: number[] = Array.isArray(output.scores) ? output.scores : []
    if (masks.length === 0) return null
    let best = 0
    scores.forEach((s, i) => { if (s > (scores[best] ?? 0)) best = i })
    return masks[best] ?? masks[0]
  }
  if (output.mask) return output.mask
  return null
}

// ── Mask → contour → simplified polygon ─────────────────────────────────────

// Download the mask PNG, extract the binary mask, trace its outer contour,
// and return the simplified vertices as normalised [0..1] pixel coords.
// Algorithm: scanline boundary detection + Douglas-Peucker simplification.

async function maskUrlToContour(
  maskUrl: string,
  imgW: number,
  imgH: number,
  maxVertices = 48,
): Promise<Array<{ nx: number; ny: number }>> {
  const res = await fetch(maskUrl, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`mask fetch HTTP ${res.status}`)
  const maskBuf = Buffer.from(await res.arrayBuffer())

  // Resize to tile dims, extract single-channel raw buffer.
  const raw = await sharp(maskBuf)
    .resize(imgW, imgH, { fit: 'fill' })
    .greyscale()
    .extractChannel(0)
    .raw()
    .toBuffer()

  const threshold = 128
  // Build binary grid.
  const mask = new Uint8Array(imgW * imgH)
  for (let i = 0; i < mask.length; i++) mask[i] = raw[i] > threshold ? 1 : 0

  // Collect boundary pixels (foreground pixel adjacent to background or edge).
  const boundary: Array<[number, number]> = []
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      if (!mask[y * imgW + x]) continue
      const isBoundary =
        x === 0 || x === imgW - 1 || y === 0 || y === imgH - 1 ||
        !mask[y * imgW + (x - 1)] || !mask[y * imgW + (x + 1)] ||
        !mask[(y - 1) * imgW + x] || !mask[(y + 1) * imgW + x]
      if (isBoundary) boundary.push([x, y])
    }
  }

  if (boundary.length === 0) return []

  // Convex-hull approximation for speed + clean polygon (boundary pixels alone
  // are noisy; the convex hull gives a clean eave outline which is what we want
  // for ProMeasure — the footprint perimeter, not concave dormer details).
  const hull = convexHull(boundary)

  // Downsample to maxVertices evenly.
  const step = Math.max(1, Math.floor(hull.length / maxVertices))
  const sampled = hull.filter((_, i) => i % step === 0)

  return sampled.map(([x, y]) => ({ nx: x / imgW, ny: y / imgH }))
}

// Andrew's monotone chain convex hull. Returns hull in CCW order.
function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...pts].sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
  const cross = (O: [number,number], A: [number,number], B: [number,number]) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])

  const lower: Array<[number,number]> = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Array<[number,number]> = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return [...lower, ...upper]
}

// ── Web Mercator unproject ───────────────────────────────────────────────────
// Same math as ProMeasure's suggestRoofLines + LERP back path so coordinates
// land on exactly the same lat/lng grid as the drawn pins.

function buildMercatorTransform(lat: number, lng: number, zoom: number, w: number, h: number) {
  const scale  = Math.pow(2, zoom)
  const worldPx = 256 * scale

  const project = (la: number, ln: number) => {
    const sinY = Math.sin(la * Math.PI / 180)
    return {
      x: (ln + 180) / 360 * worldPx,
      y: (0.5 - Math.log((1 + sinY) / (1 - sinY)) / (4 * Math.PI)) * worldPx,
    }
  }
  const unproject = (x: number, y: number) => {
    const ln = x / worldPx * 360 - 180
    const n  = Math.PI - 2 * Math.PI * y / worldPx
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: ln }
  }

  const ctr = project(lat, lng)
  const x0  = ctr.x - w / 2
  const y0  = ctr.y - h / 2

  return {
    pixelToLatLng: (px: number, py: number) => unproject(x0 + px, y0 + py),
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!REPLICATE_TOKEN) return NextResponse.json({ error: 'Replicate not configured' }, { status: 503 })
  if (!MAPS_KEY)        return NextResponse.json({ error: 'Maps not configured' }, { status: 503 })

  let body: {
    center?: { lat?: number; lng?: number }
    zoom?: number
    width?: number
    height?: number
    tapX?: number   // normalised [0..1] within the tile
    tapY?: number
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const lat  = Number(body.center?.lat)
  const lng  = Number(body.center?.lng)
  const zoom = Math.round(Number(body.zoom) || 0)
  const tapX = Number(body.tapX)
  const tapY = Number(body.tapY)

  if (isNaN(lat) || isNaN(lng) || zoom < 18 || zoom > 22)
    return NextResponse.json({ error: 'center{lat,lng}+zoom(18..22) required' }, { status: 400 })
  if (isNaN(tapX) || isNaN(tapY) || tapX < 0 || tapX > 1 || tapY < 0 || tapY > 1)
    return NextResponse.json({ error: 'tapX and tapY [0..1] required' }, { status: 400 })

  const w = clamp(Math.round(Number(body.width) || MAX_DIM), 200, MAX_DIM)
  const h = clamp(Math.round(Number(body.height) || MAX_DIM), 200, MAX_DIM)

  // 1. Fetch tile
  const tile = await fetchTileBase64(lat, lng, zoom, w, h)
  if (!tile) return NextResponse.json({ error: 'Failed to fetch satellite tile' }, { status: 502 })

  // 2. SAM2 point-prompt
  const pixelX = tapX * w
  const pixelY = tapY * h
  let maskUrl: string | null
  try {
    maskUrl = await runSam2PointPrompt(tile.b64, pixelX, pixelY)
  } catch (err) {
    const detail = String(err).slice(0, 300)
    console.error('[sam-segment] SAM2 error:', detail)
    return NextResponse.json({ error: 'SAM2 segmentation failed', detail }, { status: 502 })
  }
  if (!maskUrl) return NextResponse.json({ error: 'SAM2 returned no mask' }, { status: 422 })

  // 3. Trace contour
  let contour: Array<{ nx: number; ny: number }>
  try {
    contour = await maskUrlToContour(maskUrl, w, h)
  } catch (err) {
    console.error('[sam-segment] contour error:', err)
    return NextResponse.json({ error: 'Mask processing failed', detail: String(err).slice(0, 200) }, { status: 502 })
  }
  if (contour.length < 3) return NextResponse.json({ error: 'No roof outline detected — try tapping the centre of the roof' }, { status: 422 })

  // 4. Unproject pixel → lat/lng
  const { pixelToLatLng } = buildMercatorTransform(lat, lng, zoom, w, h)
  const polygon = contour.map(({ nx, ny }) => pixelToLatLng(nx * w, ny * h))

  console.log(`[sam-segment] ${polygon.length} vertices, maskUrl=${maskUrl.slice(0, 60)}`)

  return NextResponse.json({
    polygon,          // [{lat, lng}] — drop as ProMeasure pins
    vertexCount: polygon.length,
    maskUrl,          // client can overlay if desired
    tileW: w,
    tileH: h,
  })
}
