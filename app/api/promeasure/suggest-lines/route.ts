import { NextRequest, NextResponse } from 'next/server'

// ── ProMeasure Gemini line-suggestion (Slice A) ─────────────────────────────
// Captures the current map viewport via Static Maps, asks Gemini 2.5-flash Vision
// to locate ridge/hip/valley creases as normalized line segments. AI PROPOSES
// only — the human drags endpoints to the true crease and computeLength produces
// the authoritative LF. Gemini never asserts a measurement; it returns coords +
// confidence. Guardrail: typed dashed guides, human confirms (source:'gemini_adjusted').

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const MAPS_KEY   = process.env.GOOGLE_SOLAR_API_KEY || ''
const GEMINI_TIMEOUT_MS = 25_000
const MAPS_STATIC = 'https://maps.googleapis.com/maps/api/staticmap'

// Static Maps free-tier caps at 640×640 (scale=1). Clamp request dims to that
// box; ProMeasure normalizes against the returned aspect ratio either way.
const MAX_DIM = 640

type Pt = { x: number; y: number }
type SuggestedLine = { type: 'ridge' | 'hip' | 'valley'; x1: number; y1: number; x2: number; y2: number; confidence: number }

const VALID_TYPES = new Set(['ridge', 'hip', 'valley'])

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }

async function fetchJpegBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) { console.warn(`[suggest-lines] staticmap HTTP ${res.status}`); return null }
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.toString('base64')
  } catch (err) {
    console.warn('[suggest-lines] staticmap fetch error:', String(err).slice(0, 100))
    return null
  }
}

const PROMPT = `You are analyzing a top-down satellite image of a single residential roof, centered in frame.
Identify the roof's RIDGE, HIP, and VALLEY lines — the creases between roof planes. Ignore eaves, rakes, gutters, trees, driveways, neighbouring roofs, and shadows.

Definitions:
- ridge: horizontal peak line where two opposing slopes meet at the top
- hip: diagonal line running down from a ridge/peak to an outside corner (convex)
- valley: diagonal channel where two slopes meet in an inward (concave) trough

Method: First locate the central peak(s) and ridge(s). Hips radiate DOWN-AND-OUT from ridge ends to the building's outer corners. Valleys form where two roof sections meet inward (often at L/T-shaped wings). Lines should CONVERGE at shared intersection points — a hip and ridge meeting at a peak share that endpoint.

Use normalised coordinates: (0,0)=top-left, (1,1)=bottom-right of the image.

Respond ONLY with valid JSON — no markdown, no code fences, no prose:
{"lines":[{"type":"ridge","x1":0.40,"y1":0.45,"x2":0.55,"y2":0.45,"confidence":0.9},{"type":"hip","x1":0.55,"y1":0.45,"x2":0.70,"y2":0.25,"confidence":0.85}]}

Rules:
- Only ridge, hip, valley. No eave/rake/flat.
- Endpoints to 3 decimals. confidence 0..1.
- Lines sharing a peak/intersection must share that exact endpoint (convergence).
- Omit lines you cannot see clearly rather than guessing.`

async function callGemini(base64Jpeg: string): Promise<SuggestedLine[] | null> {
  if (!GEMINI_KEY || !base64Jpeg) return null
  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } }] }],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.1,
      // Spatial reasoning needs a thinking budget (project-wide default is 0 for
      // text-only calls; this call is the documented exception for geometry).
      thinkingConfig: { thinkingBudget: 1024 },
    },
  })

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) },
    )
  } catch (err) {
    console.warn('[suggest-lines] gemini fetch error:', String(err).slice(0, 100)); return null
  }
  if (!res.ok) { console.warn(`[suggest-lines] gemini HTTP ${res.status}`); return null }

  let json: unknown
  try { json = await res.json() } catch { console.warn('[suggest-lines] gemini JSON parse error'); return null }

  const raw = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) { console.warn('[suggest-lines] gemini empty response'); return null }

  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  let parsed: unknown
  try { parsed = JSON.parse(cleaned) } catch { console.warn('[suggest-lines] parse failed:', cleaned.slice(0, 200)); return null }

  return validate(parsed)
}

function validate(raw: unknown): SuggestedLine[] | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.lines)) return null
  const out: SuggestedLine[] = []
  for (const item of r.lines) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    const type = String(l.type ?? '')
    if (!VALID_TYPES.has(type)) continue
    const x1 = Number(l.x1), y1 = Number(l.y1), x2 = Number(l.x2), y2 = Number(l.y2)
    if ([x1, y1, x2, y2].some(n => isNaN(n))) continue
    // Drop degenerate (zero-length) segments.
    if (Math.abs(x1 - x2) < 0.005 && Math.abs(y1 - y2) < 0.005) continue
    out.push({
      type: type as SuggestedLine['type'],
      x1: clamp(x1, 0, 1), y1: clamp(y1, 0, 1), x2: clamp(x2, 0, 1), y2: clamp(y2, 0, 1),
      confidence: clamp(Number(l.confidence) || 0.5, 0, 1),
    })
  }
  return out
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!GEMINI_KEY) return NextResponse.json({ error: 'Gemini not configured' }, { status: 503 })
  if (!MAPS_KEY)   return NextResponse.json({ error: 'Maps not configured' }, { status: 503 })

  let body: { center?: { lat?: number; lng?: number }; zoom?: number; width?: number; height?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const lat = Number(body.center?.lat), lng = Number(body.center?.lng)
  const zoom = Math.round(Number(body.zoom) || 0)
  if (isNaN(lat) || isNaN(lng) || zoom < 18 || zoom > 22) {
    return NextResponse.json({ error: 'center{lat,lng}+zoom(18..22) required' }, { status: 400 })
  }

  // Match capture dims to the live map container (clamped) so normalized coords
  // map 1:1 back onto the map viewport. scale=1 — no Retina doubling.
  const w = clamp(Math.round(Number(body.width) || MAX_DIM), 200, MAX_DIM)
  const h = clamp(Math.round(Number(body.height) || MAX_DIM), 200, MAX_DIM)

  const url = `${MAPS_STATIC}?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=1&maptype=satellite&format=jpg&key=${MAPS_KEY}`
  const base64 = await fetchJpegBase64(url)
  if (!base64) return NextResponse.json({ error: 'capture failed' }, { status: 502 })

  const lines = await callGemini(base64)
  if (lines === null) return NextResponse.json({ error: 'suggestion failed' }, { status: 502 })

  // Echo capture dims so the client LERPs against the exact aspect it requested.
  return NextResponse.json({ lines, capture: { width: w, height: h, zoom } })
}
