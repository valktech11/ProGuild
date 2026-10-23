import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

// POST /api/promeasure/sam-segment
//
// ASYNC FLOW (Hobby Vercel — 60s function limit):
//   1. POST { center, zoom, width, height, tapX, tapY }
//      → fetches satellite tile, creates Replicate prediction, returns { predictionId, pollUrl }
//      → completes in <5s (well under 60s limit)
//   2. Client polls GET /api/promeasure/sam-poll?id=<predictionId> every 3s
//      → each poll is <1s; returns { status:'processing'|'succeeded'|'failed', polygon?, error? }
//      → on succeeded: polygon [{lat,lng}] ready to drop as pins
//
// SAM2 model: meta/sam-2 on Replicate.
// Cost: ~$0.025/run.

export const runtime     = 'nodejs'
export const maxDuration = 30   // only creates prediction + fetches tile; well under 60s

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
const REPLICATE_API   = 'https://api.replicate.com/v1'
const MAPS_KEY        = process.env.GOOGLE_SOLAR_API_KEY || ''
const MAPS_STATIC     = 'https://maps.googleapis.com/maps/api/staticmap'

const SAM2_VERSION = 'fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83'

const MAX_DIM = 640

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }

// ── Tile fetch ──────────────────────────────────────────────────────────────

async function fetchTileBase64(lat: number, lng: number, zoom: number, w: number, h: number): Promise<string | null> {
  const url = `${MAPS_STATIC}?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=1&maptype=satellite&format=png&key=${MAPS_KEY}`
  console.log(`[sam-segment] fetching tile: zoom=${zoom} w=${w} h=${h} lat=${lat.toFixed(5)} lng=${lng.toFixed(5)}`)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) { console.error(`[sam-segment] staticmap HTTP ${res.status}`); return null }
    const buf = Buffer.from(await res.arrayBuffer())
    console.log(`[sam-segment] tile fetched: ${buf.length} bytes`)
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch (err) {
    console.error('[sam-segment] tile fetch error:', String(err).slice(0, 120))
    return null
  }
}

// ── Create Replicate prediction (returns immediately) ───────────────────────

async function createPrediction(imageB64: string, pixelX: number, pixelY: number): Promise<{ id: string; pollUrl: string }> {
  console.log(`[sam-segment] creating prediction: pixelX=${Math.round(pixelX)} pixelY=${Math.round(pixelY)}`)
  const body = JSON.stringify({
    version: SAM2_VERSION,
    input: {
      image:        imageB64,
      input_points: `[[${Math.round(pixelX)}, ${Math.round(pixelY)}]]`,
      input_labels: '[1]',
      use_m2m:      true,
    },
  })

  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`[sam-segment] Replicate create failed ${res.status}: ${text.slice(0, 400)}`)
    throw new Error(`Replicate create failed ${res.status}: ${text.slice(0, 300)}`)
  }

  let prediction: any
  try { prediction = JSON.parse(text) } catch { throw new Error('Replicate create: invalid JSON response') }

  const id      = prediction.id
  const pollUrl = prediction.urls?.get
  if (!id || !pollUrl) {
    console.error('[sam-segment] Replicate response missing id/urls:', JSON.stringify(prediction).slice(0, 200))
    throw new Error('Replicate create: missing prediction id or poll URL')
  }

  console.log(`[sam-segment] prediction created: id=${id} status=${prediction.status}`)
  return { id, pollUrl }
}

// ── Handler: POST — create prediction ───────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!REPLICATE_TOKEN) return NextResponse.json({ error: 'Replicate not configured' }, { status: 503 })
  if (!MAPS_KEY)        return NextResponse.json({ error: 'Maps not configured' }, { status: 503 })

  let body: {
    center?: { lat?: number; lng?: number }
    zoom?: number; width?: number; height?: number
    tapX?: number; tapY?: number
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

  const w = clamp(Math.round(Number(body.width)  || MAX_DIM), 200, MAX_DIM)
  const h = clamp(Math.round(Number(body.height) || MAX_DIM), 200, MAX_DIM)

  const imageB64 = await fetchTileBase64(lat, lng, zoom, w, h)
  if (!imageB64) return NextResponse.json({ error: 'Failed to fetch satellite tile' }, { status: 502 })

  const pixelX = tapX * w
  const pixelY = tapY * h

  let pred: { id: string; pollUrl: string }
  try {
    pred = await createPrediction(imageB64, pixelX, pixelY)
  } catch (err) {
    const detail = String(err).slice(0, 300)
    console.error('[sam-segment] create error:', detail)
    return NextResponse.json({ error: 'Failed to start SAM2', detail }, { status: 502 })
  }

  // Return prediction metadata + tile params so the poll route can unproject.
  return NextResponse.json({
    predictionId: pred.id,
    // Client stores these to pass back to the poll endpoint for unprojection.
    tileParams: { lat, lng, zoom, w, h },
  })
}

