import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

// POST /api/promeasure/sam-segment
//
// ASYNC FLOW (Hobby Vercel — 60s function limit):
//   1. POST { center, zoom, width, height, tapX, tapY }
//      → fetches satellite tile, creates Replicate prediction, returns { predictionId, tileParams }
//      → completes in <5s (well under 60s limit)
//   2. Client polls GET /api/promeasure/sam-poll?id=<predictionId> every 3s
//      → each poll <1s; on succeeded, selects the roof mask + traces polygon
//
// SAM2 model: meta/sam-2 on Replicate. Output: { combined_mask, individual_masks[] }.
// We DON'T use combined_mask (union of all segments). We score each individual
// mask by foreground area ratio and pick the one that reads as a single roof,
// then trace its TRUE contour (Moore-neighbour) + simplify (Douglas-Peucker).
// Convex hull was wrong — it fills concave notches (L/T roofs) and engulfs
// adjacent structures (pool cages).
//
// Cost: ~$0.025/run.

export const runtime     = 'nodejs'
export const maxDuration = 30

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

  return NextResponse.json({
    predictionId: pred.id,
    tileParams: { lat, lng, zoom, w, h },
  })
}

// ════════════════════════════════════════════════════════════════════════════
// Mask resolution — shared with the poll route.
// ════════════════════════════════════════════════════════════════════════════

// Gather every candidate mask URL from the Replicate output, individual masks
// first (point-specific), combined_mask LAST (union of all segments — overshoots).
export function gatherMaskUrls(output: any): string[] {
  const urls: string[] = []
  if (!output) return urls
  if (typeof output === 'string') { urls.push(output); return urls }
  if (Array.isArray(output)) { for (const u of output) if (typeof u === 'string') urls.push(u); return urls }
  if (Array.isArray(output.individual_masks)) for (const u of output.individual_masks) if (typeof u === 'string') urls.push(u)
  if (Array.isArray(output.masks))            for (const u of output.masks)            if (typeof u === 'string') urls.push(u)
  if (typeof output.mask === 'string')          urls.push(output.mask)
  if (typeof output.combined_mask === 'string') urls.push(output.combined_mask)  // last resort
  return urls
}

