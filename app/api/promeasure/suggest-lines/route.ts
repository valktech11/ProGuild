import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

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

const PROMPT_HEAD = `You are analyzing a top-down satellite image of ONE residential roof, centered in frame.`

function buildPrompt(polyNorm: Pt[] | null): string {
  const boundary = polyNorm && polyNorm.length >= 3
    ? `\nThe roof's OUTER OUTLINE (eaves/rakes) is already known — these normalized vertices bound the roof:\n${JSON.stringify(polyNorm.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) })))}\nIdentify ridge/hip/valley lines that lie INSIDE this outline only. Do NOT draw lines outside it. The outline edges themselves are eaves/rakes — do not return those.`
    : ''
  return `${PROMPT_HEAD}${boundary}
Identify only the INTERIOR crease lines:
- ridge: horizontal peak where two opposing slopes meet (near the roof's interior, not the outline)
- hip: diagonal from a ridge end OUT to an outside corner of the outline (convex)
- valley: diagonal where two slopes meet inward (concave), typically at L/T wing junctions

Geometry rules:
- Every hip ends AT an outline corner and starts at a ridge end or peak.
- Ridges run between two interior peak points.
- Lines sharing a peak MUST share that exact endpoint (convergence).
- Stay strictly inside the given outline.

Use normalised coords (0,0)=top-left, (1,1)=bottom-right.
Respond ONLY with valid JSON, no markdown/prose:
{"lines":[{"type":"ridge","x1":0.40,"y1":0.45,"x2":0.55,"y2":0.45,"confidence":0.9}]}
Rules: only ridge/hip/valley; endpoints 3 decimals; confidence 0..1; omit unclear lines.`
}

async function callGemini(base64Jpeg: string, polyNorm: Pt[] | null): Promise<SuggestedLine[] | null> {
  if (!GEMINI_KEY || !base64Jpeg) return null
  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(polyNorm) }, { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.1,
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
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error(`[suggest-lines] gemini HTTP ${res.status}:`, errText.slice(0, 300)); return null
  }

  let json: unknown
  try { json = await res.json() } catch { console.warn('[suggest-lines] gemini JSON parse error'); return null }

  const raw = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> }
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) {
    const fr = raw.candidates?.[0]?.finishReason
    console.warn(`[suggest-lines] gemini empty response (finishReason=${fr ?? 'none'})`); return null
  }

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

  let body: { center?: { lat?: number; lng?: number }; zoom?: number; width?: number; height?: number; polygon?: Pt[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const lat = Number(body.center?.lat), lng = Number(body.center?.lng)
  const zoom = Math.round(Number(body.zoom) || 0)
  if (isNaN(lat) || isNaN(lng) || zoom < 18 || zoom > 22) {
    return NextResponse.json({ error: 'center{lat,lng}+zoom(18..22) required' }, { status: 400 })
  }

  const w = clamp(Math.round(Number(body.width) || MAX_DIM), 200, MAX_DIM)
  const h = clamp(Math.round(Number(body.height) || MAX_DIM), 200, MAX_DIM)

  // Normalized polygon (client maps its drawn pins to the same capture tile).
  const polyNorm: Pt[] | null = Array.isArray(body.polygon)
    ? body.polygon.map(p => ({ x: clamp(Number(p.x), 0, 1), y: clamp(Number(p.y), 0, 1) })).filter(p => !isNaN(p.x) && !isNaN(p.y))
    : null

  // scale=2 → 2x pixel density (sharper creases for Gemini; geometry unchanged).
  const url = `${MAPS_STATIC}?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=2&maptype=satellite&format=jpg&key=${MAPS_KEY}`
  const base64 = await fetchJpegBase64(url)
  if (!base64) return NextResponse.json({ error: 'capture failed' }, { status: 502 })

  const lines = await callGemini(base64, polyNorm)
  if (lines === null) return NextResponse.json({ error: 'suggestion failed' }, { status: 502 })

  return NextResponse.json({ lines, capture: { width: w, height: h, zoom } })
}