// ── Mask → contour helpers (used by poll route) ──────────────────────────────

export function extractMaskUrl(output: any): string | null {
  if (!output) return null
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output[0] ?? null
  if (output.masks && Array.isArray(output.masks)) {
    const masks: string[]  = output.masks
    const scores: number[] = Array.isArray(output.scores) ? output.scores : []
    if (masks.length === 0) return null
    let best = 0
    scores.forEach((s, i) => { if (s > (scores[best] ?? 0)) best = i })
    console.log(`[sam-segment] mask scores: ${scores.map(s=>s.toFixed(3)).join(', ')} → picking index ${best}`)
    return masks[best] ?? masks[0]
  }
  if (output.mask) return output.mask
  console.warn('[sam-segment] unexpected output shape:', JSON.stringify(output).slice(0, 200))
  return null
}

export async function maskUrlToContour(
  maskUrl: string, imgW: number, imgH: number, maxVertices = 48,
): Promise<Array<{ nx: number; ny: number }>> {
  console.log(`[sam-segment] downloading mask: ${maskUrl.slice(0, 80)}`)
  const res = await fetch(maskUrl, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`mask fetch HTTP ${res.status}`)
  const maskBuf = Buffer.from(await res.arrayBuffer())
  console.log(`[sam-segment] mask downloaded: ${maskBuf.length} bytes`)

  const raw = await sharp(maskBuf)
    .resize(imgW, imgH, { fit: 'fill' })
    .greyscale()
    .extractChannel(0)
    .raw()
    .toBuffer()

  const mask = new Uint8Array(imgW * imgH)
  let foregroundCount = 0
  for (let i = 0; i < mask.length; i++) { mask[i] = raw[i] > 128 ? 1 : 0; if (mask[i]) foregroundCount++ }
  console.log(`[sam-segment] mask foreground pixels: ${foregroundCount} / ${imgW * imgH} (${(100*foregroundCount/imgW/imgH).toFixed(1)}%)`)

  const boundary: Array<[number, number]> = []
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      if (!mask[y * imgW + x]) continue
      const isBoundary =
        x === 0 || x === imgW - 1 || y === 0 || y === imgH - 1 ||
        !mask[y * imgW + (x-1)] || !mask[y * imgW + (x+1)] ||
        !mask[(y-1) * imgW + x] || !mask[(y+1) * imgW + x]
      if (isBoundary) boundary.push([x, y])
    }
  }
  console.log(`[sam-segment] boundary pixels: ${boundary.length}`)
  if (boundary.length === 0) return []

  const hull    = convexHull(boundary)
  const step    = Math.max(1, Math.floor(hull.length / maxVertices))
  const sampled = hull.filter((_, i) => i % step === 0)
  console.log(`[sam-segment] hull=${hull.length} vertices → sampled=${sampled.length}`)

  return sampled.map(([x, y]) => ({ nx: x / imgW, ny: y / imgH }))
}

function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...pts].sort(([ax,ay],[bx,by]) => ax-bx || ay-by)
  const cross  = (O:[number,number], A:[number,number], B:[number,number]) =>
    (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0])
  const lower: Array<[number,number]> = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<[number,number]> = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return [...lower, ...upper]
}

export function buildMercatorTransform(lat: number, lng: number, zoom: number, w: number, h: number) {
  const scale   = Math.pow(2, zoom)
  const worldPx = 256 * scale
  const project = (la: number, ln: number) => {
    const sinY = Math.sin(la * Math.PI / 180)
    return { x: (ln+180)/360*worldPx, y: (0.5 - Math.log((1+sinY)/(1-sinY))/(4*Math.PI))*worldPx }
  }
  const unproject = (x: number, y: number) => {
    const ln = x/worldPx*360 - 180
    const n  = Math.PI - 2*Math.PI*y/worldPx
    return { lat: 180/Math.PI * Math.atan(0.5*(Math.exp(n)-Math.exp(-n))), lng: ln }
  }
  const ctr = project(lat, lng)
  return { pixelToLatLng: (px:number, py:number) => unproject(ctr.x - w/2 + px, ctr.y - h/2 + py) }
}