// Download one mask, resize to tile dims, return binary grid + foreground ratio.
async function loadMask(url: string, w: number, h: number): Promise<{ mask: Uint8Array; ratio: number }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`mask fetch HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const raw = await sharp(buf).resize(w, h, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
  const mask = new Uint8Array(w * h)
  let fg = 0
  for (let i = 0; i < mask.length; i++) { mask[i] = raw[i] > 128 ? 1 : 0; if (mask[i]) fg++ }
  return { mask, ratio: fg / (w * h) }
}

// Pick the roof mask by foreground area ratio, then trace + simplify its contour.
// Returns normalised [0..1] vertices. Prefers masks in a plausible roof band;
// a near-whole-tile mask (ground/lot) or a tiny one (vent) is rejected.
export async function resolveRoofPolygonPixels(
  output: any, w: number, h: number, maxVertices = 40,
): Promise<{ contour: Array<{ nx: number; ny: number }>; maskUrl: string | null; ratios: number[] }> {
  const urls = gatherMaskUrls(output)
  if (urls.length === 0) { console.warn('[sam] no mask URLs in output'); return { contour: [], maskUrl: null, ratios: [] } }

  const LO = 0.03, HI = 0.55   // roof plausibly 3–55% of the tile at zoom 21
  const cands: Array<{ url: string; mask: Uint8Array; ratio: number }> = []
  for (const url of urls) {
    try { const { mask, ratio } = await loadMask(url, w, h); cands.push({ url, mask, ratio }) }
    catch (e) { console.warn('[sam] mask load failed', url.slice(0, 60), String(e).slice(0, 80)) }
  }
  if (cands.length === 0) return { contour: [], maskUrl: null, ratios: [] }

  const ratios = cands.map(c => +c.ratio.toFixed(3))
  console.log(`[sam] candidate ratios: [${ratios.join(', ')}]`)

  const inBand = cands.filter(c => c.ratio >= LO && c.ratio <= HI)
  let chosen: { url: string; mask: Uint8Array; ratio: number }
  if (inBand.length) {
    // Largest in-band = the full roof rather than a sub-part (m2m returns nested masks).
    chosen = inBand.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  } else {
    const sorted = [...cands].sort((a, b) => a.ratio - b.ratio)
    // All too big → smallest (least over-reach). Otherwise → largest available.
    chosen = cands.every(c => c.ratio > HI) ? sorted[0] : sorted[sorted.length - 1]
    console.warn(`[sam] no mask in band [${LO},${HI}] — falling back to ratio=${chosen.ratio.toFixed(3)}`)
  }
  console.log(`[sam] chose ratio=${chosen.ratio.toFixed(3)} url=${chosen.url.slice(0, 60)}`)

  const contour = traceAndSimplify(chosen.mask, w, h, maxVertices)
  return { contour, maskUrl: chosen.url, ratios }
}

// ── Contour trace (Moore-neighbour) + Douglas-Peucker simplify ───────────────

function traceAndSimplify(mask: Uint8Array, w: number, h: number, maxVertices: number): Array<{ nx: number; ny: number }> {
  const ring = mooreTrace(mask, w, h)
  if (ring.length < 3) { console.warn('[sam] ring too short:', ring.length); return [] }
  console.log(`[sam] traced ring: ${ring.length} px`)

  let eps = 3
  let simp = rdp(ring, eps)
  let guard = 0
  while (simp.length > maxVertices && guard++ < 10) { eps *= 1.6; simp = rdp(ring, eps) }

  // Drop the duplicate closing vertex (Moore returns to start).
  if (simp.length > 1) {
    const a = simp[0], b = simp[simp.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) simp = simp.slice(0, -1)
  }
  console.log(`[sam] simplified: ${simp.length} vertices (eps=${eps.toFixed(1)})`)
  return simp.map(([x, y]) => ({ nx: x / w, ny: y / h }))
}

// Moore-neighbour boundary tracing — follows the true outer contour of the blob
// containing the topmost-leftmost foreground pixel. Backtrack = last background
// pixel checked before each boundary step.
function mooreTrace(mask: Uint8Array, w: number, h: number): Array<[number, number]> {
  const idx = (x: number, y: number) => y * w + x
  const inb = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h
  const fg  = (x: number, y: number) => inb(x, y) && mask[idx(x, y)] === 1

  let sx = -1, sy = -1
  for (let y = 0; y < h && sy < 0; y++) for (let x = 0; x < w; x++) { if (fg(x, y)) { sx = x; sy = y; break } }
  if (sx < 0) return []

  // 8 neighbours clockwise: W, NW, N, NE, E, SE, S, SW
  const dirs: Array<[number, number]> = [[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1]]
  const dirOf = (px: number, py: number, qx: number, qy: number) => {
    const dx = qx - px, dy = qy - py
    for (let i = 0; i < 8; i++) if (dirs[i][0] === dx && dirs[i][1] === dy) return i
    return 0
  }

  const contour: Array<[number, number]> = [[sx, sy]]
  let px = sx, py = sy
  let bx = sx - 1, by = sy   // backtrack starts west (background — start is leftmost on its row)
  const maxSteps = 8 * (w + h) * 4

  for (let step = 0; step < maxSteps; step++) {
    const b = dirOf(px, py, bx, by)
    let found = false
    for (let i = 1; i <= 8; i++) {
      const d  = (b + i) % 8
      const nx = px + dirs[d][0], ny = py + dirs[d][1]
      if (fg(nx, ny)) {
        const pb = (d + 7) % 8                 // previous (background) neighbour → new backtrack
        bx = px + dirs[pb][0]; by = py + dirs[pb][1]
        px = nx; py = ny
        contour.push([px, py])
        found = true
        break
      }
    }
    if (!found) break                          // isolated pixel
    if (px === sx && py === sy) break           // closed the loop
  }
  return contour
}

// Douglas-Peucker polyline simplification (perpendicular distance to the chord).
function rdp(points: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (points.length < 3) return points
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const dx = bx - ax, dy = by - ay
  const len = Math.sqrt(dx * dx + dy * dy)

  let dmax = 0, index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]
    const d = len === 0
      ? Math.hypot(x - ax, y - ay)
      : Math.abs(dy * x - dx * y + bx * ay - by * ax) / len
    if (d > dmax) { dmax = d; index = i }
  }

  if (dmax > eps) {
    const left  = rdp(points.slice(0, index + 1), eps)
    const right = rdp(points.slice(index), eps)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[points.length - 1]]
}

// ── Web Mercator unproject ───────────────────────────────────────────────────

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
